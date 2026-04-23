-- ============================================================
-- Migration 024: Add department column to profiles
--
-- 'pw'   — Public Works staff (see PW module only)
-- 'fm'   — Facility Management staff (see FM module only)
-- 'both' — Cross-module staff (admin, shared resources)
--
-- Used by the Team page to filter user lists by current appMode.
-- No RLS change needed — org_id already isolates data.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'pw';

-- Admin accounts default to 'both' so they appear in all module views.
-- Applied to any user already marked admin in user_roles.
UPDATE profiles p
SET department = 'both'
FROM user_roles r
WHERE r.user_id = p.id AND r.role = 'admin';

COMMENT ON COLUMN profiles.department IS
  'Module assignment: pw | fm | both. Used for UI filtering; not a security boundary.';
