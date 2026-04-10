# Lumos AI — Backlog

Items are grouped by priority. Start a session by saying "check the backlog" and Claude Code will pick up from here.

---

## Now (next session)

- [x] **Phase 2 processing page: live corpus stats + corrected descriptions** — Done ✓
- [x] **Verify analysis runs end-to-end after the direct-function-call fix** — Done, confirmed working ✓

---

## Soon

- [ ] **Study design: account for healthy volunteers vs. MDD patients (N=80 total)**
  The full study is N=80: 16 MDD patients (Phase 2 phenotyping cohort) + 64 healthy volunteers (SAD/MAD PK/safety cohort). Currently the prototype only represents the 16 MDD patients and doesn't formally record total study N.
  - Update the `studies` table seed (or a new `study_design` table) to record `total_n: 80`, `mdd_n: 16`, `healthy_n: 64`
  - Confirm that the Phase 2 patient population query filters `clinical_patients` to MDD-diagnosed subjects only — healthy volunteers must never appear in phenotyping logic or Phase 2 ML
  - Healthy volunteer data surfaces only in the SAD/MAD Phase 1 Human Data tab (P1-F) as PK/safety context
  - Hardcoding these numbers is acceptable for prototype; add a TODO comment noting that future versions should pull N values from the study design record rather than hardcoding


