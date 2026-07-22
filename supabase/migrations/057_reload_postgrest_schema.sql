-- =============================================================
-- Migration 057: Reload the PostgREST schema cache
--
-- PostgREST caches the database schema (tables and their
-- relationships) in memory. The mobile-asset tables added in
-- 050/051 (fm_custodians, fm_spaces, fm_asset_movements) and their
-- foreign-key relationships are invisible to the API until the cache
-- is reloaded — which manifests as /api/fm/custodians (and the
-- embedded joins on the assets and custody pages) returning an error
-- instead of an array.
--
-- This is Supabase's documented reload signal. PostgREST listens on
-- the 'pgrst' channel; the NOTIFY fires on commit and the API picks
-- up the new tables without a container restart. Harmless to run when
-- the cache is already current.
-- =============================================================

NOTIFY pgrst, 'reload schema';
