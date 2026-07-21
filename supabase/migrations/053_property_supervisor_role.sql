-- =============================================================
-- Migration 053: Property Supervisor role
--
-- Adds a "Property Supervisor" — an FM role (a supervisor subclass)
-- responsible for the physical inventory: entering assets into
-- properties, adding classrooms/rooms (spaces), and registering
-- custodial personnel.
--
-- Capability: org_manager (full FM operational access via the
-- existing _manage RLS policies — assets, spaces, custodians, and
-- the movements ledger). It intentionally does NOT grant user/role
-- management (that stays with org_admin).
--
-- Legacy app_role: 'supervisor' (so the app's requireRole gates,
-- which check the legacy role, admit this user). This migration
-- teaches fm_normalize_role() to map the new slug accordingly.
-- =============================================================

-- ── 1. Normalize the new role slug to the legacy 'supervisor' ─
CREATE OR REPLACE FUNCTION fm_normalize_role(p_role TEXT)
RETURNS app_role
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN CASE upper(trim(p_role))
    WHEN 'ADMIN'               THEN 'admin'::app_role
    WHEN 'MANAGER'             THEN 'supervisor'::app_role
    WHEN 'INSPECTOR'           THEN 'inspector'::app_role
    WHEN 'CLIENT_VIEWER'       THEN 'viewer'::app_role
    -- PW / platform role names pass through unchanged
    WHEN 'SUPERVISOR'          THEN 'supervisor'::app_role
    WHEN 'PROPERTY_SUPERVISOR' THEN 'supervisor'::app_role
    WHEN 'FACILITIES_MANAGER'  THEN 'supervisor'::app_role
    WHEN 'VENDOR'              THEN 'vendor'::app_role
    WHEN 'VIEWER'              THEN 'viewer'::app_role
    ELSE                            'viewer'::app_role
  END;
END;
$$;

-- ── 2. Seed the role definition for the FM department ────────
DO $$
DECLARE
  v_org_id     UUID;
  v_fm_dept_id UUID;
BEGIN
  SELECT id INTO v_org_id FROM organizations ORDER BY created_at LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No org found — skipping property_supervisor seed';
    RETURN;
  END IF;

  SELECT id INTO v_fm_dept_id
  FROM org_departments WHERE org_id = v_org_id AND slug = 'fm' LIMIT 1;
  IF v_fm_dept_id IS NULL THEN
    RAISE NOTICE 'No FM department — skipping property_supervisor seed';
    RETURN;
  END IF;

  INSERT INTO org_role_definitions
    (org_id, department_id, name, slug, capability_level, description, color)
  VALUES
    (v_org_id, v_fm_dept_id,
     'Property Supervisor', 'property_supervisor', 'org_manager',
     'Manages physical inventory: enters assets, adds rooms/spaces, and registers custodial personnel across properties',
     '#0ea5e9')
  ON CONFLICT (org_id, department_id, slug) DO UPDATE
    SET capability_level = EXCLUDED.capability_level,
        description      = EXCLUDED.description,
        color            = EXCLUDED.color;
END $$;