- [ ] **P2-F: Retrieval aspect rewrite + Voyage AI migration (bundle — one session)**
  Branch: `feature/voyage-multimodal-retrieval-rewrite` (already created).
  **Do the aspect rewrite and embedding migration together** — changing aspects without re-embedding is pointless, and re-embedding without new aspects wastes the opportunity.
  Prerequisites: all met ✓ (15 papers in corpus, VOYAGE_API_KEY in `.env.local`, branch created)

  **Part 1 — Aspect rewrite (do first, before any embedding changes)**

  The current Phase 1 aspects are drug-descriptive (mechanism, efficacy, biomarkers, safety_pk). Replace with phenotype-oriented aspects that retrieve evidence about *who responds* rather than *what the drug does*.

  File: `app/api/studies/[studyId]/process-phase1/route.ts` lines 70–75
  Current:
  ```
  mechanism: `${drugName} ${mechClass} ${receptors} neuroplasticity BDNF TrkB synaptic plasticity psychoplastogen`
  efficacy: `forced swim test FST chronic mild stress CMS learned helplessness LH animal model MDD responder prediction antidepressant efficacy`
  biomarkers: `BDNF serum ng/mL CRP mg/L IL-6 pg/mL TNF-alpha inflammatory biomarkers threshold responder non-responder stratification`
  safety_pk: `${drugName} pharmacokinetics half-life bioavailability dose-response adverse events safety profile toxicology clinical trial`
  ```
  Replace with:
  ```
  responder_profile: `BDNF elevation neuroplasticity synaptic plasticity 5-HT2A agonist responder treatment response Val66Met Val/Val TrkB MADRS reduction remission`
  nonresponder_profile: `inflammatory subtype treatment resistance elevated CRP IL-6 TNF-alpha non-responder flat BDNF prior antidepressant failure TRD immune activation`
  biomarker_stratification: `biomarker threshold cutoff clinical stratification BDNF serum ng/mL IL-6 pg/mL treatment response prediction validated prospective`
  analog_outcomes: `psilocybin ketamine 5-HT2A clinical trial MADRS remission responder outcome Phase 2 MDD randomized controlled`
  ```
  Update the destructured variable names to match (`responderVec`, `nonresponderVec`, `stratVec`, `analogVec`), and the `aspects` Record keys.

  Also update the Phase 0 aspects in `app/api/runs/process/route.ts` lines 59–64 to match the phenotype framing — same four new aspect keys. The Phase 0 route uses `finalK=20`; do NOT change that.

  Do NOT change `searchCorpusMultiAspect` parameters: `finalK=40`, `rawPerAspect=80`, `maxPerDoc=3` stay the same. Do NOT change merge/dedup logic in `lib/pipeline/search.ts`.

  Tag all changes: `// SCIENCE-FEEDBACK P2-F`

  **Part 2 — Voyage AI embedding migration (Phase A: text-only)**

  Goal: replace OpenAI `text-embedding-3-small` (1536 dims) with Voyage AI `voyage-multimodal-3` (1024 dims). Text-only inputs for now — image rendering is Phase B.

  Step 1 — Install SDK:
  ```
  npm install voyageai
  ```
  The `voyageai` npm package (v0.2.1+) is the official TypeScript SDK. `VOYAGE_API_KEY` is already in `.env.local`.

  Step 2 — Rewrite `lib/pipeline/embed.ts`:
  Current file imports `openai`, uses `text-embedding-3-small`, batch size 100, returns `number[][]`.
  Replace with Voyage AI client. Key differences:
  - Model: `voyage-multimodal-3`
  - Dimensions: 1024 (not 1536)
  - Batch size: 128 (Voyage max)
  - Input format: array of strings (Voyage SDK accepts plain strings for text-only)
  - Keep the same exported function signatures: `embedTexts(texts: string[]): Promise<number[][]>` and `embedText(text: string): Promise<number[]>`
  - No other file should need to change imports — the function signatures stay identical.

  **Callers to verify still work after rewrite** (no changes needed, just verify):
  - `app/api/studies/[studyId]/process-phase1/route.ts` (line 77) — `embedTexts(Object.values(aspectTexts))`
  - `app/api/runs/process/route.ts` (line 66) — `embedTexts(Object.values(aspectTexts))`
  - `app/api/corpus/ingest/route.ts` (line 94) — `embedTexts(chunkTexts)`
  - `app/api/studies/[studyId]/chat/route.ts` (line 207) — `embedText(message)`
  - `app/api/runs/[runId]/chat/route.ts` (line 40) — `embedText(message)`

  Step 3 — Supabase migration `010_voyage_embeddings.sql`:
  **⚠️ This is the one-way door. Search breaks until re-embed completes. Do not run Phase 1 mid-migration.**
  ```sql
  -- 010_voyage_embeddings.sql
  -- Resize embedding column from 1536 (OpenAI) to 1024 (Voyage multimodal-3)

  -- Drop the IVFFlat index first (can't alter column type with index present)
  DROP INDEX IF EXISTS corpus_chunks_embedding_idx;

  -- Truncate existing embeddings (they're the wrong dimensions, must re-embed)
  UPDATE corpus_chunks SET embedding = NULL;

  -- Alter column type
  ALTER TABLE corpus_chunks ALTER COLUMN embedding TYPE vector(1024);

  -- Recreate both RPC functions with new vector dimension
  CREATE OR REPLACE FUNCTION match_corpus_chunks(
    query_embedding vector(1024),
    match_count     int default 20
  )
  RETURNS TABLE (
    chunk_id    uuid,
    doc_id      uuid,
    title       text,
    source_type text,
    content     text,
    similarity  float
  )
  LANGUAGE sql STABLE
  AS $$
    SELECT
      cc.id          AS chunk_id,
      cc.doc_id,
      cd.title,
      cd.source_type,
      cc.content,
      1 - (cc.embedding <=> query_embedding) AS similarity
    FROM corpus_chunks cc
    JOIN corpus_docs cd ON cd.id = cc.doc_id
    WHERE cd.status = 'ready'
    ORDER BY cc.embedding <=> query_embedding
    LIMIT match_count;
  $$;

  CREATE OR REPLACE FUNCTION match_corpus_chunks_weighted(
    query_embedding vector(1024),
    match_count     int default 30,
    source_boost    jsonb default '{"clinical_trial": 1.20, "regulatory": 1.15}'
  )
  RETURNS TABLE (
    chunk_id    uuid,
    doc_id      uuid,
    title       text,
    source_type text,
    content     text,
    similarity  float
  )
  LANGUAGE sql STABLE
  AS $$
    SELECT
      cc.id          AS chunk_id,
      cc.doc_id,
      cd.title,
      cd.source_type,
      cc.content,
      (1 - (cc.embedding <=> query_embedding)) *
        coalesce((source_boost ->> cd.source_type)::float, 1.0) AS similarity
    FROM corpus_chunks cc
    JOIN corpus_docs cd ON cd.id = cc.doc_id
    WHERE cd.status = 'ready'
    ORDER BY similarity DESC
    LIMIT match_count;
  $$;

  -- Rebuild IVFFlat index (lists=100 fine for current corpus, bump to 200 after E-2)
  CREATE INDEX corpus_chunks_embedding_idx ON corpus_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  ```
  **Critical: also check `scripts/ingest_clinical_trials.ts`** — line 396 has a local `embedTexts()` that duplicates `embed.ts` using OpenAI directly. Either update it to import from `lib/pipeline/embed.ts` or update the local copy to use Voyage.

  Step 4 — Re-embed existing corpus:
  Write `scripts/reembed-corpus.ts`. It should:
  - Query all `corpus_chunks` where `embedding IS NULL` (migration set them to NULL)
  - Batch embed content with `embedTexts()` (batch 128)
  - Update each chunk's embedding in Supabase
  - Print progress. Idempotent — can re-run safely.
  - Current corpus is ~15 docs, ~450 chunks — takes <30 seconds.

  Step 5 — Validate:
  - Re-run Phase 1 synthesis end-to-end. Confirm report generates.
  - Check Evidence tab — chunks should be more phenotype-relevant due to new aspects.
  - Run Ask LumosAI chat — confirm embedText works for query embedding.

  Step 6 — Remove OpenAI:
  Only after Step 5 passes:
  ```
  npm uninstall openai
  ```
  Remove `OPENAI_API_KEY` from Railway environment variables.
  Leave `OPENAI_API_KEY` in `.env.local` commented out (in case rollback needed).

  Step 7 — Commit, push, merge to main.

  **Rollback plan:** If anything breaks after migration:
  - The old embeddings are gone (set to NULL in Step 3), so rollback means re-embedding with OpenAI, not restoring data.
  - To rollback: revert `embed.ts`, run a reverse migration resizing back to 1536 with the old RPC signatures, re-embed with OpenAI. This is slow but safe.
  - Better approach: test thoroughly in Step 5 before removing OpenAI in Step 6.

