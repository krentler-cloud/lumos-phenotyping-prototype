"""
Lumos AI — Corpus Pipeline Step 2: Download + Ingest All Papers
================================================================
Reads data/papers_ranked.csv (output of 01_rank_papers.py), downloads
each open-access PDF in relevance order, chunks + embeds with
voyage-3, and batch-upserts directly into Supabase.

Download strategy — 4-tier waterfall (free sources first, paid last):
  Tier 1: Unpaywall API (free) — best OA coverage via repository copies
  Tier 2: PubMed Central direct PDF (free) — for papers with PMCIDs
  Tier 3: Publisher URL from CSV (free, allowlisted domains only)
  Tier 4: OpenAlex hosted PDFs ($0.01 each, budget-capped)

Fully resumable: tracks completed openalex_ids in data/ingestion_checkpoint.json.
Safe to interrupt and restart — already-processed papers are skipped.

Usage:
    python 02_ingest_batch.py
    python 02_ingest_batch.py --limit 1000          # first N papers only
    python 02_ingest_batch.py --tier4-budget 100     # cap OpenAlex spend at $100

Prerequisites:
    pip install -r requirements.txt
    .env file with: VOYAGE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    Optional: OPENALEX_API_KEY (for Tier 4 and faster DOI pre-fetch)
"""

from __future__ import annotations  # enables X | None syntax on Python 3.9

import argparse
import csv
import json
import math
import os
import re
import sys
import time
import urllib.parse
from pathlib import Path

import fitz  # pymupdf
import httpx
import voyageai
from dotenv import load_dotenv
from supabase import create_client, Client
from tqdm import tqdm

load_dotenv(Path(__file__).parent.parent.parent / ".env.local")

# ── Config ────────────────────────────────────────────────────────────────────
VOYAGE_MODEL       = "voyage-3"
EMBED_BATCH_SIZE   = 128
SUPABASE_BATCH     = 200   # rows per insert
DOWNLOAD_TIMEOUT   = 60    # seconds
DOWNLOAD_RETRIES   = 2     # retries per URL (reduced — we have multiple tiers)
MAX_PDF_BYTES      = 50 * 1024 * 1024   # 50 MB
SOURCE_TYPE        = "literature"

# Chunking params — must match lib/pipeline/chunk.ts exactly
TARGET_TOKENS  = 512
OVERLAP_TOKENS = 64

DATA_DIR        = Path(__file__).parent / "data"
RANKED_FILE     = DATA_DIR / "papers_ranked.csv"
CHECKPOINT_FILE = DATA_DIR / "ingestion_checkpoint.json"
FAILED_FILE     = DATA_DIR / "ingestion_failed.jsonl"

# Tier 3: allowlisted publisher domains that serve real PDFs to automated clients
TIER3_ALLOWLIST = [
    "mdpi.com",
    "link.springer.com/content/pdf/",
    "frontiersin.org",
    "arxiv.org/pdf/",
    "europepmc.org",
    "journals.plos.org",
    "www.dovepress.com",
]

# Tier 3: domains to skip (Cloudflare-blocked, landing pages, DOI redirects)
TIER3_BLOCKLIST = [
    "doi.org",
    "sciencedirect.com",
    "wiley.com",
    "nature.com",
    "oup.com",
    "cambridge.org",
    "handle.net",
    "doaj.org",
]


# ── Chunking (mirrors lib/pipeline/chunk.ts) ──────────────────────────────────

def chars_per_token(sample: str) -> float:
    cjk_count = sum(1 for c in sample if '\u3000' <= c <= '\u9FFF' or
                    '\uF900' <= c <= '\uFAFF' or '\uFF00' <= c <= '\uFFEF')
    ratio = cjk_count / max(len(sample), 1)
    return 4 - ratio * (4 - 1.2)


