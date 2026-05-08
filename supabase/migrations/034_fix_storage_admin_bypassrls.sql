-- ───────────────────────────────────────────────────────────────────
-- 034_fix_storage_admin_bypassrls.sql
--
-- Root cause of the "new row violates row-level security policy" errors
-- on the fm-uploads bucket: the supabase_storage_admin Postgres role —
-- which storage-api uses to write to storage.objects — was missing the
-- BYPASSRLS attribute. service_role had it, but storage-api never
-- connects as service_role; it connects as supabase_storage_admin and
-- relies on BYPASSRLS to skip RLS regardless of the calling JWT.
--
-- This is the default in stock Supabase docker-compose; the staging
-- stack drifted at some point.
--
-- Fix: restore BYPASSRLS on the role. Idempotent.
-- ───────────────────────────────────────────────────────────────────

ALTER ROLE supabase_storage_admin BYPASSRLS;

DO $$
BEGIN
  IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    RAISE EXCEPTION 'Failed to grant BYPASSRLS to supabase_storage_admin';
  END IF;
END $$;