## ML Engine Upgrade (Track F — implements "LumosAI Phenotyping Engine Upgrade" team doc)
*Added April 10, 2026. These items close the gap between what the team doc promises and what's currently specced/built. See: [LumosAI Phenotyping Engine Upgrade](https://docs.google.com/document/d/1ExDn4FmjqnzwDCyWaP4odk70MAQ9AWEbKiz772Yc8hs)*

- [ ] **F-1: Phase 1 distribution outputs — replace point estimates with (mean, σ, N, study count)**
  **Vision doc promise:** "Instead of 'the responder profile is characterized by elevated BDNF,' you get distributions — 'BDNF in responders centers around 30 ng/mL, σ=6, based on N=340 across 7 studies.'"
  **Current state:** Phase 1 Opus synthesis returns qualitative dimension text (e.g. "BDNF elevation; Val66Met Val/Val"). No numerical distributions are extracted. The output schema in `synthesize-phase1.ts` uses free-text `string` fields for each dimension.
  **Implementation:**
  1. Add a new field to the Phase 1 output JSON schema: `biomarker_distributions` — an array of `{ biomarker: string, mean: number, sd: number, n_patients: number, n_studies: number, source_quality: string }` for each key biomarker (BDNF, IL-6, CRP, TNF-α, MADRS baseline).
  2. Update the Opus synthesis prompt to instruct: "For each key biomarker, extract quantitative distribution parameters from the corpus evidence. Report mean, standard deviation, total N (patients across studies), and number of contributing studies. If a distribution cannot be computed (insufficient data), report `null` and explain the evidence gap."
  3. Store in `phase1_reports` table — either add a `biomarker_distributions` JSONB column or embed in the existing `report_data` JSONB.
  4. Update the Phase 1 report UI to display distributions (e.g. `30 ± 6 ng/mL (N=340, 7 studies)`) alongside the existing dimension prose.
  **Dependency:** P2-F (phenotype-oriented aspects) should be done first so the retrieved chunks are stratification-relevant.
  **Note:** This is Opus extracting distributions from text, not computing them — the quality depends entirely on corpus coverage. With the current ~15-doc corpus, many distributions will be sparse. As E-2 ingests papers (all ~159K in ranked order), distributions get richer progressively. The Google Doc's example numbers (σ=6, N=340, 7 studies) are realistic once the first ~10K most-relevant papers are ingested. Can implement F-1 early and let quality improve as the corpus grows.