def chunk_text(text: str) -> list[dict]:
    normalised = re.sub(r'\r\n', '\n', text)
    normalised = re.sub(r'\n{3,}', '\n\n', normalised).strip()
    sample = normalised[:2000]
    cpt = chars_per_token(sample)
    target_chars  = round(TARGET_TOKENS * cpt)
    overlap_chars = round(OVERLAP_TOKENS * cpt)
    paragraphs = [p.strip() for p in re.split(r'\n\n+', normalised) if p.strip()]

    chunks: list[dict] = []
    current = ""

    def flush(content: str):
        if content.strip():
            chunks.append({
                "content": content.strip(),
                "index": len(chunks),
                "token_estimate": math.ceil(len(content) / chars_per_token(content)),
            })

    for para in paragraphs:
        if len(para) > target_chars:
            flush(current)
            current = ""
            start = 0
            while start < len(para):
                end = start + target_chars
                flush(para[start:end])
                start = end - overlap_chars
        elif current and len(current) + 2 + len(para) > target_chars:
            flush(current)
            current = current[-overlap_chars:] + "\n\n" + para
        else:
            current = (current + "\n\n" + para).lstrip("\n") if current else para

    flush(current)
    return chunks


# ── DOI Pre-fetch ────────────────────────────────────────────────────────────

def prefetch_dois(paper_ids: list[str], client: httpx.Client) -> dict[str, dict]:
    """Batch-fetch DOIs and PMCIDs from OpenAlex API.
    Returns dict of openalex_id → {doi, pmcid, pmid}."""

    api_key = os.environ.get("OPENALEX_API_KEY", "")
    lookup: dict[str, dict] = {}
    batch_size = 50

    batches = [paper_ids[i:i + batch_size] for i in range(0, len(paper_ids), batch_size)]

    print(f"Pre-fetching DOIs for {len(paper_ids):,} papers ({len(batches):,} API calls)...")

    for batch_idx, batch in enumerate(batches):
        filter_str = "|".join(batch)
        params = {
            "filter": f"openalex:{filter_str}",
            "select": "id,doi,ids",
            "per_page": str(batch_size),
        }
        if api_key:
            params["api_key"] = api_key

        try:
            r = client.get(
                "https://api.openalex.org/works",
                params=params,
                timeout=30,
                headers={"User-Agent": "LumosAI/1.0 (engineering@headlamp.com)"},
            )
            if r.status_code == 200:
                data = r.json()
                for work in data.get("results", []):
                    # Strip URL prefix from ID to match CSV format
                    oid = work["id"].replace("https://openalex.org/", "")
                    doi_raw = work.get("doi", "") or ""
                    doi = doi_raw.replace("https://doi.org/", "").replace("http://doi.org/", "")
                    ids = work.get("ids", {}) or {}
                    pmcid_raw = ids.get("pmcid", "") or ""
                    pmcid = pmcid_raw.replace("https://www.ncbi.nlm.nih.gov/pmc/articles/", "").rstrip("/")
                    lookup[oid] = {
                        "doi": doi if doi else None,
                        "pmcid": pmcid if pmcid else None,
                        "pmid": (ids.get("pmid", "") or "").replace("https://pubmed.ncbi.nlm.nih.gov/", "").rstrip("/") or None,
                    }
            else:
                # Rate limited or error — sleep and continue
                time.sleep(1)
        except Exception:
            time.sleep(1)

        # Progress every 100 batches
        if (batch_idx + 1) % 100 == 0 or batch_idx == len(batches) - 1:
            print(f"  DOI fetch: {batch_idx + 1}/{len(batches)} batches, {len(lookup):,} DOIs found")

        # Respect rate limit (~10 req/s with key, ~1 req/s without)
        time.sleep(0.15 if api_key else 1.1)

    print(f"  DOI pre-fetch complete: {len(lookup):,} papers with metadata")
    with_doi = sum(1 for v in lookup.values() if v["doi"])
    with_pmcid = sum(1 for v in lookup.values() if v["pmcid"])
    print(f"  With DOI: {with_doi:,} | With PMCID: {with_pmcid:,}")

    return lookup


# ── PDF Download — 4-Tier Waterfall ──────────────────────────────────────────

