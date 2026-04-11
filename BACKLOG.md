# Lumos AI — Backlog

Items are grouped by priority. Start a session by saying "check the backlog" and Claude Code will pick up from here.

---

## Now (next session)

- [ ] **Validate full Retrieve → Rerank → Compress → Synthesize pipeline**
  Latest deploy (April 10 late PM) has the complete pipeline: broad retrieval (100 chunks), Voyage rerank-2 (→50), Sonnet evidence compression (4 parallel calls), Opus synthesis from structured brief (~8K tokens). Need to confirm:
  - Run a fresh Planning Phase analysis — confirm it completes in ~3-4 minutes
  - Check new steps in processing UI: "Rerank corpus evidence" and "Evidence compression" appear with timing
  - Check streaming progress shows token count during Phenotype synthesis
  - Check diagnostics (duration, tokens, compression ratio, rerank score range) in step_log
  - Verify report quality — should be at least as good with better evidence selection
  - Test Ask LumosAI chat — confirm reranked chunks improve relevance
  - Check Evidence tab — confirm `_evidence_chunks` stored with rerank scores
  - Check Evidence tab — chunks should be more phenotype-relevant due to new aspects
  - Run Ask LumosAI chat — confirm embedText works for query embedding
  - If anything fails, the rollback plan is: revert embed.ts to OpenAI, run reverse migration (1024→1536), re-embed with OpenAI

- [ ] **Update all static pipeline descriptions to reflect P2-F changes**
  Two pages have stale descriptions after the aspect rewrite + Voyage migration:
  1. **Processing page** (`Phase1ProcessingClient.tsx` — `buildStepDescriptions()`):
     - "Aspect embedding" still says "mechanism, efficacy, biomarkers, and safety/PK" and "1,536 dimensions" — should say the 4 phenotype-oriented aspects (responder profile, non-responder profile, biomarker stratification, analog outcomes) and "1,024 dimensions"
     - "Weighted corpus search" says "sent to Claude" — should say "sent to Lumos AI" per branding rule
     - Header says "This typically takes 60–90 seconds" — inaccurate, synthesis alone takes 5–10 minutes. Either show a dynamic elapsed timer, or change to a realistic estimate ("3–10 minutes depending on corpus size")
     - Review all other descriptions for accuracy after the changes
     - Suggested questions in Ask LumosAI sidebar are hardcoded and reference "Claude" ("What stops Claude from drawing on its training data...") — must say "Lumos AI" per branding rule. Consider making suggested questions dynamic based on page context or at minimum update the static list to reflect the current pipeline (phenotype-oriented aspects, Voyage AI embeddings, etc.)
  2. **Landing page** (`app/studies/[studyId]/phase1/page.tsx` — the "What Lumos AI will do" card):
     - "Multi-aspect corpus search" subtitle says "4 simultaneous vector queries across Headlamp MDD corpus" — should name the 4 phenotype-oriented aspects
     - "Cross-species mapping" subtitle says "FST / CMS / LH animal models → human MDD subtypes" — check if this is still accurate or should reflect the new analog_outcomes framing
     - The 3 stat cards at the bottom (39 Clinical Trial Docs, 144 Research Corpus, 8,100 Vector Embeddings) should pull live numbers from the DB, not be hardcoded
  Both pages should derive descriptions from the actual code/config where possible, and use live corpus stats (already available via the server component pattern used in the processing page).

- [ ] **Study design: account for healthy volunteers vs. MDD patients (N=80 total)**
  The full study is N=80: 16 MDD patients (Phase 2 phenotyping cohort) + 64 healthy volunteers (SAD/MAD PK/safety cohort). Currently the prototype only represents the 16 MDD patients and doesn't formally record total study N.
  - Update the `studies` table seed (or a new `study_design` table) to record `total_n: 80`, `mdd_n: 16`, `healthy_n: 64`
  - Confirm that the Phase 2 patient population query filters `clinical_patients` to MDD-diagnosed subjects only — healthy volunteers must never appear in phenotyping logic or Phase 2 ML
  - Healthy volunteer data surfaces only in the SAD/MAD Phase 1 Human Data tab (P1-F) as PK/safety context
  - Hardcoding these numbers is acceptable for prototype; add a TODO comment noting that future versions should pull N values from the study design record rather than hardcoding

---

