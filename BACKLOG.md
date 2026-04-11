# Lumos AI — Backlog

Items are grouped by priority. Start a session by saying "check the backlog" and Claude Code will pick up from here.

---

## Now (next session)

- [ ] **Redesign Study Overview page to clearly articulate what we're doing**
  The Study Overview page (`app/studies/[studyId]/overview/page.tsx`) needs to clearly communicate:
  - What Lumos AI does (phenotype prediction for clinical trial enrichment)
  - The two-phase structure: Planning Phase (corpus-only, no patients) → Clinical Analysis (real patient data)
  - The study design: N=80 total (16 MDD efficacy patients + 64 healthy volunteers in SAD/MAD)
  - What the pipeline actually does now (rerank+compress, evidence brief, Opus synthesis)
  - Current corpus stats (live from DB)
  Review the existing page and make it a compelling, accurate description of the platform for the MBA/PhD audience.

- [ ] **Run Supabase migration 011 (study design columns)**
  Add `mdd_n` and `healthy_volunteer_n` columns. SQL ready in `supabase/migrations/011_study_design.sql`.
  Quick paste in Supabase SQL Editor — non-breaking, has defaults.
  ```sql
  ALTER TABLE studies ADD COLUMN IF NOT EXISTS mdd_n int DEFAULT 16;
  ALTER TABLE studies ADD COLUMN IF NOT EXISTS healthy_volunteer_n int DEFAULT 64;
  UPDATE studies SET mdd_n = 16, healthy_volunteer_n = 64
  WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  ```

---

