-- Phase 1 reports table (drug-level, no patient data)
CREATE TABLE IF NOT EXISTS phase1_reports (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references runs(id) on delete cascade,
  study_id    uuid not null references studies(id) on delete cascade,
  report_data jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS phase1_reports_run_id_idx   ON phase1_reports(run_id);
CREATE INDEX IF NOT EXISTS phase1_reports_study_id_idx ON phase1_reports(study_id);
