-- Weighted vector similarity search with source-type boosting
-- Run in Supabase SQL editor after 002_match_chunks_function.sql

create or replace function match_corpus_chunks_weighted(
  query_embedding vector(1536),
  match_count     int default 30,
  source_boost    jsonb default '{"clinical_trial": 1.20, "regulatory": 1.15}'
)
returns table (
  chunk_id    uuid,
  doc_id      uuid,
  title       text,
  source_type text,
  content     text,
  similarity  float
)
language sql stable
as $$
  select
    cc.id          as chunk_id,
    cc.doc_id,
    cd.title,
    cd.source_type,
    cc.content,
    (1 - (cc.embedding <=> query_embedding)) *
      coalesce((source_boost ->> cd.source_type)::float, 1.0) as similarity
  from corpus_chunks cc
  join corpus_docs cd on cd.id = cc.doc_id
  where cd.status = 'ready'
  order by similarity desc
  limit match_count;
$$;
