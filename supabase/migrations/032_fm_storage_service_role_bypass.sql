-- ───────────────────────────────────────────────────────────────────
-- 032_fm_storage_service_role_bypass.sql
--
-- Self-hosted Supabase Storage v3+ does NOT bypass RLS on storage.objects
-- for the service_role JWT — every storage request runs RLS regardless of
-- role. Migration 031 added user-scoped INSERT/UPDATE/DELETE policies that
-- depend on auth.uid(), but the storage-api forwards the JWT in a way that
-- leaves auth.uid() NULL during inserts, so application-server uploads
-- using the service-role key were being denied.
--
-- Fix: add a blanket FOR ALL policy that allows the service_role JWT to
-- read/write/delete objects in the fm-uploads bucket. Server-side routes
-- are the only callers using this key, and they always run org-ownership
-- checks at the application layer before touching storage.
-- ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fm_uploads_service_role_all" ON storage.objects;

CREATE POLICY "fm_uploads_service_role_all"
  ON storage.objects
  FOR ALL
  TO public
  USING (bucket_id = 'fm-uploads' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'fm-uploads' AND auth.role() = 'service_role');

-- Sanity: confirm the policy now exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'fm_uploads_service_role_all'
  ) THEN
    RAISE EXCEPTION 'fm_uploads_service_role_all policy was not created';
  END IF;
END $$;