- [ ] **F-2: Phase 1 distributions as Bayesian priors for Phase 2**
  **Vision doc promise:** "The Planning Phase distributions become Bayesian priors. For each patient, the model computes: how close is this patient's BDNF to the responder distribution?"
  **Current state:** Phase 2 Bayesian prior (`score.ts` lines 126–167) is computed from keyword counts of animal model mentions in corpus chunks (e.g. count "forced swim" mentions → Beta(α, β)). This produces a single prior probability per subtype, not a biomarker-level distribution prior.
  **Implementation:**
  1. After F-1 ships, feed the Phase 1 `biomarker_distributions` into Phase 2 as informative priors. For each biomarker, the responder distribution (mean_r, σ_r) and non-responder distribution (mean_nr, σ_nr) define what "responder-like" and "non-responder-like" look like.
  2. Replace the current threshold-based subtype assignment (`clinical-ml.ts` lines 75–102: BDNF < 15 → A, IL-6 ≥ 4 → B) with a likelihood-ratio approach: for each patient, compute P(biomarkers | responder distribution) / P(biomarkers | non-responder distribution) using the Phase 1 distributions as the generative model.
  3. The Bayesian update then becomes: prior (corpus distributions) × likelihood (patient data) → posterior probability of response per patient. This is mathematically still Beta-Binomial at the cohort level, but now uses distribution-informed individual likelihoods rather than hardcoded thresholds.
  4. Keep the current N_EFF = 20 for now, but add a TODO to make it dynamic based on corpus evidence strength (F-1 outputs N and study count per biomarker; N_EFF should scale with that).
  **Dependency:** F-1 must ship first. Also needs real distribution data in the corpus (E-2 ingest makes this meaningful).

- [ ] **F-3: Posterior confidence intervals per patient**
  **Vision doc promise:** "The output isn't a binary — it's a posterior probability with a confidence interval."
  **Current state:** `clinical-ml.ts` computes a single posterior point estimate per hypothesis: `posterior = (α₀ + k) / (α₀ + β₀ + n)`. No credible intervals. The UI shows a single `PosteriorBadge` number.
  **Implementation:**
  1. Compute Beta distribution credible intervals (e.g. 80% CI) from the posterior parameters: `α_post = α₀ + k`, `β_post = β₀ + n - k`. Use `jstat` or inline Beta quantile function (`betainv(0.1, α, β)` and `betainv(0.9, α, β)` for 80% CI).
  2. Add `posterior_ci_low` and `posterior_ci_high` to the `BayesianUpdate` type in `types.ts`.
  3. Update `PosteriorBadge` component to display the CI (e.g. "62% [48–75%]" or a small range bar).
  4. Per-patient posteriors (from F-2) should also carry individual CIs, not just cohort-level.
  **Dependency:** Can be done independently of F-1/F-2 as a quick win — the current Beta-Binomial already has the posterior parameters needed. F-2 makes the CIs more meaningful, but the math works now.
  **Cost:** Small — mostly a UI change + ~10 lines of math in `clinical-ml.ts`. Consider adding `jstat` (lightweight stats library) or computing Beta quantiles directly.