## ML Engine Upgrade (Track F — implements "LumosAI Phenotyping Engine Upgrade" team doc)
*Added April 10, 2026. See: [LumosAI Phenotyping Engine Upgrade](https://docs.google.com/document/d/1ExDn4FmjqnzwDCyWaP4odk70MAQ9AWEbKiz772Yc8hs)*

- [ ] **F-1: Phase 1 distribution outputs — replace point estimates with (mean, σ, N, study count)**
  **Vision doc promise:** "Instead of 'the responder profile is characterized by elevated BDNF,' you get distributions — 'BDNF in responders centers around 30 ng/mL, σ=6, based on N=340 across 7 studies.'"
  **Current state:** Phase 1 Opus synthesis returns qualitative dimension text (e.g. "BDNF elevation; Val66Met Val/Val"). No numerical distributions are extracted. The output schema in `synthesize-phase1.ts` uses free-text `string` fields for each dimension.
  **Implementation:**
  1. Add a new field to the Phase 1 output JSON schema: `biomarker_distributions` — an array of `{ biomarker: string, mean: number, sd: number, n_patients: number, n_studies: number, source_quality: string }` for each key biomarker (BDNF, IL-6, CRP, TNF-α, MADRS baseline).
  2. Update the Opus synthesis prompt to instruct: "For each key biomarker, extract quantitative distribution parameters from the corpus evidence. Report mean, standard deviation, total N (patients across studies), and number of contributing studies. If a distribution cannot be computed (insufficient data), report `null` and explain the evidence gap."
  3. Store in `phase1_reports` table — either add a `biomarker_distributions` JSONB column or embed in the existing `report_data` JSONB.
  4. Update the Phase 1 report UI to display distributions (e.g. `30 ± 6 ng/mL (N=340, 7 studies)`) alongside the existing dimension prose.
  **Dependency:** P2-F done ✓. With current ~15-doc corpus, many distributions will be sparse — quality improves as E-2 ingests papers.

- [ ] **F-2: Phase 1 distributions as Bayesian priors for Phase 2**
  **Vision doc promise:** "The Planning Phase distributions become Bayesian priors. For each patient, the model computes: how close is this patient's BDNF to the responder distribution?"
  **Current state:** Phase 2 Bayesian prior (`score.ts` lines 126–167) is computed from keyword counts of animal model mentions in corpus chunks. This produces a single prior probability per subtype, not a biomarker-level distribution prior.
  **Implementation:**
  1. After F-1 ships, feed the Phase 1 `biomarker_distributions` into Phase 2 as informative priors.
  2. Replace threshold-based subtype assignment with likelihood-ratio approach using Phase 1 distributions.
  3. Bayesian update becomes: prior (corpus distributions) × likelihood (patient data) → posterior per patient.
  **Dependency:** F-1 must ship first.

- [ ] **F-3: Posterior confidence intervals per patient**
  **Vision doc promise:** "The output isn't a binary — it's a posterior probability with a confidence interval."
  **Current state:** `clinical-ml.ts` computes a single posterior point estimate. No credible intervals. UI shows a single `PosteriorBadge` number.
  **Implementation:** Compute Beta distribution credible intervals (80% CI) from posterior parameters. Add `posterior_ci_low` / `posterior_ci_high` to `BayesianUpdate` type. Update `PosteriorBadge` to display CI.
  **Dependency:** Can be done independently as a quick win — current Beta-Binomial already has the parameters needed.

- [ ] **F-4: Evidence quality weighting in priors**
  **Vision doc promise:** "An RCT finding gets more weight than an observational study, which gets more than an animal model."
  **Current state:** Source-type boosting exists in search (1.20x clinical_trial, 1.15x regulatory) but not in Bayesian prior computation.
  **Implementation:** Weight contributing studies by source type (RCT 1.0, prospective 0.7, retrospective 0.5, animal 0.3, case report 0.2). Track `evidence_quality_score` per biomarker distribution.
  **Dependency:** F-1 and F-2 must ship first.

---

## Soon

- [ ] **Voyage AI embedding migration — Phase B (image rendering)**
  Follow-on after Phase A is stable on main. Adds actual multimodal capability.
  Model: `voyage-multimodal-3` via the `/multimodalembeddings` endpoint (different from the `/embeddings` endpoint used in Phase A).
  Scope: update PDF ingestion pipeline to render each PDF page as an image and pass alongside extracted text. Re-embed corpus (no DB migration needed — same 1024 dims). Unlocks retrieval against figure content (dose-response curves, forest plots, biomarker threshold tables).

- [ ] **Genetic evidence context — distinguish MDD risk vs. treatment response (P3-F)**
  When the PGC MDD Cell 2025 paper is added to the corpus, add a prompt guard to `synthesize-phase1.ts` to distinguish GWAS risk association (population-level) from treatment response prediction (individual-level).

- [ ] **SCIENCE-FEEDBACK markers: audit and resolve**
  ~25 `SCIENCE-FEEDBACK: P1-A` and related markers scattered across the codebase. Audit each and either implement or document why deferred.

- [ ] **Dynamic chunk count scaling**
  Currently hardcoded at 40 chunks sent to Claude. Should scale based on similarity score distribution as corpus grows.
  **⚠️ Now triggered** — corpus is scaling to all ~159K papers. Must implement before E-2 ingest passes ~10K papers.

---

## Large-Scale Corpus Expansion (Track E — XOLO Papers, all ~159K)
*Added April 9, 2026. Updated April 10 — ingesting ALL papers, not just top 25K. Requires P2-F Voyage migration to be complete ✓*

- [ ] **E-0: Prerequisites**
  - [ ] Sudhanshu exports XOLO Papers Google Sheet as CSV, shares with engineering
  - [ ] OpenAlex API key obtained at openalex.org (required since Feb 2026, free tier)
  - [x] P2-F Voyage AI migration complete on main ✓
  - [x] Create `scripts/corpus-pipeline/` directory in repo ✓

- [ ] **E-1: Assessment + relevance ranking — `scripts/corpus-pipeline/01_rank_papers.py`** *(running now)*
  Python script. Runs locally. Fetches metadata for all ~159K OpenAlex IDs, ranks by relevance.
  Output: `data/papers_ranked.csv` with all papers ranked by relevance score.

- [ ] **E-2: Full corpus ingest — all ~159K papers — `scripts/corpus-pipeline/02_ingest_batch.py`**
  Ingests ALL papers in ranked order (most relevant first). Resumable via checkpoint.
  At ~4.8M chunks, may need Qdrant migration (E-3) before completion.

- [ ] **E-3: Qdrant migration (decision gate — evaluate before E-2 reaches ~25K papers)**
  Evaluate Qdrant Cloud vs. pgvector with HNSW index at scale.

---

## Later

- [ ] **Async job queue for long-running synthesis**
  Current direct function call approach works on Railway (persistent server) but will break on serverless. See CLAUDE.md Architecture Roadmap.

- [ ] **Polygenic Risk Score (PRS) as Phase 2 ensemble feature**
  Blocked on real patient genotype data (N ≥ 50 with both genotype + outcome). Full details in CLAUDE.md Architecture Roadmap.

- [ ] **In silico twin / synthetic patient augmentation**
  Blocked on labeled dataset reaching N ≥ 300 real patients AND ensemble performance plateauing.

---

## Known Tech Debt

- `app/api/runs/` routes (`create`, `process`, `[runId]/`) appear to be a legacy single-patient flow predating the current study-based architecture. Assess whether still needed or safe to remove.
- Processing page escape hatch timer is 90 seconds — reconsider now that synthesis reliably takes 5-10 minutes. Should probably be 3-4 minutes.

---

## Completed

- [x] **P2-F: Retrieval aspect rewrite + Voyage AI migration** — Merged to main April 10, 2026
  - Part 1: 4 drug-descriptive aspects → 4 phenotype-oriented aspects (responder_profile, nonresponder_profile, biomarker_stratification, analog_outcomes) in process-phase1 and runs/process
  - Part 2: OpenAI text-embedding-3-small (1536 dims) → Voyage AI voyage-3 (1024 dims). Migration 010_voyage_embeddings.sql applied. 8,100 chunks re-embedded. OpenAI package removed. `voyageai` npm SDK also removed (broken ESM exports) — `lib/pipeline/embed.ts` calls the REST API directly via `fetch()`.
  - Note: Phase A uses `voyage-3` (text-only, `/v1/embeddings` endpoint). Phase B will use `voyage-multimodal-3` via the separate `/v1/multimodalembeddings` endpoint after image rendering is added.

- [x] **F-5: Fix synthesis prompt — describe actual methodology, not phantom ensemble** — April 10, 2026
  Updated `synthesize-phase2.ts` methodology prompt: replaced "ML ensemble (logistic regression + random forest)" with actual methodology (threshold-based subtype assignment + Pearson correlation + Beta-Binomial Bayesian update).

- [x] **F-6: Fix Subtype C concordance inflation** — April 10, 2026
  Now reports both `concordance_pct` (overall, includes Subtype C) and `predictive_concordance_pct` (A/B only). UI, synthesis prompt, and page context dispatchers all updated.

- [x] **Parallelize synthesis calls + switch exploratory biomarkers to Sonnet** — April 10, 2026
  - Exploratory biomarker synthesis switched from Opus → Sonnet (only uses 20 truncated chunks for a brainstorm — Sonnet is sufficient and 5-10x faster)
  - Exploratory biomarkers + corpus intelligence now run in parallel via `Promise.all` instead of sequentially
  - Both results merged into stored report in a single DB update
  - Net effect: tail time after phenotype synthesis cut roughly in half

- [x] **Add Opus synthesis diagnostics to step_log** — April 10, 2026
  Phenotype synthesis step now logs: duration (seconds), input/output token counts, stop_reason, prompt char count, and max_tokens budget. Visible via `/phase1-status` API without needing Railway logs. Bumped abort timeout from 8→10 minutes.

- [x] **Phase 2 processing page: live corpus stats + corrected descriptions**
- [x] **Verify analysis runs end-to-end after the direct-function-call fix**
- [x] **Migrate embedding model to Voyage AI** — PROMOTED and completed as P2-F

---

## Session Log — April 10, 2026 (PM session)

**What was done:**
1. P2-F merged to main: phenotype-oriented aspects + Voyage AI voyage-3 embedding migration (8,100 chunks re-embedded)
2. F-5: Fixed Phase 2 methodology prompt (phantom ensemble → real methodology)
3. F-6: Fixed Subtype C concordance inflation (now reports predictive concordance A/B only)
4. Supabase migration 010_voyage_embeddings.sql applied (1536→1024 dims, RPC functions rebuilt)
5. OpenAI fully removed from stack (package + Railway env var)
6. `voyageai` SDK removed (broken ESM exports) — embed.ts calls REST API directly via fetch()
7. Exploratory biomarkers switched from Opus → Sonnet
8. Exploratory biomarkers + corpus intelligence now run in parallel (Promise.all)
9. Added Opus diagnostics to step_log (token counts, duration, prompt size)
10. Reduced chunk count from 40→25 (40 was causing 10+ min Opus calls; 25 keeps ~13K chunk tokens)
11. Moved F2-A (FDA safety requirements) from Opus phenotype prompt to Sonnet biomarker prompt (~500 token savings)
12. Added streaming token progress: UI now shows "generating... ~2,400 tokens (45s)" during Phenotype synthesis instead of blank 75%
13. **Full Retrieve → Rerank → Compress → Synthesize pipeline** — the big one:
    - Broad retrieval: 100 chunks from 600 raw candidates (4 aspects × 150 each)
    - Voyage rerank-2: cross-attention reranking selects top 50
    - Evidence compression: 4 parallel Sonnet calls extract structured findings (~70% size reduction)
    - Opus synthesis: receives structured evidence brief (~8K tokens, was ~13-20K raw)
    - Chat endpoint: lightweight rerank (fetch 20, rerank to 8)
    - Processing UI: new step icons/descriptions for Rerank and Evidence Compression
    - Graceful fallback: if rerank or compression fails, falls back to raw chunks
    - Reranked chunks stored as `_evidence_chunks` in report data for traceability

**What needs validation (next session):**
- Run a fresh Planning Phase analysis with the full rerank+compress pipeline
- Confirm total time is ~3-4 minutes (was 6-12 min)
- Check rerank + compression steps appear in step_log with timing and scores
- Check streaming progress shows token count during Phenotype synthesis
- Check diagnostics (duration, input/output tokens, compression ratio)
- Verify report quality is at least as good as before (better evidence → better reasoning)
- Test Ask LumosAI chat — confirm reranked chunks improve relevance
- Test Ask LumosAI chat (Voyage AI query embedding)

**Open questions for next session:**
- Is 40 chunks too many for Opus? The diagnostics will answer this. If input tokens are very high, consider reducing to 25-30 or adding a reranking step.
- Processing page descriptions are stale (still say old aspects, 1536 dims, "Claude", "60-90 seconds") — see backlog item "Update all static pipeline descriptions."

---

## How to use this file

- When a task is completed in a session, mark it `[x]` and move it to the Completed section with a date and brief summary.
- When starting a new session, say "check the backlog" — Claude Code will read this file and propose what to work on.
- Add items freely — the format is loose on purpose.