## ML Engine Upgrade (Track F)
*See: [LumosAI Phenotyping Engine Upgrade](https://docs.google.com/document/d/1ExDn4FmjqnzwDCyWaP4odk70MAQ9AWEbKiz772Yc8hs)*

- [ ] **F-1: Phase 1 distribution outputs — replace point estimates with (mean, σ, N, study count)**
  Add `biomarker_distributions` to output schema. Opus extracts quantitative distributions from corpus. UI displays alongside dimension prose.
  **Dependency:** P2-F done ✓. Distributions will be sparse with ~150 docs — quality improves as E-2 ingests papers.

- [ ] **F-2: Phase 1 distributions as Bayesian priors for Phase 2**
  Replace threshold-based subtype assignment with likelihood-ratio approach using Phase 1 distributions.
  **Dependency:** F-1 must ship first.

- [ ] **F-4: Evidence quality weighting in priors**
  Weight studies by source type (RCT 1.0 → case report 0.2). Track `evidence_quality_score` per biomarker.
  **Dependency:** F-1 and F-2 must ship first.

---

## Soon

- [ ] **Voyage AI Phase B (multimodal image rendering)**
  Use `voyage-multimodal-3` via `/multimodalembeddings` endpoint. Render PDF pages as images alongside extracted text. Unlocks retrieval against figures, dose-response curves, forest plots.

- [ ] **Genetic evidence context (P3-F)**
  Prompt guard to distinguish GWAS risk association from treatment response prediction when citing genetic evidence.

- [ ] **SCIENCE-FEEDBACK markers: audit and resolve**
  ~25 markers scattered across codebase. Audit each and either implement or document why deferred.

---

## Large-Scale Corpus Expansion (Track E — XOLO Papers, all ~159K)
*P2-F Voyage migration complete ✓. Rerank+compress pipeline complete ✓. Supabase upgraded to Pro ✓.*

- [x] **E-0: Prerequisites** ✓
  - [x] XOLO Papers Google Sheet exported as CSV (`data/xolo_papers.csv`, 159,094 IDs)
  - [x] OpenAlex API key obtained
  - [x] P2-F Voyage AI migration ✓
  - [x] `scripts/corpus-pipeline/` directory ✓
  - [x] Rerank+compress pipeline ✓
  - [x] Supabase upgraded to Pro plan ✓

- [x] **E-1: Assessment + relevance ranking** ✓ (April 11, 2026)
  `scripts/corpus-pipeline/01_rank_papers.py` — 159,094 papers fetched, 96K with abstracts embedded with voyage-3, ranked by phenotype relevance. Output: `data/papers_ranked.csv`. Top hit: "Combined Detection of Serum Brain-Derived Neurotrophic Factor and Interleukin-6" (0.6944 relevance).

- [ ] **E-2: Full corpus ingest — all ~159K papers** *(4-tier waterfall implemented, ready for test run)*
  `scripts/corpus-pipeline/02_ingest_batch.py` — ingests in ranked order, fully resumable via checkpoint.

  **4-tier waterfall implemented and tested (April 11, 2026):**
  1. **Unpaywall API** (free) — queries by DOI, gets OA repo copies. ~13% of successes in testing.
  2. **PubMed Central direct PDF** (free) — for papers with PMCIDs. 0% in initial test (top-ranked papers lack PMCIDs).
  3. **Direct publisher URL** (free, allowlisted domains only) — mdpi.com, springer.com, frontiersin.org, arxiv.org, plos.org. 0% in test (most publishers block automated access via Cloudflare).
  4. **OpenAlex hosted PDFs** ($0.01/PDF) — `content.openalex.org` direct API. **87% of successes** — the primary source. Budget-capped via `--tier4-budget` CLI arg (default $150).

  **Test results (50 papers):** 15 ingested (30%), 0 DB/embed/extract failures, $0.13 spent on Tier 4.
  Tier 4 (OpenAlex) is the main workhorse. The 70% failure rate = genuinely paywalled papers with no OA version.

  **Pre-fetch step:** DOIs + PMCIDs batch-fetched from OpenAlex API at startup (50 per call, ~3 min for 85K papers).

  **Fixes applied:**
  - `doc_already_exists()` uses `.limit(1)` not `.maybe_single()` (was returning None and crashing)
  - DB insert retry (3 attempts with backoff)
  - MDPI URL normalization (strip `?version=`)
  - All previous fixes preserved (voyage-3, vo.embed(), sequential processing, Python 3.9 compat)

  **Next step:** Test run with `--limit 1000 --tier4-budget 10` (~$10 spend, ~300 papers expected to ingest). Verify:
  - Pipeline runs stably for 1000 papers without crashing
  - Embedding costs are in line (~$0.06 for 300 papers × 30 chunks × 512 tokens)
  - Supabase handles the volume (should be ~9,000 new chunks)
  - Checkpoint/resume works if interrupted
  - Run: `cd scripts/corpus-pipeline && python3 02_ingest_batch.py --limit 1000 --tier4-budget 10`
  
  **After test run:** Review tier stats, check ingestion_failed.jsonl for patterns, then decide on full run budget.
  **Full run estimate:** ~85K downloadable × 30% success = ~25K papers, ~750K chunks, ~$250 OpenAlex spend, ~$4 embedding cost, ~8 hour run.

- [ ] **E-2b: Generate "missing high-relevance papers" report for manual retrieval**
  After the E-2 ingestion run completes, generate a prioritized list of the highest-relevance papers that failed all 4 download tiers. These are paywalled papers with no OA version — the most valuable gaps in the corpus.
  - Script: read `data/ingestion_failed.jsonl`, cross-reference with `data/papers_ranked.csv` for relevance scores
  - Output: CSV sorted by relevance score with columns: rank, openalex_id, title, relevance_score, doi, failure_reason
  - Top 50-100 papers can be retrieved manually via: university library access (anyone on Headlamp team with institutional login), author preprints on bioRxiv/medRxiv/ResearchGate, or interlibrary loan
  - Upload recovered PDFs via the existing corpus ingest UI (`/api/corpus/ingest`)

- [ ] **E-3: Qdrant migration (decision gate at ~25K papers)**
  Evaluate Qdrant Cloud vs. pgvector with HNSW index at scale.
  **April 11 assessment:** At 2.6M vectors with single concurrent user, pgvector and Qdrant have equivalent query latency. Qdrant's throughput advantage only matters at 50M+ vectors or under concurrent load. Stay on Supabase Pro for now. Triggers to revisit: query latency >500ms, storage overages >$50/month, or concurrent users.

---

## Later

- [ ] **Study ingestion module — multi-study support**
  Currently the platform is hardcoded for the Xylo Bio XYL-1001 study: seed data in migration 005, trial_size/mdd_n/healthy_volunteer_n hardcoded, SAD/MAD cohort data tied to one study. For Lumos AI to support arbitrary clients and drugs, need:
  - Study creation flow: UI or API to create a new study with drug name, indication, sponsor, trial design (total N, MDD N, healthy N, phase structure)
  - IND document ingestion: upload IND package per study → auto-extract mechanism context (currently pre-seeded in DB)
  - Study-scoped corpus: filter or tag corpus docs by study relevance (currently all docs are shared across all studies)
  - Study-scoped patients: patient enrollment and data entry per study
  - Multi-study dashboard: list studies, switch between them
  **Not needed for Xylo Bio prototype — this is for the product roadmap when onboarding a second client.**

- [ ] **Async job queue for long-running synthesis**
- [ ] **Polygenic Risk Score (PRS)** — blocked on real genotype data (N ≥ 50)
- [ ] **In silico twin** — blocked on labeled dataset (N ≥ 300)

---

## Known Tech Debt

- `app/api/runs/` legacy routes — assess whether still needed or safe to remove
- Processing page escape hatch timer is 90 seconds — should be 3-4 minutes
- Dynamic chunk count scaling — the rerank+compress pipeline mitigates this (broad retrieval → rerank selects best), but retrieval params (100 finalK, 150 rawPerAspect) may need tuning as corpus grows past 10K papers

---

## Completed

- [x] **Fix vector search timeout for 13K+ chunk corpus** — April 11, 2026
  Corpus grew from ~150 docs to 248 docs / 13K chunks — IVFFlat search exceeded default 8s Postgres statement_timeout. Migration 012: `ALTER ROLE authenticator/anon SET statement_timeout = '30s'`. Also added 30s fetch timeout on service client. Planning Phase analysis confirmed working after fix.

- [x] **E-2 ingestion script: 4-tier waterfall + timeout fix** — April 11, 2026
  Rewrote download logic with Unpaywall → PMC → Publisher → OpenAlex waterfall. Pre-fetches DOIs in batches. Fixed doc_already_exists crash (.maybe_single() → .limit(1)). Fixed vector search timeout (migration 012: statement_timeout → 30s, fetch timeout → 30s). Tested: 15/50 papers ingested, 0 DB failures. Corpus at 248 docs / 13K chunks and growing.
  
- [x] **Fix vector search timeout for 13K+ chunk corpus** — April 11, 2026
  IVFFlat search exceeded default 8s Postgres statement_timeout after corpus grew to 248 docs / 13K chunks. Fix: migration 012 (ALTER ROLE authenticator/anon SET statement_timeout = '30s') + 30s fetch timeout on service client. Planning Phase analysis confirmed working on larger corpus.

- [x] **Update pipeline descriptions** — April 10, 2026
  Processing page, landing page Phase1Steps, suggested questions — all updated to reflect current architecture (phenotype aspects, 1024 dims, reranking, compression). Removed all "Claude" references. Time estimates: 3-5 min.

- [x] **Add generation timestamps to report headers** — April 10, 2026
  Both reports now show "Generated Apr 10, 2026 at 2:34 PM" with local timezone.

- [x] **Study design N=80 + dynamic patient counts** — April 10, 2026
  Migration 011 adds mdd_n/healthy_volunteer_n columns. All hardcoded N=16 in synthesis prompts, UI, and ML code replaced with dynamic counts from patient data. Phase 2 processing page time estimate updated.

- [x] **F-3: Posterior confidence intervals** — April 10, 2026
  Beta distribution 80% credible intervals computed from posterior parameters. PosteriorBadge shows "62% [48-75%]". Normal approximation to Beta quantile (accurate to ~1% for our parameter range).

- [x] **Retrieve → Rerank → Compress → Synthesize pipeline** — April 10, 2026
  Full production RAG pipeline. First validated run: 127s Opus, 8,204 input tokens.

- [x] **P2-F: Retrieval aspect rewrite + Voyage AI migration** — April 10, 2026
- [x] **F-5: Fix synthesis prompt — phantom ensemble → real methodology** — April 10, 2026
- [x] **F-6: Fix Subtype C concordance inflation** — April 10, 2026
- [x] **Parallelize synthesis calls + exploratory biomarkers to Sonnet** — April 10, 2026
- [x] **Opus synthesis diagnostics in step_log** — April 10, 2026
- [x] **Streaming token progress during Phenotype synthesis** — April 10, 2026
- [x] **Phase 2 processing page: live corpus stats + corrected descriptions**
- [x] **Verify analysis runs end-to-end after direct-function-call fix**
- [x] **Guard Phase 2 from running while Phase 1 is processing** — April 10, 2026
  API returns 409 if Phase 1 is processing/queued. UI replaces run button with warning banner.

- [x] **Fix Ask LumosAI platform facts + add reranking to all chat routes** — April 10, 2026
  Chat was saying "Lumos AI does not use a reranking step" because system prompt described old architecture. Rewrote PLATFORM FACTS block with full pipeline description (reranking, compression, phenotype aspects). Added reranking to legacy runs/[runId]/chat route (was raw similarity only). Added PageContextDispatcher to processing page. Fixed stale "SHAP" reference in subtyping suggested questions.

- [x] **Fix Opus stall detection + auto-retry** — April 10, 2026
  ROOT CAUSE FOUND: `AbortController.abort()` does NOT break a stalled `ReadableStream` in Node.js. Once `fetch()` returns and streaming begins, aborting the signal has no effect — `reader.read()` hangs forever. This is why every "stuck" run hung indefinitely — the 10-minute timeout called abort() but it did nothing.
  FIX: `Promise.race` — race `finalMessage()` against a stall-timeout promise. When no tokens arrive for 60s, stall promise rejects and calls `phenotypeStream.abort()` (MessageStream's own method which rejects the internal endPromise). Retries up to 3 times. Progress shows "stalled at ~3,316 tokens — retrying (attempt 2/3)..."

---

## Session Log — April 10, 2026

**What was done (22 items):**
1. P2-F: phenotype-oriented aspects + Voyage AI voyage-3 migration (8,100 chunks re-embedded)
2. F-5: Fixed phantom ensemble in methodology prompt
3. F-6: Predictive concordance (A/B only) alongside overall concordance
4. Supabase migration 010 (1536→1024 dims)
5. OpenAI fully removed (package + Railway env var)
6. `voyageai` SDK removed — embed.ts calls REST API directly
7. Exploratory biomarkers: Opus → Sonnet
8. Exploratory + corpus intelligence: parallel via Promise.all
9. Opus diagnostics in step_log (tokens, duration, prompt size)
10. Streaming token progress every 15s during Phenotype synthesis
11. Full Retrieve → Rerank → Compress → Synthesize pipeline (the big one)
12. Updated all pipeline descriptions (processing page, landing page, suggested questions)
13. Added generation timestamps to report headers (local time)
14. Study design N=80: migration 011 + dynamic patient counts replacing hardcoded N=16
15. F-3: Posterior confidence intervals (80% CI on PosteriorBadge)
16. Redesigned Phase1Steps landing page to reflect current architecture
17. Guard Phase 2 from running while Phase 1 is processing (API 409 + UI warning)
18. Fixed Ask LumosAI platform facts + added reranking to all chat routes + processing page context
19. Fixed root cause of Opus stalls: AbortController doesn't break stalled ReadableStream in Node.js. Replaced with Promise.race + phenotypeStream.abort()
20. Fixed Ask LumosAI platform facts + reranking in all chat routes + processing page context
21. Fixed root cause of stall detection: AbortController.abort() doesn't break stalled ReadableStream in Node.js — replaced with Promise.race + phenotypeStream.abort()
22. Redesign Study Overview page added to backlog + study ingestion module (Later)

**Validated results (last Planning Phase run):**
- Pipeline: 600 raw → 472 deduped → 100 retrieved → 50 reranked → 51 findings → Opus synthesis
- Opus: 127s, 8,204 input tokens, 5,877 output tokens, stop=end_turn
- Evidence compression: 45s (4 parallel Sonnet calls)
- Total pipeline: ~3.5 minutes (was 10+ min before)

**Validated end-to-end (final run of the day):**
- Full pipeline completed successfully: retrieval → rerank → compress → Opus synthesis → store → exploratory + corpus intelligence
- Opus generated past the previous ~3,900 token stall point (reached 5,032 tokens) — stall detected and recovered automatically
- Report generated: 8 exploratory signals, 5 corpus gaps, 4 strengths
- All previous "stuck" runs were caused by Railway redeployments killing the container mid-synthesis (pushes to main during active runs)

**Pending manual steps:**
- Run Supabase migration 011 (study design columns) — see "Now" section above
- The F-3 confidence intervals and Phase 2 guard will show on the next Clinical Analysis run

---

## How to use this file

- When a task is completed, mark it `[x]` and move to Completed with a date and brief summary.
- When starting a new session, say "check the backlog".
- Add items freely — the format is loose on purpose.