- [ ] **F-4: Evidence quality weighting in priors**
  **Vision doc promise:** "An RCT finding gets more weight than an observational study, which gets more than an animal model. A patient whose classification rests heavily on thin animal model data will have wider prediction intervals."
  **Current state:** Source-type boosting exists in the *search* layer (`match_corpus_chunks_weighted` applies 1.20x to clinical_trial, 1.15x to regulatory). But this only affects which chunks are retrieved, not how much weight they carry in the Bayesian prior. The prior computation in `score.ts` counts keyword mentions equally regardless of source type.
  **Implementation:**
  1. When computing Phase 1 distributions (F-1), weight each contributing study's data by its source type: RCT weight 1.0, prospective observational 0.7, retrospective 0.5, animal model 0.3, case report 0.2. This means an RCT with N=50 contributes as much as an animal study with N=167 to the distribution parameters.
  2. Track `evidence_quality_score` (weighted N / raw N) per biomarker distribution. This becomes a direct input to prediction interval width — thin evidence → wider intervals, matching the Google Doc promise.
  3. The source types are already tagged in `corpus_docs.source_type` and flow through to chunks via `aspect` field. The Opus prompt for F-1 should be instructed to note source types when extracting distributions.
  4. In Phase 2, propagate evidence quality into the prior strength: a biomarker with quality_score = 0.9 (mostly RCTs) gets a tighter prior than one with quality_score = 0.3 (mostly animal models). Mechanically, this means varying N_EFF per biomarker rather than using a global N_EFF = 20.
  **Dependency:** F-1 and F-2 must ship first. This is the refinement layer.

- [ ] **F-5: Fix synthesis prompt — describe actual methodology, not phantom ensemble**
  **Vision doc promise:** (implicit — the doc describes the Bayesian system honestly)
  **Current state:** `synthesize-phase2.ts` line 216 prompts Claude to describe "how the ML ensemble (logistic regression + random forest) was structured." No such model exists in the code. The actual methodology is threshold-based subtype assignment + Pearson correlation + Beta-Binomial update.
  **Implementation:**
  1. Update the methodology prompt in `synthesize-phase2.ts` to describe what actually runs: "threshold-based subtype assignment using corpus-derived biomarker cutoffs, univariate feature importance via Pearson correlation, and Beta-Binomial Bayesian updating of Planning Phase priors with observed clinical outcomes."
  2. When F-2 ships (distribution-based priors), update the prompt again to reflect the upgraded methodology.
  3. Add a `// METHODOLOGY-ACCURACY` comment tag so future changes to `clinical-ml.ts` are flagged to also update the prompt.
  **Dependency:** None — can do immediately. Small change, high credibility impact.

- [ ] **F-6: Fix Subtype C concordance inflation**
  **Current state:** `clinical-ml.ts` line 243 — Subtype C (mixed/intermediate) always counts as concordant in the concordance calculation. If 5/16 patients are Subtype C, the numerator is padded by 5 for free.
  **Implementation:**
  1. Report concordance two ways: "Overall concordance (including Subtype C): X%" and "Predictive concordance (Subtypes A & B only): Y%". The second number is the one that matters scientifically.
  2. Update the concordance return type to include both values.
  3. Update the Phase 2 UI to show both, with a tooltip explaining the distinction.
  **Dependency:** None — can do immediately. One of Adam's likely next catches.

---

