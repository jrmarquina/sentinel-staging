-- ───────────────────────────────────────────────────────────────────
-- 033_fm_storage_service_role_target.sql
--
-- Migration 032 tried to allow service_role uploads via a policy that
-- checks `auth.role() = 'service_role'`, but auth.role() reads from a
-- session GUC that storage-api does not always populate during inserts.
-- The storage-api DOES, however, execute SET ROLE service_role on its
-- Postgres connection when the request bears a service_role JWT.
--
-- Fix: target the Postgres role directly (TO service_role) so the policy
-- engine matches based on the active connection role rather than the JWT
-- claim. This is the same pattern Supabase's built-in policies use.
-- ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fm_uploads_service_role_all" ON storage.objects;

CREATE POLICY "fm_uploads_service_role_all"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'fm-uploads')
  WITH CHECK (bucket_id = 'fm-uploads');

-- Also grant service_role full DML on storage.objects in case the role
-- itself lacks the privilege (default Supabase grants this, but a custom
-- role configuration might not).
GRANT ALL ON storage.objects TO service_role;
GRANT ALL ON storage.buckets TO service_role;