def _try_download_url(url: str, client: httpx.Client) -> bytes | None:
    """Try downloading a single URL. Returns PDF bytes or None."""
    for attempt in range(DOWNLOAD_RETRIES):
        try:
            r = client.get(url, timeout=DOWNLOAD_TIMEOUT, follow_redirects=True)
            r.raise_for_status()

            content_type = r.headers.get("content-type", "").lower()
            is_pdf_content_type = "pdf" in content_type
            is_pdf_magic = r.content[:5] == b"%PDF-"

            if not (is_pdf_content_type or is_pdf_magic):
                return None  # HTML landing page, not a PDF

            if len(r.content) > MAX_PDF_BYTES:
                return None
            if len(r.content) < 1000:
                return None  # Too small to be a real PDF

            return r.content
        except (httpx.HTTPStatusError, httpx.ConnectError, httpx.ReadTimeout,
                httpx.ReadError, httpx.WriteError, httpx.CloseError):
            if attempt < DOWNLOAD_RETRIES - 1:
                time.sleep(2 * (attempt + 1))
        except Exception:
            if attempt < DOWNLOAD_RETRIES - 1:
                time.sleep(2 * (attempt + 1))
    return None


def _normalize_pdf_url(url: str) -> str:
    """Clean up known-broken publisher URL patterns."""
    if "mdpi.com" in url and "?version=" in url:
        url = url.split("?version=")[0]
    return url


def _url_matches_allowlist(url: str) -> bool:
    """Check if URL domain/path matches the Tier 3 allowlist."""
    for pattern in TIER3_BLOCKLIST:
        if pattern in url:
            return False
    for pattern in TIER3_ALLOWLIST:
        if pattern in url:
            return True
    return False


def _tier1_unpaywall(doi: str, client: httpx.Client) -> bytes | None:
    """Tier 1: Query Unpaywall for OA PDF URLs, try downloading each."""
    try:
        r = client.get(
            f"https://api.unpaywall.org/v2/{doi}?email=engineering@headlamp.com",
            timeout=15,
        )
        if r.status_code != 200:
            return None
        data = r.json()

        # Collect all PDF URLs from Unpaywall (best first)
        urls: list[str] = []
        best = data.get("best_oa_location") or {}
        if best.get("url_for_pdf"):
            urls.append(best["url_for_pdf"])
        for loc in data.get("oa_locations", []):
            pdf_url = loc.get("url_for_pdf")
            if pdf_url and pdf_url not in urls:
                urls.append(pdf_url)

        for url in urls:
            url = _normalize_pdf_url(url)
            pdf_bytes = _try_download_url(url, client)
            if pdf_bytes:
                return pdf_bytes
    except Exception:
        pass
    return None


def _tier2_pmc(pmcid: str, client: httpx.Client) -> bytes | None:
    """Tier 2: Download from PubMed Central direct PDF path."""
    url = f"https://pmc.ncbi.nlm.nih.gov/articles/{pmcid}/pdf/"
    return _try_download_url(url, client)


def _tier3_publisher(csv_url: str, client: httpx.Client) -> bytes | None:
    """Tier 3: Try the CSV pdf_url if it's from an allowlisted publisher."""
    if not csv_url or not _url_matches_allowlist(csv_url):
        return None
    url = _normalize_pdf_url(csv_url)
    return _try_download_url(url, client)


def _tier4_openalex(openalex_id: str, client: httpx.Client, api_key: str) -> bytes | None:
    """Tier 4: Download from OpenAlex hosted PDFs ($0.01 each)."""
    url = f"https://content.openalex.org/works/{openalex_id}.pdf?api_key={api_key}"
    return _try_download_url(url, client)