- [ ] **Voyage AI embedding migration — Phase B (image rendering)**
  Follow-on session after Phase A is stable on main. Adds actual multimodal capability.
  Scope: update the PDF ingestion pipeline to render each PDF page as an image (using `pdf2pic` or `pdfjs-dist`) and pass it alongside extracted text: `[{type:'text',value:text},{type:'image_base64',value:base64png}]`. Re-embed the corpus again (no DB migration needed — same model, same 1024 dims). This unlocks retrieval against figure content (dose-response curves, forest plots, biomarker threshold tables) that text extraction misses entirely.

- [ ] **Genetic evidence context — distinguish MDD risk vs. treatment response (P3-F)**
  When the PGC MDD Cell 2025 paper is added to the corpus, add a prompt guard to `lib/pipeline/synthesize-phase1.ts`:
  - Always distinguish GWAS risk association (population-level) from treatment response prediction (individual-level) when citing genetic evidence
  - Contextualize Val66Met (rs6265): Val/Val and Val/Met = higher BDNF secretion efficiency; Met allele frequency 20–25% European, 40–50% East Asian per PGC 2025
  - Use probabilistic language ("mechanistically plausible", "consistent with") not deterministic ("will respond") when citing genetic epidemiology
  Tag: `// SCIENCE-FEEDBACK P3-F`

- [ ] **SCIENCE-FEEDBACK markers: audit and resolve**
  There are ~25 `SCIENCE-FEEDBACK: P1-A` and related markers scattered across the codebase (visible in a grep). These appear to be placeholders for science review feedback that hasn't been fully actioned. Audit what each marker means and either implement the fix or document why it's deferred. Key markers:
  - `P1-A` — appears most frequently; relates to "Planning Phase" label consistency
  - `P1-B` — confidence score interpretation
  - `P1-F` — SAD/MAD cohort data integration
  - `F2-A` through `F2-F` — FDA safety, behavioral profiles, EEG, sex-specific ranges, Val66Met ancestry, rater reliability

- [ ] **Dynamic chunk count scaling**
  Currently hardcoded at 40 chunks sent to Claude. Should scale based on similarity score distribution as corpus grows. See Architecture Roadmap in CLAUDE.md for trigger conditions and solution approach.
  **⚠️ Now triggered** — corpus is scaling to all ~159K papers (~4.8M chunks). Fixed-40 from a multi-million chunk corpus will surface the wrong evidence. Must implement before E-2 ingest passes ~10K papers.

---

## Large-Scale Corpus Expansion (Track E — XOLO Papers, all ~159K)
*Added April 9, 2026. Updated April 10 — ingesting ALL papers, not just top 25K. Requires P2-F Voyage migration to be complete first.*

- [ ] **E-0: Prerequisites**
  - [ ] Sudhanshu exports XOLO Papers Google Sheet as CSV, shares with engineering
  - [ ] OpenAlex API key obtained at openalex.org (required since Feb 2026, free tier)
  - [ ] P2-F Voyage AI migration complete on main (must be active embed model before bulk ingest)
  - [ ] Create `scripts/corpus-pipeline/` directory in repo

- [ ] **E-1: Assessment + relevance ranking — `scripts/corpus-pipeline/01_rank_papers.py`** *(running now)*
  Python script. Runs locally.
  1. Fetch metadata for all ~159K OpenAlex IDs (individual GET calls, ~10/sec, checkpointed to `data/openalex_metadata.jsonl`)
  2. `--stats-only` mode: print downloadability report (how many OA, how many have PDFs, how many have abstracts). No embedding cost.
  3. Full mode: reconstruct abstracts from OpenAlex inverted index, embed with voyage-multimodal-3, rank by cosine similarity to phenotype relevance query.
  4. Output `data/papers_ranked.csv`: openalex_id, title, relevance_score, cited_by_count, year, is_oa, pdf_url, downloadable
  **Output:** all ~159K papers ranked by relevance. Ranking determines ingestion ORDER, not a cutoff — all validated papers will be ingested.
  Cost: ~$1 for embedding (159K abstracts × ~100 tokens × $0.06/1M)

