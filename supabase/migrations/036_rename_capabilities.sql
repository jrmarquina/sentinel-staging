-- ─────────────────────────────────────────────────────────────────────────────
-- 036_rename_capabilities.sql
--
-- Renames capability_level enum values to be department-prefixed,
-- adds PW capabilities, and fixes org_role_definitions data to match.
--
-- BEFORE                   AFTER
-- ──────────────────────   ──────────────────────────────────────────────────
-- org_manager          →   fm_manager    (FM full operational access)
-- org_viewer           →   fm_viewer     (FM read-only)
-- contributor          →   fm_contributor (FM: submit WOs, run inspections)
-- worker               →   fm_worker     (FM: assigned WOs only)
-- NEW                  →   pw_manager    (PW full operational access)
-- NEW                  →   pw_viewer     (PW read-only)
-- NEW                  →   pw_worker     (PW field worker — inactive for now)
--
-- Cross-department isolation is enforced by the existing department-scoped
-- get_capability() function: current_fm_capability() returns NULL for PW
-- users, and current_pw_capability() returns NULL for FM users.
--
-- All FM RLS policies are dropped and recreated with the new names so the
-- stored expressions are self-consistent with the renamed enum values.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Rename existing enum values ────────────────────────────────────────

ALTER TYPE capability_level RENAME VALUE 'org_manager'  TO 'fm_manager';
ALTER TYPE capability_level RENAME VALUE 'org_viewer'   TO 'fm_viewer';
ALTER TYPE capability_level RENAME VALUE 'contributor'  TO 'fm_contributor';
ALTER TYPE capability_level RENAME VALUE 'worker'       TO 'fm_worker';


-- ── 2. Add new PW capability values ───────────────────────────────────────

ALTER TYPE capability_level ADD VALUE IF NOT EXISTS 'pw_manager';
ALTER TYPE capability_level ADD VALUE IF NOT EXISTS 'pw_viewer';
ALTER TYPE capability_level ADD VALUE IF NOT EXISTS 'pw_worker';


-- ── 3. Fix org_role_definitions for the PW department ─────────────────────
-- After the rename, PW roles inherited FM-prefixed capabilities.
-- Correct them to their proper PW equivalents.

DO $$
DECLARE
  v_org_id     UUID;
  v_pw_dept_id UUID;
BEGIN
  SELECT id INTO v_org_id FROM organizations ORDER BY created_at LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE NOTICE '036: no org found — skipping org_role_definitions update';
    RETURN;
  END IF;

  SELECT id INTO v_pw_dept_id
  FROM org_departments
  WHERE org_id = v_org_id AND slug = 'pw';

  IF v_pw_dept_id IS NULL THEN
    RAISE NOTICE '036: no PW department found — skipping';
    RETURN;
  END IF;

  -- PW Supervisor (was org_manager → fm_manager) → pw_manager
  UPDATE org_role_definitions
  SET
    capability_level = 'pw_manager',
    name             = 'PW Manager',
    description      = 'Full Public Works operational access — work orders, map, contracts, incidents'
  WHERE org_id = v_org_id AND department_id = v_pw_dept_id AND slug = 'supervisor';

  -- PW Inspector (was contributor → fm_contributor) → pw_worker (inactive)
  UPDATE org_role_definitions
  SET
    capability_level = 'pw_worker',
    active           = FALSE
  WHERE org_id = v_org_id AND department_id = v_pw_dept_id AND slug = 'inspector';

  -- PW Vendor (was worker → fm_worker) → pw_worker (inactive)
  UPDATE org_role_definitions
  SET
    capability_level = 'pw_worker',
    active           = FALSE
  WHERE org_id = v_org_id AND department_id = v_pw_dept_id AND slug = 'vendor';

  -- PW Viewer (was org_viewer → fm_viewer) → pw_viewer
  UPDATE org_role_definitions
  SET
    capability_level = 'pw_viewer',
    description      = 'Read-only access to Public Works data'
  WHERE org_id = v_org_id AND department_id = v_pw_dept_id AND slug = 'viewer';

  RAISE NOTICE '036: PW org_role_definitions updated';
END;
$$;


-- ── 4. Add pw_manager role definition if it doesn't exist ─────────────────
-- Ensures the PW department has a pw_manager role in org_role_definitions
-- even for orgs created before this migration.