def download_pdf(
    openalex_id: str,
    csv_pdf_url: str,
    doi_info: dict | None,
    client: httpx.Client,
    tier4_api_key: str | None,
    tier4_remaining: int,
) -> tuple[bytes | None, str]:
    """Try 4 tiers in order. Returns (pdf_bytes, tier_name) or (None, 'failed')."""

    doi = (doi_info or {}).get("doi")
    pmcid = (doi_info or {}).get("pmcid")

    # Tier 1: Unpaywall (free, best coverage)
    if doi:
        pdf_bytes = _tier1_unpaywall(doi, client)
        if pdf_bytes:
            return pdf_bytes, "tier1_unpaywall"

    # Tier 2: PubMed Central (free, reliable)
    if pmcid:
        pdf_bytes = _tier2_pmc(pmcid, client)
        if pdf_bytes:
            return pdf_bytes, "tier2_pmc"

    # Tier 3: Publisher URL (free, allowlisted domains only)
    if csv_pdf_url:
        pdf_bytes = _tier3_publisher(csv_pdf_url, client)
        if pdf_bytes:
            return pdf_bytes, "tier3_publisher"

    # Tier 4: OpenAlex hosted PDFs (paid, budget-capped)
    if tier4_api_key and tier4_remaining > 0:
        pdf_bytes = _tier4_openalex(openalex_id, client, tier4_api_key)
        if pdf_bytes:
            return pdf_bytes, "tier4_openalex"

    return None, "failed"


# ── Text extraction ──────────────────────────────────────────────────────────

def extract_text_from_pdf(pdf_bytes: bytes) -> str | None:
    try:
        with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
            pages = [page.get_text() for page in doc]
            text = "\n\n".join(pages)
            text = text.replace("\x00", "").replace("\ufffd", "")
            return text if text.strip() else None
    except Exception:
        return None


# ── Embedding ─────────────────────────────────────────────────────────────────

def embed_chunks(texts: list[str], vo: voyageai.Client) -> list[list[float]]:
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[i:i + EMBED_BATCH_SIZE]
        result = vo.embed(texts=batch, model=VOYAGE_MODEL)
        all_embeddings.extend(result.embeddings)
    return all_embeddings


# ── Checkpoint ────────────────────────────────────────────────────────────────

def load_checkpoint() -> tuple[set[str], dict[str, int]]:
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE) as f:
            data = json.load(f)
            tier_stats = data.get("tier_stats", {})
            return set(data.get("completed", [])), tier_stats
    return set(), {}


def save_checkpoint(completed: set[str], tier_stats: dict[str, int]):
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump({
            "completed": list(completed),
            "count": len(completed),
            "tier_stats": tier_stats,
        }, f)


def log_failure(openalex_id: str, title: str, reason: str):
    with open(FAILED_FILE, "a") as f:
        f.write(json.dumps({"id": openalex_id, "title": title, "reason": reason}) + "\n")


# ── Supabase helpers ──────────────────────────────────────────────────────────

def insert_doc(sb: Client, openalex_id: str, title: str, filename: str,
               char_count: int, chunk_count: int) -> str:
    payload = {
        "title":       title[:500],
        "source_type": SOURCE_TYPE,
        "filename":    filename,
        "status":      "ready",
        "char_count":  char_count,
        "chunk_count": chunk_count,
        "metadata":    {"openalex_id": openalex_id},
    }
    try:
        result = sb.table("corpus_docs").insert(payload).execute()
    except Exception as e:
        raise RuntimeError(f"Supabase insert_doc: {type(e).__name__}: {e}")
    if not result or not hasattr(result, 'data') or not result.data:
        raise RuntimeError(f"Supabase insert_doc returned no data")
    return result.data[0]["id"]


def insert_chunks(sb: Client, doc_id: str, chunks: list[dict],
                  embeddings: list[list[float]]):
    rows = [
        {
            "doc_id":       doc_id,
            "chunk_index":  c["index"],
            "content":      c["content"],
            "embedding":    json.dumps(embeddings[i]),
            "token_count":  c["token_estimate"],
        }
        for i, c in enumerate(chunks)
    ]
    for start in range(0, len(rows), SUPABASE_BATCH):
        batch = rows[start:start + SUPABASE_BATCH]
        try:
            sb.table("corpus_chunks").insert(batch).execute()
        except Exception as e:
            raise RuntimeError(f"Supabase insert_chunks batch {start}: {type(e).__name__}: {e}")


def doc_already_exists(sb: Client, openalex_id: str) -> bool:
    result = sb.table("corpus_docs") \
        .select("id") \
        .eq("metadata->>openalex_id", openalex_id) \
        .limit(1) \
        .execute()
    return bool(result and result.data)


