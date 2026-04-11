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

---

## How to use this file

- When a task is completed, mark it `[x]` and move to Completed with a date and brief summary.
- When starting a new session, say "check the backlog".
- Add items freely — the format is loose on purpose.
