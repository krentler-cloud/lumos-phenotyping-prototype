-- 010_voyage_embeddings.sql
-- Resize embedding column from 1536 (OpenAI text-embedding-3-small) to 1024 (Voyage voyage-multimodal-3)
-- SCIENCE-FEEDBACK P2-F

-- Drop the IVFFlat index first (can't alter column type with index present)
DROP INDEX IF EXISTS corpus_chunks_embedding_idx;

-- Truncate existing embeddings (they're the wrong dimensions, must re-embed)
UPDATE corpus_chunks SET embedding = NULL;

-- Alter column type
ALTER TABLE corpus_chunks ALTER COLUMN embedding TYPE vector(1024);

-- Recreate both RPC functions with new vector dimension
CREATE OR REPLACE FUNCTION match_corpus_chunks(
  query_embedding vector(1024),
  match_count     int default 20
)
RETURNS TABLE (
  chunk_id    uuid,
  doc_id      uuid,
  title       text,
  source_type text,
  content     text,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    cc.id          AS chunk_id,
    cc.doc_id,
    cd.title,
    cd.source_type,
    cc.content,
    1 - (cc.embedding <=> query_embedding) AS similarity
  FROM corpus_chunks cc
  JOIN corpus_docs cd ON cd.id = cc.doc_id
  WHERE cd.status = 'ready'
  ORDER BY cc.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION match_corpus_chunks_weighted(
  query_embedding vector(1024),
  match_count     int default 30,
  source_boost    jsonb default '{"clinical_trial": 1.20, "regulatory": 1.15}'
)
RETURNS TABLE (
  chunk_id    uuid,
  doc_id      uuid,
  title       text,
  source_type text,
  content     text,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    cc.id          AS chunk_id,
    cc.doc_id,
    cd.title,
    cd.source_type,
    cc.content,
    (1 - (cc.embedding <=> query_embedding)) *
      coalesce((source_boost ->> cd.source_type)::float, 1.0) AS similarity
  FROM corpus_chunks cc
  JOIN corpus_docs cd ON cd.id = cc.doc_id
  WHERE cd.status = 'ready'
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Rebuild IVFFlat index (lists=100 fine for current corpus, bump to 200 after E-2)
CREATE INDEX corpus_chunks_embedding_idx ON corpus_chunks
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
