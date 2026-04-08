-- Enable RLS on tables added after initial schema (005–008)
-- Matches the prototype policy pattern from 001: authenticated users can do everything.
-- Tighten to per-org / per-study policies before multi-tenant production.

ALTER TABLE studies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase1_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase2_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sad_mad_cohorts   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated all" ON studies           FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated all" ON phase1_reports    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated all" ON clinical_patients FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated all" ON phase2_reports    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated all" ON sad_mad_cohorts   FOR ALL USING (auth.role() = 'authenticated');
