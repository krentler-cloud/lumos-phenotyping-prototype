# Lumos AI — Backlog

Items are grouped by priority. Start a session by saying "check the backlog" and Claude Code will pick up from here.

---

## Now (next session)

- [ ] **Update all static pipeline descriptions to reflect current architecture**
  Multiple pages have stale descriptions after the P2-F + rerank+compress changes:
  1. **Processing page** (`Phase1ProcessingClient.tsx` — `buildStepDescriptions()`):
     - "Aspect embedding" still says "mechanism, efficacy, biomarkers, and safety/PK" and "1,536 dimensions" — should say the 4 phenotype-oriented aspects (responder profile, non-responder profile, biomarker stratification, analog outcomes) and "1,024 dimensions"
     - "Weighted corpus search" says "sent to Claude" — should say "sent to Lumos AI" per branding rule
     - Header says "This typically takes 60–90 seconds" — inaccurate. Either show a dynamic elapsed timer, or change to "3–5 minutes depending on corpus size"
     - Suggested questions in Ask LumosAI sidebar are hardcoded and reference "Claude" ("What stops Claude from drawing on its training data...") — must say "Lumos AI" per branding rule. Update the static list to reflect the current pipeline (reranking, evidence compression, phenotype-oriented aspects).
  2. **Landing page** (`app/studies/[studyId]/phase1/page.tsx` — the "What Lumos AI will do" card):
     - Pipeline steps listed don't reflect the current architecture (no mention of reranking or evidence compression)
     - The 3 stat cards at the bottom (39 Clinical Trial Docs, 144 Research Corpus, 8,100 Vector Embeddings) should pull live numbers from the DB, not be hardcoded
  Both pages should derive descriptions from the actual code/config where possible, and use live corpus stats (already available via the server component pattern used in the processing page).

- [ ] **Add generation timestamp (local time) to report headers**
  Both Planning Phase and Clinical Analysis reports currently show "Generated Apr 10, 2026" — date only, no time.
  - Planning Phase: `components/Phase1ReportViewer.tsx`
  - Clinical Analysis: `components/Phase2FinalReport.tsx`
  - Use `runs.completed_at` (UTC) → convert to local time on client with `toLocaleString()`

- [ ] **Study design: account for healthy volunteers vs. MDD patients (N=80 total)**
  The full study is N=80: 16 MDD patients + 64 healthy volunteers (SAD/MAD). Currently the prototype only represents the 16 MDD patients.
  - Update studies table seed to record total_n, mdd_n, healthy_n
  - Confirm Phase 2 patient population filters to MDD-diagnosed subjects only

---

