# Lumos AI — Backlog

Items are grouped by priority. Start a session by saying "check the backlog" and Claude Code will pick up from here.

---

## Now (next session)

- [ ] **Re-run Phase 1 + Phase 2 to activate dynamic subtype labels**
  The subtype label consistency fix (below, completed) requires a Phase 1 re-run to generate the new `phenotype_label` fields. Until re-run, the fallback labels ("Responder-Favored" / "Nonresponder-Favored") will display — which is still correct, just generic.

- [ ] **Downgrade Supabase compute add-on**
  The Small tier (2 CPU / 4 GB, $25/mo) was needed for the IVFFlat index build. Now that the index is built, can downgrade to free compute. The index persists after downgrade. Test search latency after downgrading to confirm performance is acceptable.

---

## ML Engine Upgrade (Track F)
*See: [LumosAI Phenotyping Engine Upgrade](https://docs.google.com/document/d/1ExDn4FmjqnzwDCyWaP4odk70MAQ9AWEbKiz772Yc8hs)*

- [ ] **F-4: Evidence quality weighting in priors**
  Weight studies by source type (RCT 1.0 → case report 0.2). Track `evidence_quality_score` per biomarker.
  **Dependency:** F-1 ✓ and F-2 must ship first.

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
  At 346K chunks, pgvector IVFFlat handles queries with 60s timeout + retry. Revisit if query latency >500ms, storage overages, or concurrent users.

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

- [x] **Default Ask LumosAI chat panel to closed** — April 13, 2026
  Was `useState(true)` — opened on every page load across the app. Changed to `useState(false)`. Still opens on click or when ⓘ badges fire `lumos-ask` events.

- [x] **Fix vector search timeout on 346K chunk corpus** — April 13, 2026
  Fetch timeout 30s → 60s, DB statement_timeout 30s → 60s (migration 013), retryRpc now catches thrown TimeoutError/AbortError and retries with exponential backoff.

- [x] **Fix Phase 2 subtype label consistency with Phase 1** — April 13, 2026
  Subtype labels were hardcoded ("TrkB-Deficit", "High-Inflammatory", "Mixed") and semantically contradicted the LLR assignment logic (Subtype A = responder-favored but labeled as a deficit). Fixed by: adding `phenotype_label` field to Phase 1 Opus output, creating `resolveSubtypeLabels()` utility in clinical-ml.ts, threading dynamic labels through Phase2MLResult → components. Fallback to "Responder-Favored" / "Nonresponder-Favored" / "Intermediate" for old reports. Requires Phase 1 re-run to generate dynamic labels.

- [x] **F-2: Likelihood-ratio subtype assignment + retrieval bias fix** — April 13, 2026
  Phase 2 uses Phase 1 corpus distributions as Gaussian priors for patient LLR scoring. Falls back to thresholds for older reports. UI shows LLR rationale per patient, scatter plot adapts to assignment method. Also fixed retrieval bias: removed source boost, added 50% source-type cap in general pool, removed drug name from rerank query. Clinical trial docs were monopolizing all 50 reranked chunks.

- [x] **F-1: Biomarker distribution outputs + PDF export** — April 13, 2026
  Extended Sonnet compression to extract structured numerics. Pure-math aggregation produces BiomarkerDistribution[] per biomarker. UI + PDF render corpus stats below threshold boxes. Zero additional LLM calls.

- [x] **Corrected trial cohort structure: 16 MDD + 64 HV = 80 total** — April 13, 2026
  Reverted incorrect N=80 MDD expansion. Trial design: 16 MDD efficacy patients (Phase 2 phenotyping), 64 healthy volunteers (SAD/MAD PK/safety). DB fields `mdd_n=16`, `healthy_volunteer_n=64` were already correct. MDD patients have realistic biomarker overlap with edge cases (P004, P011).

- [x] **Study Overview page redesign** — April 13, 2026
  Live corpus stats, accurate methodology (reranking, compression, Bayesian updating), fixed stale references (removed "SHAP", "logistic regression", "ML-driven"). Added corpus stats section.

- [x] **Corpus page: source-type filter + pagination** — April 13, 2026
  Dropdown filter (All/Literature/Clinical Trial/Regulatory). Paginated API (100/page) with real total count. Fixed "1000 documents ready" cap.

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
