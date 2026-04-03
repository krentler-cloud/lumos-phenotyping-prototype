-- RPC function for vector similarity search
-- Run this in the Supabase SQL editor after 001_initial_schema.sql

create or replace function match_corpus_chunks(
  query_embedding vector(1536),
  match_count     int default 20
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
    1 - (cc.embedding <=> query_embedding) as similarity
  from corpus_chunks cc
  join corpus_docs cd on cd.id = cc.doc_id
  where cd.status = 'ready'
  order by cc.embedding <=> query_embedding
  limit match_count;
$$;
