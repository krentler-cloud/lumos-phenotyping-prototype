-- ============================================================
-- Lumos AI — Initial Schema
-- Run once in Supabase SQL editor before starting development
-- ============================================================

-- Enable pgvector
create extension if not exists vector;

-- ── CORPUS ──────────────────────────────────────────────────────────────────

-- Raw corpus documents (literature, clinical trial docs, etc.)
create table corpus_docs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz default now(),
  title        text not null,
  source_type  text not null check (source_type in ('literature','clinical_trial','internal','regulatory')),
  filename     text,
  storage_path text,          -- Supabase Storage path
  char_count   integer,
  chunk_count  integer,
  status       text default 'pending' check (status in ('pending','processing','ready','error')),
  metadata     jsonb default '{}'
);

-- Chunked + embedded corpus content
create table corpus_chunks (
  id           uuid primary key default gen_random_uuid(),
  doc_id       uuid references corpus_docs(id) on delete cascade,
  chunk_index  integer not null,
  content      text not null,
  embedding    vector(1536),   -- OpenAI text-embedding-3-small dimension
  token_count  integer,
  metadata     jsonb default '{}'
);

-- Fast ANN index on embeddings
create index on corpus_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ── PATIENT DATA ─────────────────────────────────────────────────────────────

create table patients (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz default now(),
  study_id       text,          -- e.g. "STUDY-001"
  patient_code   text,          -- anonymized identifier
  data           jsonb not null, -- structured preclinical data
  source_type    text default 'synthetic' check (source_type in ('synthetic','preclinical','clinical')),
  uploaded_by    uuid references auth.users(id)
);

-- ── ANALYSIS RUNS ────────────────────────────────────────────────────────────

create table runs (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  patient_id      uuid references patients(id),
  study_id        text,
  status          text default 'queued'
                    check (status in ('queued','processing','complete','error')),
  phase           text default 'preclinical'
                    check (phase in ('preclinical','clinical')),
  corpus_snapshot jsonb,        -- stats at time of run
  step_log        jsonb default '[]',
  error_message   text,
  started_at      timestamptz,
  completed_at    timestamptz
);

-- ── REPORTS ──────────────────────────────────────────────────────────────────

create table reports (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz default now(),
  run_id               uuid references runs(id) on delete cascade,
  report_type          text check (report_type in ('preclinical','final')),

  -- Core phenotyping outputs
  responder_prob       numeric(4,3),
  confidence           numeric(4,3),
  phenotype_label      text,

  -- Structured content
  executive_summary    text,
  responder_profile    jsonb,
  nonresponder_profile jsonb,
  key_biomarkers       jsonb,
  matched_corpus_refs  jsonb,
  methodology_notes    text,
  recommendations      jsonb,

  -- Raw LLM output for auditability
  raw_llm_output       jsonb,

  -- Delta fields (for clinical phase comparisons)
  delta_vs_run_id      uuid references runs(id),
  confidence_delta     numeric(5,3),
  accuracy_delta       numeric(5,3),
  biomarker_additions  jsonb,
  threshold_change     jsonb
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

alter table corpus_docs      enable row level security;
alter table corpus_chunks     enable row level security;
alter table patients          enable row level security;
alter table runs              enable row level security;
alter table reports           enable row level security;

-- Prototype: authenticated users can read/write everything
-- Tighten per-org before production
create policy "authenticated read"  on corpus_docs   for select using (auth.role() = 'authenticated');
create policy "authenticated write" on corpus_docs   for insert with check (auth.role() = 'authenticated');
create policy "authenticated read"  on corpus_chunks for select using (auth.role() = 'authenticated');
create policy "authenticated write" on corpus_chunks for insert with check (auth.role() = 'authenticated');
create policy "authenticated all"   on patients      for all    using (auth.role() = 'authenticated');
create policy "authenticated all"   on runs          for all    using (auth.role() = 'authenticated');
create policy "authenticated all"   on reports       for all    using (auth.role() = 'authenticated');