# ── Main ──────────────────────────────────────────────────────────────────────

def process_paper(
    row: dict,
    doi_info: dict | None,
    vo: voyageai.Client,
    sb: Client,
    http: httpx.Client,
    completed: set[str],
    tier4_api_key: str | None,
    tier4_remaining: int,
) -> tuple[str, str]:
    """Process one paper. Returns (status, tier) where status is one of:
    'ok', 'skipped', 'download_fail', 'extract_fail', 'embed_fail', 'db_fail'
    and tier is 'tier1_unpaywall', 'tier2_pmc', 'tier3_publisher', 'tier4_openalex', or 'none'.
    """
    oid   = row["openalex_id"]
    title = row["title"]
    url   = row.get("pdf_url", "")

    if oid in completed:
        return "skipped", "none"

    # Download (4-tier waterfall)
    pdf_bytes, tier = download_pdf(oid, url, doi_info, http, tier4_api_key, tier4_remaining)
    if not pdf_bytes:
        return "download_fail", "none"

    # Extract text
    text = extract_text_from_pdf(pdf_bytes)
    if not text:
        return "extract_fail", tier

    # Chunk
    chunks = chunk_text(text)
    if not chunks:
        return "extract_fail", tier

    # Embed
    try:
        chunk_texts = [c["content"] for c in chunks]
        embeddings = embed_chunks(chunk_texts, vo)
    except Exception as e:
        log_failure(oid, title, f"embed: {e}")
        return "embed_fail", tier

    # Write to Supabase (with retry)
    for db_attempt in range(3):
        try:
            if doc_already_exists(sb, oid):
                completed.add(oid)
                return "skipped", "none"
            filename = re.sub(r"[^a-zA-Z0-9._-]", "_", f"{oid}.pdf")
            doc_id = insert_doc(sb, oid, title, filename, len(text), len(chunks))
            insert_chunks(sb, doc_id, chunks, embeddings)
            break
        except Exception as e:
            if db_attempt < 2:
                time.sleep(2 * (db_attempt + 1))
                continue
            log_failure(oid, title, f"db: {e}")
            return "db_fail", tier

    completed.add(oid)
    return "ok", tier


