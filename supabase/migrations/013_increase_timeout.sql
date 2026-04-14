-- 013_increase_timeout.sql
-- Increase statement_timeout from 30s to 60s for vector search on 346K+ chunks.
-- The IVFFlat index with lists=200 can take >30s on cold starts or
-- multi-aspect parallel queries against the full corpus.

ALTER ROLE authenticator SET statement_timeout = '60s';
ALTER ROLE anon SET statement_timeout = '60s';
