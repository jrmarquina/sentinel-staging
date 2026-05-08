-- ───────────────────────────────────────────────────────────────────
-- 035_storage_admin_role_membership.sql
--
-- The actual root cause of "new row violates row-level security policy"
-- on storage operations was Postgres error 42501 (insufficient privilege)
-- thrown from set_config('role', $1, true). storage-api's first SQL on
-- every request switches the connection role to anon / authenticated /
-- service_role based on the JWT, but supabase_storage_admin (the role
-- in DATABASE_URL) lacked membership in those roles, so the SET ROLE
-- failed and the surrounding INSERT was reported back as an RLS denial.
--
-- Fix: grant role membership so supabase_storage_admin can become any
-- of the three Supabase JWT roles for the duration of a request.
-- This is the default in stock Supabase docker-compose; the staging
-- stack drifted at some point.
-- ───────────────────────────────────────────────────────────────────

GRANT anon          TO supabase_storage_admin;
GRANT authenticated TO supabase_storage_admin;
GRANT service_role  TO supabase_storage_admin;

-- Verify
DO $$
DECLARE
  missing text[];
BEGIN
  SELECT array_agg(role_to_check) INTO missing
  FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS v(role_to_check)
  WHERE NOT pg_has_role('supabase_storage_admin', role_to_check, 'MEMBER');
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'supabase_storage_admin still missing membership in: %', missing;
  END IF;
END $$;
