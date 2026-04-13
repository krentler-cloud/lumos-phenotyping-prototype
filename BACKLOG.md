# Lumos AI — Backlog

Items are grouped by priority. Start a session by saying "check the backlog" and Claude Code will pick up from here.

---

## Now (next session)

- [ ] **Check source-type boosting after 500:1 literature ratio**
  The 42 original clinical_trial/regulatory docs now compete with ~7,712 literature papers. Run a Planning Phase analysis and check whether the report still cites clinical trial evidence adequately. If results lean too heavily on literature, increase `clinical_trial` sourceBoost from 1.20 → 1.40 in `searchCorpusWeighted` (`lib/pipeline/search.ts`).

- [ ] **Fix CorpusDocList "1000 documents ready" pagination**
  The doc list on the corpus page caps at 1,000 rows (PostgREST default limit). Stats are fixed (showing 7,754) but the list still shows "1000 documents ready". Needs `count: 'exact'` for the header and pagination for the list.

- [ ] **Redesign Study Overview page to clearly articulate what we're doing**
  The Study Overview page needs to communicate what Lumos AI does, the two-phase structure, the study design (N=80), the pipeline, and current corpus stats (live from DB — now ~7,754 docs / 346K chunks).

- [ ] **Run Supabase migration 011 (study design columns)**
  ```sql
  ALTER TABLE studies ADD COLUMN IF NOT EXISTS mdd_n int DEFAULT 16;
  ALTER TABLE studies ADD COLUMN IF NOT EXISTS healthy_volunteer_n int DEFAULT 64;
  UPDATE studies SET mdd_n = 16, healthy_volunteer_n = 64
  WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  ```

- [ ] **E-2b: Generate "missing high-relevance papers" report for manual retrieval**
  Generate prioritized list of highest-relevance papers that failed all download tiers. Output CSV sorted by relevance score. Top 50-100 can be retrieved manually via university library access, author preprints, or interlibrary loan.

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
  
  **Two batch runs:**
  - Batch 1 (10K papers, $20 Tier 4 budget): 3,732 docs ingested
  - Batch 2 (75K papers, free-only): ~4,000 more docs ingested overnight
  
  **4-tier waterfall results:** Unpaywall (free) was the dominant source (~57% of successes). OpenAlex Tier 4 (~$2.82 spent). PMC and publisher tiers contributed minimally.
  
  **Voyage AI embedding cost: ~$118** (higher than estimated due to crash/restart cycles re-embedding same papers). Fixed: dedup check now runs BEFORE embed call.
  
  **Index:** IVFFlat with `lists=200` on 346K chunks. Required disk upgrade (autoscaling enabled) and compute upgrade (Small tier, 2 CPU / 4 GB RAM — can downgrade after index build).
  
  **Planning Phase validated:** 42% corpus confidence on 7,700+ doc corpus — expected, reflects more diverse/contradictory evidence.

- [ ] **E-2b: Missing papers report** — see "Now" section

- [ ] **E-3: Qdrant migration (decision gate)**
  At 346K chunks with single concurrent user, pgvector IVFFlat is handling queries fine (30s timeout, within limits). Revisit if: query latency >500ms consistently, storage overages, or concurrent users.

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
- Supabase compute add-on (Small, $25/mo) can be downgraded back to free after index is stable
- Corpus stats API fixed but CorpusDocList still caps at 1,000 rows

---

## Completed

- [x] **E-2 corpus ingestion complete** — April 13, 2026 (see Track E section for details)
- [x] **IVFFlat index rebuilt on 346K chunks** — April 13, 2026. Lists=200, required disk autoscaling + compute upgrade.
- [x] **Corpus stats API fix** — April 12, 2026. PostgREST 1,000 row limit was silently truncating counts. Replaced with parallel count queries.
- [x] **Vector search timeout fix** — April 11, 2026. Migration 012: statement_timeout → 30s.
- [x] **Ingestion cost protection fix** — April 12, 2026. Moved `doc_already_exists()` before `embed_chunks()` to prevent re-embedding on crash/restart cycles.
- [x] **Retrieve → Rerank → Compress → Synthesize pipeline** — April 10, 2026
- [x] **P2-F: Retrieval aspect rewrite + Voyage AI migration** — April 10, 2026
- [x] **F-3: Posterior confidence intervals** — April 10, 2026
- [x] **F-5: Fix synthesis prompt — phantom ensemble → real methodology** — April 10, 2026
- [x] **F-6: Fix Subtype C concordance inflation** — April 10, 2026
- [x] **Parallelize synthesis calls + exploratory biomarkers to Sonnet** — April 10, 2026
- [x] **Opus synthesis diagnostics + streaming token progress** — April 10, 2026
- [x] **Fix Opus stall detection (Promise.race)** — April 10, 2026
- [x] **Fix Ask LumosAI platform facts + reranking** — April 10, 2026
- [x] **Guard Phase 2 from running during Phase 1** — April 10, 2026
- [x] **Update pipeline descriptions + timestamps** — April 10, 2026
- [x] **Study design N=80 + dynamic patient counts** — April 10, 2026

---

## How to use this file

- When a task is completed, mark it `[x]` and move to Completed with a date and brief summary.
- When starting a new session, say "check the backlog".
- Add items freely — the format is loose on purpose.
