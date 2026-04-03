-- Phase 2: clinical patients + reports

-- Clinical patients (N=16 synthetic XYL-1001 Phase 1 trial participants)
CREATE TABLE IF NOT EXISTS clinical_patients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id         uuid NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  patient_code     text NOT NULL,              -- "XYL-001"
  subtype_label    text,                       -- assigned by Phase 2 clustering: 'A'|'B'|'C'|'uncertain'

  -- Baseline biomarkers
  baseline_hamd17          numeric NOT NULL,
  baseline_madrs           numeric NOT NULL,
  baseline_bdnf_ng_ml      numeric NOT NULL,
  baseline_tnf_alpha_pg_ml numeric NOT NULL,
  baseline_il6_pg_ml       numeric NOT NULL,
  baseline_crp_mg_l        numeric NOT NULL,
  baseline_sleep_regularity numeric NOT NULL,  -- 0-1
  baseline_anhedonia_subscale numeric NOT NULL, -- 0-12
  prior_ad_trials          int NOT NULL DEFAULT 0,
  age                      int NOT NULL,
  sex                      text NOT NULL,       -- 'M'|'F'

  -- Outcomes
  wk2_madrs        numeric,
  wk4_madrs        numeric,
  wk8_madrs        numeric,
  wk2_bdnf         numeric,
  wk4_il6          numeric,
  response_status  text NOT NULL DEFAULT 'uncertain', -- 'responder'|'nonresponder'|'uncertain'

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinical_patients_study_id_idx ON clinical_patients(study_id);

-- Phase 2 reports
CREATE TABLE IF NOT EXISTS phase2_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  study_id    uuid NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  report_data jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phase2_reports_run_id_idx   ON phase2_reports(run_id);
CREATE INDEX IF NOT EXISTS phase2_reports_study_id_idx ON phase2_reports(study_id);

-- Add phase2_run_id to studies
ALTER TABLE studies ADD COLUMN IF NOT EXISTS phase2_run_id uuid;