- [ ] **E-2: Full corpus ingest — all ~159K papers — `scripts/corpus-pipeline/02_ingest_batch.py`**
  Python script. Ingests ALL papers in ranked order (most relevant first). Resumable via checkpoint file.
  Headlamp team has validated all 169K as neuroplastigen-relevant — ranking is for prioritization, not filtering.
  1. Read all rows from `data/papers_ranked.csv` where `downloadable=true`, in ranked order
  2. Download PDF from `pdf_url` (httpx, 3 retries, exponential backoff)
  3. Extract text with `pymupdf` (`fitz`)
  4. Chunk (match `lib/pipeline/chunk.ts` parameters)
  5. Embed chunks with voyage-multimodal-3 Python SDK (batch 128, text-only)
  6. Batch upsert to `corpus_chunks` via `supabase-py` (bypass Next.js API, batch 200)
  7. Checkpoint: `data/ingestion_checkpoint.json` — tracks completed IDs
  **Infrastructure:** At ~30 chunks/paper × 159K papers = ~4.8M chunks. Exceeds pgvector comfort zone. Qdrant migration (E-3) must be evaluated before or during this run.
  **Runtime:** Multi-day on Railway Pro. Checkpoint means it can be stopped and resumed.
  **Cost:** ~$11 text embedding. Storage: ~15–20 GB (needs Qdrant or Supabase Pro with disk scaling).
  After initial batch (first ~10K): rebuild IVFFlat index, re-run Phase 1 report, validate Evidence tab. Continue ingest in background.

- [ ] **E-3: Qdrant migration (decision gate — evaluate before E-2 reaches ~25K papers)**
  At ~4.8M chunks, pgvector with IVFFlat will degrade on query latency and index rebuild time.
  Evaluate: Qdrant Cloud (purpose-built vector DB, free tier up to 1M vectors, $25/mo for 4M+) vs. staying on Supabase pgvector with HNSW index.
  If Qdrant: migrate `search.ts` to use Qdrant client, update `02_ingest_batch.py` to upsert to Qdrant, keep Supabase for relational data only.
  This decision should be made after E-2 has ingested ~10–25K papers and we can measure actual query latency.

---

## Later

- [x] **Migrate embedding model to Voyage AI** — PROMOTED to Soon (see P2-F above, April 8 2026)

- [ ] **Async job queue for long-running synthesis**
  Current direct function call approach works on Railway (persistent server) but will break on serverless. See CLAUDE.md Architecture Roadmap for trigger conditions (corpus > ~500 docs or synthesis > 3 min regularly).

- [ ] **Polygenic Risk Score (PRS) as Phase 2 ensemble feature**
  Blocked on real patient genotype data (N ≥ 50 with both genotype + outcome). Do not implement until then. Full details in CLAUDE.md Architecture Roadmap.

- [ ] **In silico twin / synthetic patient augmentation**
  Blocked on labeled dataset reaching N ≥ 300 real patients AND ensemble performance plateauing. Full details in CLAUDE.md Architecture Roadmap.

---

## Known Tech Debt

- `app/api/runs/` routes (`create`, `process`, `[runId]/`) appear to be a legacy single-patient flow predating the current study-based architecture. Assess whether still needed or safe to remove.
- `INTERNAL_API_URL` env var was added to Railway then deleted — confirm it's removed from Railway dashboard (it's no longer referenced in code).
- Processing page escape hatch timer is 90 seconds — reconsider now that synthesis reliably takes 5-10 minutes. Should probably be 3-4 minutes to avoid premature "is it stuck?" prompts.

---

## How to use this file

- When a task is completed in a session, mark it `[x]` and move it to a "Completed" section at the bottom.
- When starting a new session, say "check the backlog" — Claude Code will read this file and propose what to work on.
- Add items freely — the format is loose on purpose.
