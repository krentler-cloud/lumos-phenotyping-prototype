-- Extended report fields for pre-clinical ML outputs
-- Run in Supabase SQL editor after 003_weighted_search.sql

alter table reports add column if not exists extended_report jsonb default '{}';

-- Expand report_type to include 'clinical'
alter table reports drop constraint if exists reports_report_type_check;
alter table reports add constraint reports_report_type_check
  check (report_type in ('preclinical', 'clinical', 'final'));