def main():
    parser = argparse.ArgumentParser(description="Ingest XOLO papers into Lumos corpus")
    parser.add_argument("--limit", type=int, default=None, help="Process first N papers only")
    parser.add_argument("--tier4-budget", type=float, default=150.0,
                        help="Max spend on OpenAlex hosted PDFs in dollars (default: $150)")
    args = parser.parse_args()

    # Check env
    voyage_key = os.environ.get("VOYAGE_API_KEY")
    sb_url     = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    sb_key     = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    openalex_key = os.environ.get("OPENALEX_API_KEY")
    if not all([voyage_key, sb_url, sb_key]):
        sys.exit("Error: set VOYAGE_API_KEY, SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY")

    if not RANKED_FILE.exists():
        sys.exit(f"Error: {RANKED_FILE} not found. Run 01_rank_papers.py first.")

    # Read ranked papers — only downloadable ones, in order
    papers: list[dict] = []
    with open(RANKED_FILE, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["downloadable"].lower() == "true" and row.get("pdf_url"):
                papers.append(row)

    if args.limit:
        papers = papers[:args.limit]

    print(f"Papers to ingest: {len(papers):,}")
    print(f"Tier 4 budget: ${args.tier4_budget:.2f} ({int(args.tier4_budget / 0.01):,} PDFs max)")

    # Init clients
    vo = voyageai.Client(api_key=voyage_key)
    sb = create_client(sb_url, sb_key)

    # Load checkpoint
    completed, tier_stats = load_checkpoint()
    remaining = [p for p in papers if p["openalex_id"] not in completed]
    print(f"Already completed: {len(completed):,} | Remaining: {len(remaining):,}")

    if not remaining:
        print("Nothing to do.")
        return

    # Pre-fetch DOIs and PMCIDs
    remaining_ids = [p["openalex_id"] for p in remaining]
    with httpx.Client(follow_redirects=True, timeout=30) as doi_client:
        doi_lookup = prefetch_dois(remaining_ids, doi_client)

    # Stats
    counts = {
        "ok": 0, "skipped": 0, "download_fail": 0,
        "extract_fail": 0, "embed_fail": 0, "db_fail": 0,
    }
    # Merge with checkpoint tier stats
    if not tier_stats:
        tier_stats = {"tier1_unpaywall": 0, "tier2_pmc": 0, "tier3_publisher": 0, "tier4_openalex": 0}

    tier4_max = int(args.tier4_budget / 0.01)
    tier4_used = tier_stats.get("tier4_openalex", 0)

    checkpoint_every = 50

    with httpx.Client(
        headers={"User-Agent": "LumosAI/1.0 (engineering@headlamp.com)"},
        follow_redirects=True,
        timeout=DOWNLOAD_TIMEOUT,
    ) as http_client, \
         tqdm(total=len(remaining), desc="Ingesting", unit="paper") as pbar:

        processed_since_checkpoint = 0
        for row in remaining:
            oid = row["openalex_id"]
            doi_info = doi_lookup.get(oid)

            status, tier = process_paper(
                row, doi_info, vo, sb, http_client, completed,
                tier4_api_key=openalex_key,
                tier4_remaining=tier4_max - tier4_used,
            )

            counts[status] = counts.get(status, 0) + 1

            if status == "ok" and tier != "none":
                tier_stats[tier] = tier_stats.get(tier, 0) + 1
                if tier == "tier4_openalex":
                    tier4_used += 1

            if status not in ("skipped", "ok"):
                log_failure(oid, row["title"], f"{status} (tier reached: {tier})")

            processed_since_checkpoint += 1
            if processed_since_checkpoint >= checkpoint_every:
                save_checkpoint(completed, tier_stats)
                processed_since_checkpoint = 0

            total_ok = counts["ok"]
            total_fail = counts["download_fail"] + counts["extract_fail"] + counts["embed_fail"] + counts["db_fail"]
            pbar.set_postfix({"ok": total_ok, "fail": total_fail, "t4$": f"${tier4_used * 0.01:.2f}"})
            pbar.update(1)

    # Final checkpoint
    save_checkpoint(completed, tier_stats)

    # Summary
    total = sum(counts.values())
    print(f"\n{'='*60}")
    print(f"INGESTION COMPLETE — {counts['ok']:,} papers ingested")
    print(f"{'='*60}")
    print(f"\nTier coverage:")
    for tier_name, label in [
        ("tier1_unpaywall", "Tier 1 (Unpaywall)"),
        ("tier2_pmc",       "Tier 2 (PMC)"),
        ("tier3_publisher", "Tier 3 (Publisher)"),
        ("tier4_openalex",  "Tier 4 (OpenAlex)"),
    ]:
        n = tier_stats.get(tier_name, 0)
        pct = f"{n/max(counts['ok'],1)*100:.0f}%" if counts['ok'] > 0 else "—"
        cost = f" — ${n * 0.01:.2f} spent" if tier_name == "tier4_openalex" and n > 0 else ""
        print(f"  {label:25s} {n:>6,} ({pct}){cost}")

    print(f"\nResults:")
    print(f"  Ingested:       {counts['ok']:,}")
    print(f"  Skipped:        {counts['skipped']:,}")
    print(f"  Download fail:  {counts['download_fail']:,}")
    print(f"  Extract fail:   {counts['extract_fail']:,}")
    print(f"  Embed fail:     {counts['embed_fail']:,}")
    print(f"  DB fail:        {counts['db_fail']:,}")
    print(f"  Failures log:   {FAILED_FILE}")

    if counts['ok'] > 100:
        print(f"\nNext: rebuild pgvector IVFFlat index in Supabase SQL editor:")
        print("  DROP INDEX IF EXISTS corpus_chunks_embedding_idx;")
        print("  CREATE INDEX ON corpus_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 500);")


if __name__ == "__main__":
    main()
