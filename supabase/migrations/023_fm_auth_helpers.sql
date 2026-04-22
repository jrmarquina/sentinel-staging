-- =============================================================
-- Migration 023: FM Auth Helpers
--
-- Bridges the FM role naming convention (ADMIN / MANAGER /
-- INSPECTOR / CLIENT_VIEWER) with the platform's app_role enum
-- (admin / supervisor / inspector / viewer).
--
-- Also upgrades handle_new_user() so that when a user is created
-- with `invited_role` in their metadata, the user_roles row is
-- written atomically inside the trigger — not only in app code.
-- This makes user creation via Supabase Admin API, invite links,
-- AND direct server action all produce a consistent state.
-- =============================================================


-- ── 1. FM role normaliser ─────────────────────────────────────
-- Maps FM role strings → app_role enum.
-- Returns 'viewer' for any unrecognised string (safe default).

CREATE OR REPLACE FUNCTION fm_normalize_role(p_role TEXT)
RETURNS app_role
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN CASE upper(trim(p_role))
    WHEN 'ADMIN'          THEN 'admin'::app_role
    WHEN 'MANAGER'        THEN 'supervisor'::app_role
    WHEN 'INSPECTOR'      THEN 'inspector'::app_role
    WHEN 'CLIENT_VIEWER'  THEN 'viewer'::app_role
    -- PW / platform role names pass through unchanged
    WHEN 'SUPERVISOR'     THEN 'supervisor'::app_role
    WHEN 'VENDOR'         THEN 'vendor'::app_role
    WHEN 'VIEWER'         THEN 'viewer'::app_role
    ELSE                       'viewer'::app_role
  END;
END;
$$;


-- ── 2. Upgrade handle_new_user() ──────────────────────────────
-- The original function (migration 001) only inserts into
-- profiles. This version also inserts into user_roles when
-- `invited_role` is present in the user's metadata.
--
-- Metadata keys written by both the existing inviteUserAction
-- and the new createFmUserAction:
--   org_id        UUID   — which org this user belongs to
--   invited_role  TEXT   — role string (FM or PW naming)
--   full_name     TEXT   — display name

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _org_id       UUID;
  _role_text    TEXT;
  _role         app_role;
BEGIN
  -- Resolve org
  _org_id := (NEW.raw_user_meta_data->>'org_id')::UUID;
  IF _org_id IS NULL THEN
    _org_id := '00000000-0000-0000-0000-000000000001'; -- default: Guaynabo
  END IF;

  -- Create profile (upsert so re-triggers on email confirm don't fail)
  INSERT INTO public.profiles (id, org_id, full_name)
  VALUES (
    NEW.id,
    _org_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        updated_at = NOW();

  -- Create user_roles row if invited_role is present in metadata
  _role_text := NEW.raw_user_meta_data->>'invited_role';
  IF _role_text IS NOT NULL AND trim(_role_text) != '' THEN
    _role := fm_normalize_role(_role_text);
    INSERT INTO public.user_roles (org_id, user_id, role)
    VALUES (_org_id, NEW.id, _role)
    ON CONFLICT (org_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger was already created in 001; OR REPLACE above handles it.
-- Re-state the trigger to be safe (DROP + CREATE is idempotent-safe here).
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ── 3. Helper: get_my_role() ──────────────────────────────────
-- Convenience RPC: returns the calling user's role string.
-- Used by the frontend useRole hook to avoid an extra round-trip.

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::TEXT
  FROM user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_my_role() TO authenticated;


-- ── 4. Helper: get_my_profile() ───────────────────────────────
-- Returns profile + role + org in one RPC call — replaces the
-- two separate selects currently done in DashboardLayout.

CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS TABLE (
  user_id     UUID,
  org_id      UUID,
  org_name    TEXT,
  org_slug    TEXT,
  full_name   TEXT,
  avatar_url  TEXT,
  role        TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id              AS user_id,
    p.org_id,
    o.name            AS org_name,
    o.slug            AS org_slug,
    p.full_name,
    p.avatar_url,
    COALESCE(ur.role::TEXT, 'viewer') AS role
  FROM profiles p
  JOIN organizations o ON o.id = p.org_id
  LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.org_id = p.org_id
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;
