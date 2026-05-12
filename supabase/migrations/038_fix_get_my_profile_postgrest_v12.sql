-- ── Migration 038: Fix get_my_profile for PostgREST v12 ──────────────────────
--
-- PROBLEM:
--   PostgREST v12 changed how it resolves 0-parameter RPC functions when the
--   caller sends `Content-Type: application/json` with body `{}`.
--   In v12, `{}` body is treated as a single JSON-object argument, so PostgREST
--   looks for `get_my_profile(json)` — not `get_my_profile()` — and returns
--   PGRST202 "Could not find function". This breaks ALL calls to getSession()
--   in the Next.js app, causing every user to fall back to the minimal session
--   with `capability: null` and `orgId: 000...0001`.
--
-- FIX:
--   Drop the 0-param version and recreate with an optional `_unused json DEFAULT NULL`
--   parameter. PostgREST v12 sends `{}` body → PostgreSQL receives JSON arg → matches
--   this function (the arg is ignored). The Supabase JS client's supabase.rpc() call
--   requires no changes.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old 0-param version first (CREATE OR REPLACE doesn't replace a
-- differently-signatured overload; it would create a second overload instead,
-- which makes the ambiguity WORSE in PostgREST v12).
DROP FUNCTION IF EXISTS get_my_profile();

-- Recreate with an optional dummy JSON parameter.
-- The body `{}` sent by supabase.rpc() is now matched to `_unused json DEFAULT NULL`.
CREATE OR REPLACE FUNCTION get_my_profile(_unused json DEFAULT NULL)
RETURNS TABLE (
  user_id          UUID,
  org_id           UUID,
  org_name         TEXT,
  org_slug         TEXT,
  full_name        TEXT,
  avatar_url       TEXT,
  role             TEXT,       -- legacy app_role (still used by PW RLS)
  department       TEXT,       -- 'pw' | 'fm' | 'both'  (from profiles)
  role_slug        TEXT,       -- e.g. 'facilities_manager', 'zone_manager'
  capability       TEXT,       -- e.g. 'org_admin', 'fm_manager', 'fm_viewer'
  role_name        TEXT,       -- display name e.g. 'Facilities Manager'
  role_color       TEXT        -- hex colour for UI badge
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id              AS user_id,
    p.org_id,
    o.name            AS org_name,
    o.slug            AS org_slug,
    p.full_name,
    p.avatar_url,
    COALESCE(ur.role::TEXT, 'viewer')        AS role,
    COALESCE(p.department,  'pw')            AS department,
    ord.slug                                 AS role_slug,
    ord.capability_level::TEXT               AS capability,
    ord.name                                 AS role_name,
    ord.color                                AS role_color
  FROM profiles p
  JOIN organizations o ON o.id = p.org_id
  LEFT JOIN user_roles ur
    ON ur.user_id = p.id AND ur.org_id = p.org_id
  LEFT JOIN org_role_definitions ord
    ON ord.id = ur.role_definition_id
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION get_my_profile(_unused json) TO authenticated;
