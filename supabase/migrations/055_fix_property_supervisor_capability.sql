-- =============================================================
-- Migration 055: Fix capability value for the mobile-asset feature
--
-- Migrations 052 and 053 referenced the pre-036 enum label
-- 'org_manager', which migration 036 renamed to 'fm_manager'. On
-- environments where 052/053 were already recorded as applied, the
-- offending statements errored (the deploy applies migrations without
-- ON_ERROR_STOP, so psql still exited 0 and the files were marked
-- done). The net effect was three missing write policies, a missing
-- property_supervisor role definition, and a crios account without
-- the right role binding.
--
-- This migration is idempotent and repairs all three. On a fresh
-- database (where the corrected 052/053 already did the right thing)
-- it simply re-asserts the same state.
-- =============================================================

-- ── 1. Recreate the three write policies with the correct value ──
DROP POLICY IF EXISTS "fm_custodians_manage" ON fm_custodians;
CREATE POLICY "fm_custodians_manage" ON fm_custodians
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

DROP POLICY IF EXISTS "fm_spaces_manage" ON fm_spaces;
CREATE POLICY "fm_spaces_manage" ON fm_spaces
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

DROP POLICY IF EXISTS "fm_movements_insert" ON fm_asset_movements;
CREATE POLICY "fm_movements_insert" ON fm_asset_movements
  FOR INSERT WITH CHECK (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

-- ── 2. Ensure the Property Supervisor role definition exists ─────
DO $$
DECLARE
  v_org_id     UUID;
  v_fm_dept_id UUID;
BEGIN
  SELECT id INTO v_org_id FROM organizations ORDER BY created_at LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE NOTICE '055: no org found — skipping';
    RETURN;
  END IF;

  SELECT id INTO v_fm_dept_id
  FROM org_departments WHERE org_id = v_org_id AND slug = 'fm' LIMIT 1;
  IF v_fm_dept_id IS NULL THEN
    RAISE NOTICE '055: no FM department — skipping';
    RETURN;
  END IF;

  INSERT INTO org_role_definitions
    (org_id, department_id, name, slug, capability_level, description, color)
  VALUES
    (v_org_id, v_fm_dept_id,
     'Property Supervisor', 'property_supervisor', 'fm_manager',
     'Manages physical inventory: enters assets, adds rooms/spaces, and registers custodial personnel across properties',
     '#0ea5e9')
  ON CONFLICT (org_id, department_id, slug) DO UPDATE
    SET capability_level = EXCLUDED.capability_level,
        description      = EXCLUDED.description,
        color            = EXCLUDED.color;

  -- ── 3. Re-bind crios to the property_supervisor role ──────────
  -- 054 provisioned the user, but the role definition did not yet
  -- exist, so the binding fell back. Point it at the real role now.
  UPDATE user_roles ur
  SET role_definition_id = rd.id,
      department_id      = rd.department_id,
      role               = 'supervisor'
  FROM org_role_definitions rd
  JOIN auth.users u ON u.email = 'crios@guaynabocity.gov.pr'
  WHERE ur.user_id = u.id
    AND rd.org_id = v_org_id
    AND rd.slug = 'property_supervisor';

  RAISE NOTICE '055: property_supervisor capability repaired (fm_manager).';
END $$;