DO $$
DECLARE
  v_org_id     UUID;
  v_pw_dept_id UUID;
BEGIN
  SELECT id INTO v_org_id FROM organizations ORDER BY created_at LIMIT 1;
  IF v_org_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_pw_dept_id
  FROM org_departments
  WHERE org_id = v_org_id AND slug = 'pw';

  IF v_pw_dept_id IS NULL THEN RETURN; END IF;

  -- pw_manager (PW Director / Manager role)
  INSERT INTO org_role_definitions
    (org_id, department_id, name, slug, capability_level, description, color, active)
  VALUES
    (v_org_id, v_pw_dept_id,
     'PW Director', 'pw_director', 'pw_manager',
     'Full Public Works operational access — work orders, map, contracts, incidents',
     '#3b82f6', TRUE)
  ON CONFLICT (org_id, department_id, slug) DO NOTHING;

  -- pw_viewer (read-only PW)
  INSERT INTO org_role_definitions
    (org_id, department_id, name, slug, capability_level, description, color, active)
  VALUES
    (v_org_id, v_pw_dept_id,
     'PW Viewer', 'pw_viewer', 'pw_viewer',
     'Read-only access to all Public Works data',
     '#94a3b8', TRUE)
  ON CONFLICT (org_id, department_id, slug) DO NOTHING;

  -- pw_worker (inactive for now)
  INSERT INTO org_role_definitions
    (org_id, department_id, name, slug, capability_level, description, color, active)
  VALUES
    (v_org_id, v_pw_dept_id,
     'PW Field Worker', 'pw_worker', 'pw_worker',
     'View and update assigned Public Works work orders',
     '#f59e0b', FALSE)
  ON CONFLICT (org_id, department_id, slug) DO NOTHING;

  RAISE NOTICE '036: PW role definitions seeded';
END;
$$;


-- ── 5. Recreate FM RLS policies with the new capability names ─────────────
-- Dropping and recreating ensures the stored policy expressions reference
-- the renamed enum values by their new labels.

-- ─── fm_properties ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fm_properties_manage" ON fm_properties;
DROP POLICY IF EXISTS "fm_properties_read"   ON fm_properties;

CREATE POLICY "fm_properties_manage" ON fm_properties
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_properties_read" ON fm_properties
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );

-- ─── fm_floors ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fm_floors_manage" ON fm_floors;
DROP POLICY IF EXISTS "fm_floors_read"   ON fm_floors;

CREATE POLICY "fm_floors_manage" ON fm_floors
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_floors_read" ON fm_floors
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );

-- ─── fm_floor_plans ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fm_floor_plans_manage" ON fm_floor_plans;
DROP POLICY IF EXISTS "fm_floor_plans_read"   ON fm_floor_plans;

CREATE POLICY "fm_floor_plans_manage" ON fm_floor_plans
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_floor_plans_read" ON fm_floor_plans
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );

-- ─── fm_assets ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fm_assets_manage" ON fm_assets;
DROP POLICY IF EXISTS "fm_assets_read"   ON fm_assets;

CREATE POLICY "fm_assets_manage" ON fm_assets
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_assets_read" ON fm_assets
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );

-- ─── fm_inspection_templates ──────────────────────────────────────────────

DROP POLICY IF EXISTS "fm_templates_manage" ON fm_inspection_templates;
DROP POLICY IF EXISTS "fm_templates_read"   ON fm_inspection_templates;

CREATE POLICY "fm_templates_manage" ON fm_inspection_templates
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_templates_read" ON fm_inspection_templates
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager', 'fm_viewer')
  );

-- ─── fm_inspections ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fm_inspections_manage"      ON fm_inspections;
DROP POLICY IF EXISTS "fm_inspections_read"        ON fm_inspections;
DROP POLICY IF EXISTS "fm_inspections_contributor" ON fm_inspections;
DROP POLICY IF EXISTS "fm_inspections_worker"      ON fm_inspections;

CREATE POLICY "fm_inspections_manage" ON fm_inspections
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_inspections_read" ON fm_inspections
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'fm_viewer'
  );

CREATE POLICY "fm_inspections_contributor" ON fm_inspections
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'fm_contributor'
  );

CREATE POLICY "fm_inspections_worker" ON fm_inspections
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'fm_worker'
  );

-- ─── fm_checklist_item_responses ──────────────────────────────────────────

