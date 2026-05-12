-- ─────────────────────────────────────────────────────────────────────────────
-- 037_password_lock.sql
--
-- Adds a password_locked flag to profiles so org_admin can create accounts
-- with admin-assigned passwords that users cannot change themselves.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS password_locked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN profiles.password_locked IS
  'When TRUE, the user cannot change their own password via the Settings page.
   Only org_admin can update this flag. Useful for shared/kiosk accounts or
   accounts where the admin controls credentials.';
