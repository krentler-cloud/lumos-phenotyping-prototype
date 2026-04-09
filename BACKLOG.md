# Lumos AI — Backlog

Items are grouped by priority. Start a session by saying "check the backlog" and Claude Code will pick up from here.

---

## Now (next session)

- [ ] **Phase 2 processing page: live corpus stats + corrected descriptions**
  Phase 1 processing page was just updated to pull live doc/chunk counts from the DB and corrected all stale numbers and vendor references. Phase 2 processing page (`app/studies/[studyId]/phase2/processing/page.tsx`) needs the same treatment:
  - Split into server wrapper + `Phase2ProcessingClient.tsx` (same pattern as Phase 1)
  - Server wrapper fetches corpus doc count and passes as prop
  - Review all `STEP_DESCRIPTIONS` for accuracy — particularly "Clinical ML analysis" (check actual model, feature count, patient N) and "Clinical synthesis" (no vendor references)
  - Confirm no third-party AI company references in any description text

- [ ] **Verify analysis runs end-to-end after the direct-function-call fix**
  The Railway proxy timeout fix (replacing fire-and-forget HTTP with direct function imports) was deployed but never confirmed working — runs kept getting stuck during the debugging sessions. Confirm a full Planning Phase run completes successfully and produces a valid report.

---

## Soon

- [ ] **SCIENCE-FEEDBACK markers: audit and resolve**
  There are ~25 `SCIENCE-FEEDBACK: P1-A` and related markers scattered across the codebase (visible in a grep). These appear to be placeholders for science review feedback that hasn't been fully actioned. Audit what each marker means and either implement the fix or document why it's deferred. Key markers:
  - `P1-A` — appears most frequently; relates to "Planning Phase" label consistency
  - `P1-B` — confidence score interpretation
  - `P1-F` — SAD/MAD cohort data integration
  - `F2-A` through `F2-F` — FDA safety, behavioral profiles, EEG, sex-specific ranges, Val66Met ancestry, rater reliability

- [ ] **Dynamic chunk count scaling**
  Currently hardcoded at 40 chunks sent to Claude. Should scale based on similarity score distribution as corpus grows. See Architecture Roadmap in CLAUDE.md for trigger conditions and solution approach.

---

## Later

- [ ] **Migrate embedding model to Voyage AI**
  Current model: `text-embedding-3-small` (1,536 dims) in `lib/pipeline/embed.ts`.
  Target: Voyage AI `voyage-3` or `voyage-large-2-instruct`.
  Requires re-embedding the entire corpus (one-time migration script).
  **Do not implement until** similarity p50 drops below 0.72 consistently across synthesis runs, or a qualitative audit confirms retrieval gaps.
  Full details in CLAUDE.md Architecture Roadmap.

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