DROP POLICY IF EXISTS "fm_checklist_manage"      ON fm_checklist_item_responses;
DROP POLICY IF EXISTS "fm_checklist_read"        ON fm_checklist_item_responses;
DROP POLICY IF EXISTS "fm_checklist_contributor" ON fm_checklist_item_responses;

CREATE POLICY "fm_checklist_manage" ON fm_checklist_item_responses
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_checklist_read" ON fm_checklist_item_responses
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'fm_viewer'
  );

CREATE POLICY "fm_checklist_contributor" ON fm_checklist_item_responses
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'fm_contributor'
  );

-- ─── fm_hotspots ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fm_hotspots_manage" ON fm_hotspots;
DROP POLICY IF EXISTS "fm_hotspots_read"   ON fm_hotspots;

CREATE POLICY "fm_hotspots_manage" ON fm_hotspots
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_hotspots_read" ON fm_hotspots
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );

-- ─── fm_work_orders ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fm_wo_manage"              ON fm_work_orders;
DROP POLICY IF EXISTS "fm_wo_viewer_read"         ON fm_work_orders;
DROP POLICY IF EXISTS "fm_wo_contributor_insert"  ON fm_work_orders;
DROP POLICY IF EXISTS "fm_wo_contributor_read"    ON fm_work_orders;
DROP POLICY IF EXISTS "fm_wo_worker_read"         ON fm_work_orders;
DROP POLICY IF EXISTS "fm_wo_worker_update"       ON fm_work_orders;

-- Managers: unrestricted within org
CREATE POLICY "fm_wo_manage" ON fm_work_orders
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

-- Viewers: read everything, write nothing
CREATE POLICY "fm_wo_viewer_read" ON fm_work_orders
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'fm_viewer'
  );

-- Contributors: submit new WOs and track their own submissions
CREATE POLICY "fm_wo_contributor_insert" ON fm_work_orders
  FOR INSERT WITH CHECK (
    org_id             = current_org_id()
    AND current_fm_capability() = 'fm_contributor'
    AND submitted_by_id = auth.uid()
  );

CREATE POLICY "fm_wo_contributor_read" ON fm_work_orders
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'fm_contributor'
    AND submitted_by_id = auth.uid()
  );

-- Workers: see only WOs assigned to them; can update status/notes
CREATE POLICY "fm_wo_worker_read" ON fm_work_orders
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'fm_worker'
    AND assigned_to_id = auth.uid()
  );

CREATE POLICY "fm_wo_worker_update" ON fm_work_orders
  FOR UPDATE
  USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'fm_worker'
    AND assigned_to_id = auth.uid()
  )
  WITH CHECK (
    org_id          = current_org_id()
    AND assigned_to_id = auth.uid()
  );

-- ─── fm_schedules ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fm_schedules_manage" ON fm_schedules;
DROP POLICY IF EXISTS "fm_schedules_read"   ON fm_schedules;

CREATE POLICY "fm_schedules_manage" ON fm_schedules
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_schedules_read" ON fm_schedules
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager', 'fm_viewer')
  );

-- ─── fm_reports ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fm_reports_manage" ON fm_reports;
DROP POLICY IF EXISTS "fm_reports_read"   ON fm_reports;

CREATE POLICY "fm_reports_manage" ON fm_reports
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_reports_read" ON fm_reports
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager', 'fm_viewer')
  );

-- ─── fm_attachments ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fm_attachments_manage" ON fm_attachments;
DROP POLICY IF EXISTS "fm_attachments_read"   ON fm_attachments;

CREATE POLICY "fm_attachments_manage" ON fm_attachments
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_attachments_read" ON fm_attachments
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );


-- ── 6. Update the comment in get_my_profile RPC (documentation only) ──────
-- The function itself doesn't filter by capability — it just returns whatever
-- is stored — so no functional change is needed. A COMMENT on the function
-- keeps the docs current.

COMMENT ON FUNCTION current_fm_capability() IS
  'Returns the authenticated user''s capability level in the FM department.
   Possible values: org_admin, fm_manager, fm_viewer, fm_contributor, fm_worker.
   Returns NULL if the user has no FM department access.';

COMMENT ON FUNCTION current_pw_capability() IS
  'Returns the authenticated user''s capability level in the PW department.
   Possible values: org_admin, pw_manager, pw_viewer, pw_worker.
   Returns NULL if the user has no PW department access.';