## ML Engine Upgrade (Track F)
*See: [LumosAI Phenotyping Engine Upgrade](https://docs.google.com/document/d/1ExDn4FmjqnzwDCyWaP4odk70MAQ9AWEbKiz772Yc8hs)*

- [ ] **F-1: Phase 1 distribution outputs — replace point estimates with (mean, σ, N, study count)**
  Add `biomarker_distributions` to output schema. Opus extracts quantitative distributions from corpus. UI displays alongside dimension prose.
  **Dependency:** P2-F done ✓. Distributions will be sparse with ~150 docs — quality improves as E-2 ingests papers.

- [ ] **F-2: Phase 1 distributions as Bayesian priors for Phase 2**
  Replace threshold-based subtype assignment with likelihood-ratio approach using Phase 1 distributions.
  **Dependency:** F-1 must ship first.

- [ ] **F-3: Posterior confidence intervals per patient**
  Compute Beta distribution credible intervals (80% CI). Quick win — current Beta-Binomial already has the parameters.

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
*P2-F Voyage migration complete ✓. Rerank+compress pipeline complete ✓.*

- [ ] **E-0: Prerequisites**
  - [ ] Sudhanshu exports XOLO Papers Google Sheet as CSV
  - [ ] OpenAlex API key obtained at openalex.org
  - [x] P2-F Voyage AI migration ✓
  - [x] `scripts/corpus-pipeline/` directory ✓
  - [x] Rerank+compress pipeline ✓ (scales to large corpus)

- [ ] **E-1: Assessment + relevance ranking** *(running now)*
  `scripts/corpus-pipeline/01_rank_papers.py` — fetches metadata, ranks all ~159K papers by relevance.

- [ ] **E-2: Full corpus ingest — all ~159K papers**
  `scripts/corpus-pipeline/02_ingest_batch.py` — ingests in ranked order, resumable.

- [ ] **E-3: Qdrant migration (decision gate at ~25K papers)**
  Evaluate Qdrant Cloud vs. pgvector with HNSW index at scale.

---

## Later

- [ ] **Async job queue for long-running synthesis**
- [ ] **Polygenic Risk Score (PRS)** — blocked on real genotype data (N ≥ 50)
- [ ] **In silico twin** — blocked on labeled dataset (N ≥ 300)

---

## Known Tech Debt

- `app/api/runs/` legacy routes — assess whether still needed or safe to remove
- Processing page escape hatch timer is 90 seconds — should be 3-4 minutes
- Dynamic chunk count scaling — currently hardcoded in `searchCorpusMultiAspect` params. The rerank+compress pipeline mitigates this (broad retrieval → rerank selects best), but the raw retrieval params (100 finalK, 150 rawPerAspect) may need tuning as corpus grows past 10K papers.

---

## Completed

- [x] **Retrieve → Rerank → Compress → Synthesize pipeline** — April 10, 2026
  Full production RAG pipeline: broad retrieval (600 raw → 100 deduped), Voyage rerank-2 (→50), 4 parallel Sonnet evidence compression calls (→structured findings), Opus synthesis from ~8K token brief. Chat endpoint gets lightweight rerank (fetch 20, rerank to 8). Graceful fallback if rerank or compression fails. First validated run: 127s Opus synthesis with 8,204 input tokens (was 10+ min with 20K+ raw tokens).

- [x] **P2-F: Retrieval aspect rewrite + Voyage AI migration** — April 10, 2026
  4 phenotype-oriented aspects. OpenAI → Voyage AI voyage-3 (1024 dims). 8,100 chunks re-embedded. OpenAI removed. SDK removed (broken ESM) — direct REST API via fetch().

- [x] **F-5: Fix synthesis prompt — phantom ensemble → real methodology** — April 10, 2026
- [x] **F-6: Fix Subtype C concordance inflation** — April 10, 2026
- [x] **Parallelize synthesis calls + exploratory biomarkers to Sonnet** — April 10, 2026
- [x] **Opus synthesis diagnostics in step_log** — April 10, 2026
- [x] **Streaming token progress during Phenotype synthesis** — April 10, 2026
- [x] **Phase 2 processing page: live corpus stats + corrected descriptions**
- [x] **Verify analysis runs end-to-end after direct-function-call fix**

---

## Session Log — April 10, 2026

**What was done (13 items):**
1. P2-F: phenotype-oriented aspects + Voyage AI voyage-3 migration (8,100 chunks re-embedded)
2. F-5: Fixed phantom ensemble in methodology prompt
3. F-6: Predictive concordance (A/B only) alongside overall concordance
4. Supabase migration 010 (1536→1024 dims)
5. OpenAI fully removed (package + Railway env var)
6. `voyageai` SDK removed — embed.ts calls REST API directly
7. Exploratory biomarkers: Opus → Sonnet
8. Exploratory + corpus intelligence: parallel via Promise.all
9. Opus diagnostics in step_log (tokens, duration, prompt size)
10. Chunk count 40→25 (then superseded by rerank pipeline)
11. FDA safety instructions moved from Opus to Sonnet biomarker prompt
12. Streaming token progress every 15s during Phenotype synthesis
13. Full Retrieve → Rerank → Compress → Synthesize pipeline

**Validated results (last run):**
- Pipeline: 600 raw → 472 deduped → 100 retrieved → 50 reranked → 51 findings extracted → Opus synthesis
- Opus: 127s, 8,204 input tokens, 5,877 output tokens, stop=end_turn
- Evidence compression: 45s (4 parallel Sonnet calls)
- Total pipeline: ~3.5 minutes (was 10+ min before)
- Report generated successfully with 38% corpus confidence, 9 biomarkers

---

## How to use this file

- When a task is completed, mark it `[x]` and move to Completed with a date and brief summary.
- When starting a new session, say "check the backlog".
- Add items freely — the format is loose on purpose.
