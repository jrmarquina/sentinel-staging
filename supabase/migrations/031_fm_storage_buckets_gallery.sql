-- ─────────────────────────────────────────────────────────────────────────────
-- 031_fm_storage_buckets_gallery.sql
--
-- Fixes the property cover-image upload (was hitting RLS on a non-existent
-- "photos" bucket) and provisions storage for the new property gallery.
--
-- Decisions:
--   * fm-uploads becomes public so cover images and gallery thumbnails can
--     be embedded directly in <img src> across the dashboard. The keys are
--     org-scoped UUIDs — not guessable.
--   * Old "fm_uploads_org_access" policy (PW-role only) is replaced with
--     a permissive set that works for both PW roles AND FM capabilities.
--   * Service-role bypasses RLS by default; no extra policy needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Make fm-uploads public + raise the limit a bit for gallery PDFs/Office docs.
UPDATE storage.buckets
   SET public = TRUE,
       file_size_limit    = 20 * 1024 * 1024,    -- 20 MB
       allowed_mime_types = ARRAY[
         'image/jpeg','image/jpg','image/png','image/webp','image/heic','image/gif',
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'text/plain','text/csv'
       ]
 WHERE id = 'fm-uploads';

-- If for any reason the row doesn't exist (fresh DB), create it.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fm-uploads', 'fm-uploads', TRUE, 20 * 1024 * 1024,
  ARRAY[
    'image/jpeg','image/jpg','image/png','image/webp','image/heic','image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv'
  ]
) ON CONFLICT (id) DO NOTHING;

-- 2. Drop the old restrictive policy.
DROP POLICY IF EXISTS "fm_uploads_org_access"   ON storage.objects;
DROP POLICY IF EXISTS "fm_uploads_select_org"   ON storage.objects;
DROP POLICY IF EXISTS "fm_uploads_insert_org"   ON storage.objects;
DROP POLICY IF EXISTS "fm_uploads_update_org"   ON storage.objects;
DROP POLICY IF EXISTS "fm_uploads_delete_org"   ON storage.objects;
DROP POLICY IF EXISTS "fm_uploads_public_read"  ON storage.objects;

-- 3. Public read: bucket is public, so anyone with the URL can fetch.
CREATE POLICY "fm_uploads_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'fm-uploads');

-- 4. Authenticated org members can write to their own org's path.
--    Path layout enforced: "<org_id>/..." — first folder MUST equal user's org.
CREATE POLICY "fm_uploads_insert_org" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fm-uploads'
    AND (storage.foldername(name))[1] = (
      SELECT org_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "fm_uploads_update_org" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'fm-uploads'
    AND (storage.foldername(name))[1] = (
      SELECT org_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "fm_uploads_delete_org" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'fm-uploads'
    AND (storage.foldername(name))[1] = (
      SELECT org_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- 5. fm_attachments — extend write access to FM capabilities (was PW-roles only).
--    The contributor capability needs to add gallery items too.
DROP POLICY IF EXISTS "fm_attachments_capability_write" ON fm_attachments;
CREATE POLICY "fm_attachments_capability_write" ON fm_attachments
  FOR ALL
  TO authenticated
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  );
