-- 012_search_timeout.sql
-- Increase statement_timeout for vector search queries.
-- Default is 8s which is too short for IVFFlat search on 13K+ chunks.
-- Set to 30s for the authenticator role (used by service_role key).

ALTER ROLE authenticator SET statement_timeout = '30s';

-- Also set for the anon role (used by browser client) in case chat search hits it
ALTER ROLE anon SET statement_timeout = '30s';
