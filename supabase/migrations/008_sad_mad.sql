-- SAD/MAD cohort data for Phase 1 Human Data tab

CREATE TABLE IF NOT EXISTS sad_mad_cohorts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id              uuid NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  phase                 text NOT NULL CHECK (phase IN ('SAD', 'MAD')),
  cohort_name           text NOT NULL,
  dose_mg               numeric NOT NULL,
  n_active              int NOT NULL,
  n_placebo             int NOT NULL,
  status                text NOT NULL DEFAULT 'Complete',

  -- PK (SAD primary, MAD accumulation)
  cmax_mean_ng_ml       numeric,
  cmax_sd               numeric,
  tmax_mean_h           numeric,
  auc0t_mean            numeric,
  half_life_mean_h      numeric,
  bioavailability_pct   numeric,
  accumulation_ratio    numeric,

  -- Pharmacodynamics (MAD day-14 biomarker changes)
  bdnf_pct_change_day14 numeric,
  bdnf_pct_change_sd    numeric,
  bdnf_p_value          numeric,
  il6_pct_change_day14  numeric,
  crp_pct_change_day14  numeric,

  -- Safety
  ae_rate_pct           numeric NOT NULL DEFAULT 0,
  ae_max_grade          int NOT NULL DEFAULT 0,
  discontinuations      int NOT NULL DEFAULT 0,
  ae_description        text,

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sad_mad_cohorts_study_cohort_idx ON sad_mad_cohorts(study_id, cohort_name);
CREATE INDEX IF NOT EXISTS sad_mad_cohorts_study_id_idx ON sad_mad_cohorts(study_id);
CREATE INDEX IF NOT EXISTS sad_mad_cohorts_phase_idx    ON sad_mad_cohorts(study_id, phase);

-- Extend clinical_patients with additional genotype/phenotype columns from CSV
ALTER TABLE clinical_patients
  ADD COLUMN IF NOT EXISTS val66met_genotype   text,
  ADD COLUMN IF NOT EXISTS cyp2d6_status       text,
  ADD COLUMN IF NOT EXISTS prior_ssri_exposure boolean,
  ADD COLUMN IF NOT EXISTS symptom_cluster     text;

-- Make existing required-but-not-in-CSV columns nullable so CSV-sourced rows can omit them
ALTER TABLE clinical_patients
  ALTER COLUMN age DROP NOT NULL,
  ALTER COLUMN sex DROP NOT NULL,
  ALTER COLUMN baseline_sleep_regularity  DROP NOT NULL,
  ALTER COLUMN baseline_anhedonia_subscale DROP NOT NULL;

-- Unique constraint needed for idempotent upsert in seed-clinical-data.ts
CREATE UNIQUE INDEX IF NOT EXISTS clinical_patients_study_patient_idx ON clinical_patients(study_id, patient_code);
