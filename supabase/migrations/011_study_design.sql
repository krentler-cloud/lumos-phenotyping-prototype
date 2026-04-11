-- 011_study_design.sql
-- Add MDD and healthy volunteer counts to studies table.
-- trial_size (80) already exists; these break it into cohorts.

ALTER TABLE studies ADD COLUMN IF NOT EXISTS mdd_n int DEFAULT 16;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS healthy_volunteer_n int DEFAULT 64;

-- Update the seed study
UPDATE studies
SET mdd_n = 16, healthy_volunteer_n = 64
WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

COMMENT ON COLUMN studies.mdd_n IS 'MDD efficacy patients in Phase 2 phenotyping cohort';
COMMENT ON COLUMN studies.healthy_volunteer_n IS 'Healthy volunteers in SAD/MAD PK/safety cohort';
