-- Studies table — one per drug/indication engagement
CREATE TABLE IF NOT EXISTS studies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,        -- "XYL-1001 · MDD Phase 1"
  sponsor       text NOT NULL,        -- "Xylo Bio"
  drug_name     text NOT NULL,        -- "XYL-1001"
  indication    text NOT NULL,        -- "MDD"
  trial_size    int,                  -- N=80
  corpus_filter jsonb DEFAULT '{}',
  phase1_run_id uuid,
  phase2_run_id uuid,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Make patient_id optional on runs (Phase 1 runs have no patient)
ALTER TABLE runs ALTER COLUMN patient_id DROP NOT NULL;

-- Link runs to studies
ALTER TABLE runs ADD COLUMN IF NOT EXISTS study_id uuid REFERENCES studies(id);

-- Seed the Xylo Bio study
INSERT INTO studies (id, name, sponsor, drug_name, indication, trial_size)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'XYL-1001 · MDD Phase 1',
  'Xylo Bio',
  'XYL-1001',
  'MDD',
  80
) ON CONFLICT DO NOTHING;
