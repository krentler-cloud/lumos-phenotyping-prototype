# Lumos AI — Backlog

Items are grouped by priority. Start a session by saying "check the backlog" and Claude Code will pick up from here.

---

## Now (next session)

- [ ] **Validate Planning Phase report on 7,754 doc corpus**
  Run a fresh analysis and check:
  - Clinical trial evidence appears in Evidence tab (reserved slots + 1.50x boost)
  - Report quality is good with the larger, more diverse corpus
  - Confidence score reflects honest assessment of evidence consistency
  - Ask LumosAI chat answers accurately about the pipeline

- [ ] **Downgrade Supabase compute add-on**
  The Small tier (2 CPU / 4 GB, $25/mo) was needed for the IVFFlat index build. Now that the index is built, can downgrade to free compute. The index persists after downgrade. Test search latency after downgrading to confirm performance is acceptable.

---

## ML Engine Upgrade (Track F)
*See: [LumosAI Phenotyping Engine Upgrade](https://docs.google.com/document/d/1ExDn4FmjqnzwDCyWaP4odk70MAQ9AWEbKiz772Yc8hs)*

- [ ] **F-1: Phase 1 distribution outputs — replace point estimates with (mean, σ, N, study count)**
  Add `biomarker_distributions` to output schema. Opus extracts quantitative distributions from corpus. UI displays alongside dimension prose.
  **Dependency:** P2-F done ✓. Corpus now has 7,700+ papers — distributions should be meaningful for common biomarkers (BDNF, IL-6, CRP).

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

## Large-Scale Corpus Expansion (Track E)

- [x] **E-0: Prerequisites** ✓
- [x] **E-1: Assessment + relevance ranking** ✓
- [x] **E-2: Corpus ingestion — COMPLETE** (April 11-13, 2026)
  **Final corpus: 7,754 docs / 346,360 chunks** (was 150 docs / 8,100 chunks before E-2)
  Two batch runs: paid+free (3,732 docs) then free-only overnight (~4,000 more docs).
  Unpaywall was dominant free source (~57%). OpenAlex Tier 4 ~$2.82 spent.
  Voyage embedding cost ~$118 (crash/restart re-embedding — fixed with dedup-before-embed).
  IVFFlat index with lists=200, required disk autoscaling + compute upgrade.

- [x] **E-2b: Missing high-relevance papers report** — April 13, 2026
  Generated `data/missing_high_relevance_papers.csv` — 15,764 papers sorted by relevance score that failed all download tiers. Top papers retrievable via institutional access, author preprints, or interlibrary loan.

- [ ] **E-3: Qdrant migration (decision gate)**
  At 346K chunks, pgvector IVFFlat handles queries fine with 30s timeout. Revisit if query latency >500ms, storage overages, or concurrent users.

---

## Later

- [ ] **Study ingestion module — multi-study support**
- [ ] **Async job queue for long-running synthesis**
- [ ] **Polygenic Risk Score (PRS)** — blocked on real genotype data (N ≥ 50)
- [ ] **In silico twin** — blocked on labeled dataset (N ≥ 300)

---

## Known Tech Debt

- `app/api/runs/` legacy routes — assess whether still needed or safe to remove
- Processing page escape hatch timer is 90 seconds — should be 3-4 minutes
- Supabase compute add-on (Small, $25/mo) — downgrade after confirming search performance

---

## Completed

- [x] **Study Overview page redesign** — April 13, 2026
  Live corpus stats, accurate methodology (reranking, compression, Bayesian updating), fixed stale references (removed "SHAP", "logistic regression", "ML-driven"). Added corpus stats section.

- [x] **Corpus page: source-type filter + pagination** — April 13, 2026
  Dropdown filter (All/Literature/Clinical Trial/Regulatory). Paginated API (100/page) with real total count. Fixed "1000 documents ready" cap.

- [x] **Reserved 10 retrieval slots for clinical trial + regulatory** — April 13, 2026
  Guarantees IND/trial evidence appears regardless of corpus size (198:1 literature ratio).

- [x] **Source-type boost increase** — April 13, 2026
  clinical_trial 1.20→1.50, regulatory 1.15→1.30 for 7,700+ doc corpus.

- [x] **Corpus stats API fix** — April 12, 2026
  PostgREST 1,000 row limit fixed with parallel count queries.

- [x] **Ingestion cost protection** — April 12, 2026
  Moved doc_already_exists() before embed_chunks() to prevent re-embedding waste.

- [x] **IVFFlat index rebuilt on 346K chunks** — April 13, 2026
  lists=200, required disk autoscaling + compute upgrade.

- [x] **Supabase migration 011** — April 13, 2026
  Added mdd_n and healthy_volunteer_n columns to studies table.

- [x] **Vector search timeout fix** — April 11, 2026
- [x] **E-2 ingestion script: 4-tier waterfall** — April 11, 2026
- [x] **Retrieve → Rerank → Compress → Synthesize pipeline** — April 10, 2026
- [x] **P2-F: Retrieval aspect rewrite + Voyage AI migration** — April 10, 2026
- [x] **F-3: Posterior confidence intervals** — April 10, 2026
- [x] **F-5: Fix synthesis prompt** — April 10, 2026
- [x] **F-6: Fix Subtype C concordance inflation** — April 10, 2026
- [x] **Parallelize synthesis + exploratory to Sonnet** — April 10, 2026
- [x] **Opus diagnostics + streaming progress** — April 10, 2026
- [x] **Fix Opus stall detection (Promise.race)** — April 10, 2026
- [x] **Fix Ask LumosAI platform facts** — April 10, 2026
- [x] **Guard Phase 2 during Phase 1** — April 10, 2026
- [x] **Pipeline descriptions + timestamps** — April 10, 2026
- [x] **Study design N=80 + dynamic counts** — April 10, 2026

---

## How to use this file

- When a task is completed, mark it `[x]` and move to Completed with a date and brief summary.
- When starting a new session, say "check the backlog".
- Add items freely — the format is loose on purpose.
