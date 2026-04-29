-- ================================================================
-- 026_role_architecture.sql
-- Two-layer role system + per-org department definitions
--
-- SAFE FOR PRODUCTION — what this migration changes:
--   ✅  Adds two new tables (org_departments, org_role_definitions)
--   ✅  Adds two nullable columns to user_roles (non-breaking)
--   ✅  Adds submitted_by_id to fm_work_orders (nullable)
--   ✅  Replaces FM RLS policies with capability-based versions
--   ✅  Adds helper functions used by FM policies
--   ✅  Seeds the existing org with PW + FM departments and roles
--   ✅  Updates handle_new_user() to carry department context
--
-- NOT CHANGED (zero risk to Public Works):
--   ✗   app_role enum — untouched
--   ✗   user_roles.role column — untouched
--   ✗   UNIQUE(org_id, user_id) constraint — untouched
--   ✗   Any PW table or its RLS policies — untouched
--   ✗   get_my_role() / fm_normalize_role() — untouched
--
-- Architecture overview
-- ─────────────────────
-- Layer 1 — Capability levels (platform-wide, hardcoded in RLS):
--   platform_admin > org_admin > org_manager > org_viewer
--                                            > contributor
--                                            > worker
--
-- Layer 2 — Role display names (per-org, per-dept, stored in DB):
--   Each org defines its own role names, each mapped to one
--   capability level.  Head Start "Director" and another client's
--   "Superintendent" can both be org_viewer — same DB access,
--   different labels. Role names never appear in RLS policies.
--
-- Department model:
--   One org can have multiple departments (pw, fm, …).
--   A user belongs to ONE department, or is org-wide (admin).
--   Data within the same org CAN be linked across departments.
--   Data NEVER crosses org boundaries — org_id RLS is absolute.
-- ================================================================


-- ── 1. ENUMS ─────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE capability_level AS ENUM (
    'platform_admin',  -- Sentinel staff only; never a client role
    'org_admin',       -- Full access: users, roles, audit trail
    'org_manager',     -- Full operational; no user management
    'org_viewer',      -- Read-only across the entire department
    'contributor',     -- Create + manage own records
    'worker'           -- View + update assigned records only
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE module_type AS ENUM ('pw', 'fm');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 2. org_departments ───────────────────────────────────────
-- One row per functional department per org.
-- slug is the stable code identifier ('pw', 'fm', …).
-- Adding a new department never requires code changes.

CREATE TABLE IF NOT EXISTS org_departments (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  slug         TEXT        NOT NULL,
  module_type  module_type NOT NULL,
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

ALTER TABLE org_departments ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_org_departments_updated_at
  BEFORE UPDATE ON org_departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 3. org_role_definitions ──────────────────────────────────
-- Each org defines its own role names mapped to a capability level.
-- department_id = NULL  → role applies org-wide (e.g. Administrator)
-- department_id = X     → role is scoped to that department only

CREATE TABLE IF NOT EXISTS org_role_definitions (
  id                UUID             DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id            UUID             NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id     UUID             REFERENCES org_departments(id) ON DELETE SET NULL,
  name              TEXT             NOT NULL,  -- "Director", "Zone Manager" — shown in UI
  slug              TEXT             NOT NULL,  -- "director", "zone_manager" — stable in code
  capability_level  capability_level NOT NULL,
  description       TEXT,
  color             TEXT             DEFAULT '#64748b',
  active            BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ      DEFAULT NOW(),
  updated_at        TIMESTAMPTZ      DEFAULT NOW(),
  -- Department-scoped uniqueness (works for non-NULL department_id)
  UNIQUE(org_id, department_id, slug)
);

-- Org-wide roles (department_id IS NULL) need a separate partial index
-- because Postgres treats NULL ≠ NULL for UNIQUE constraints, so the
-- table-level UNIQUE above does not prevent duplicate org-wide slugs.
CREATE UNIQUE INDEX org_roledef_orgwide_uq
  ON org_role_definitions(org_id, slug)
  WHERE department_id IS NULL;

ALTER TABLE org_role_definitions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_org_role_definitions_updated_at
  BEFORE UPDATE ON org_role_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 4. user_roles — add department + role_definition columns ─
-- The existing `role` (app_role enum) column and UNIQUE(org_id, user_id)
-- constraint are NOT removed — PW continues using them unchanged.
-- New columns are nullable throughout the transition period.

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS department_id      UUID REFERENCES org_departments(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role_definition_id UUID REFERENCES org_role_definitions(id) ON DELETE SET NULL;


-- ── 5. fm_work_orders — add submitted_by_id ──────────────────
-- Tracks who submitted the WO (contributor / zone manager / etc.)
-- separately from who is assigned to execute it.

ALTER TABLE fm_work_orders
  ADD COLUMN IF NOT EXISTS submitted_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fm_work_orders_submitted
  ON fm_work_orders(submitted_by_id);

-- Auto-fill submitted_by_id on insert if not explicitly provided
CREATE OR REPLACE FUNCTION fm_wo_set_submitted_by()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.submitted_by_id IS NULL THEN
    NEW.submitted_by_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fm_wo_submitted_by ON fm_work_orders;
CREATE TRIGGER trg_fm_wo_submitted_by
  BEFORE INSERT ON fm_work_orders
  FOR EACH ROW EXECUTE FUNCTION fm_wo_set_submitted_by();


-- ── 6. HELPER FUNCTIONS ──────────────────────────────────────

-- Current authed user's org_id (STABLE = memoized per query)
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1
$$;

-- Capability level for a user in a given org + optional department.
-- Resolution order:
--   1. Department-specific role (department_id matches p_dept_id)
--   2. Org-wide fallback (department_id IS NULL — applies everywhere)
-- Returns NULL if the user has no access to this org/department.
CREATE OR REPLACE FUNCTION get_capability(
  p_user_id UUID,
  p_org_id  UUID,
  p_dept_id UUID DEFAULT NULL
)
RETURNS capability_level
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- 1. Department-specific role
    (
      SELECT ord.capability_level
      FROM   user_roles ur
      JOIN   org_role_definitions ord ON ord.id = ur.role_definition_id
      WHERE  ur.user_id       = p_user_id
        AND  ur.org_id        = p_org_id
        AND  ur.department_id = p_dept_id
      LIMIT 1
    ),
    -- 2. Org-wide fallback (covers admins assigned to NULL dept)
    (
      SELECT ord.capability_level
      FROM   user_roles ur
      JOIN   org_role_definitions ord ON ord.id = ur.role_definition_id
      WHERE  ur.user_id        = p_user_id
        AND  ur.org_id         = p_org_id
        AND  ur.department_id  IS NULL
      LIMIT 1
    )
  )
$$;

-- Convenience: capability of the current authed user in FM dept
CREATE OR REPLACE FUNCTION current_fm_capability()
RETURNS capability_level
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_capability(
    auth.uid(),
    current_org_id(),
    (SELECT id FROM org_departments
     WHERE  org_id = current_org_id() AND slug = 'fm'
     LIMIT 1)
  )
$$;

-- Convenience: capability of the current authed user in PW dept
-- (reserved for the PW migration — not yet used in PW policies)
CREATE OR REPLACE FUNCTION current_pw_capability()
RETURNS capability_level
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_capability(
    auth.uid(),
    current_org_id(),
    (SELECT id FROM org_departments
     WHERE  org_id = current_org_id() AND slug = 'pw'
     LIMIT 1)
  )
$$;

GRANT EXECUTE ON FUNCTION current_org_id()         TO authenticated;
GRANT EXECUTE ON FUNCTION get_capability(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION current_fm_capability()  TO authenticated;
GRANT EXECUTE ON FUNCTION current_pw_capability()  TO authenticated;


-- ── 7. RLS ON NEW TABLES ─────────────────────────────────────

-- org_departments: all org members can read; only org_admin can write
CREATE POLICY "dept_select" ON org_departments
  FOR SELECT USING (org_id = current_org_id());

CREATE POLICY "dept_admin_write" ON org_departments
  FOR ALL USING (
    org_id = current_org_id()
    AND get_capability(auth.uid(), current_org_id()) = 'org_admin'
  );

-- org_role_definitions: all org members can read; only org_admin can write
CREATE POLICY "roledef_select" ON org_role_definitions
  FOR SELECT USING (org_id = current_org_id());

CREATE POLICY "roledef_admin_write" ON org_role_definitions
  FOR ALL USING (
    org_id = current_org_id()
    AND get_capability(auth.uid(), current_org_id()) = 'org_admin'
  );


-- ── 8. FM RLS POLICIES — REPLACE ALL WITH CAPABILITY-BASED ──
--
-- Pattern used throughout:
--   manage  → org_admin OR org_manager  (full read/write)
--   read    → additionally org_viewer, contributor, worker
--
-- fm_work_orders is the most granular — contributors and workers
-- have tightly scoped row-level visibility.
--
-- PW policies are NOT touched.

-- ─── fm_properties ───────────────────────────────────────────
DROP POLICY IF EXISTS "fm_properties_admin_all"      ON fm_properties;
DROP POLICY IF EXISTS "fm_properties_supervisor_all" ON fm_properties;
DROP POLICY IF EXISTS "fm_properties_inspector_read" ON fm_properties;
DROP POLICY IF EXISTS "fm_properties_viewer_read"    ON fm_properties;

CREATE POLICY "fm_properties_manage" ON fm_properties
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager')
  );

CREATE POLICY "fm_properties_read" ON fm_properties
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );

-- ─── fm_floors ───────────────────────────────────────────────
DROP POLICY IF EXISTS "fm_floors_admin_all"      ON fm_floors;
DROP POLICY IF EXISTS "fm_floors_supervisor_all" ON fm_floors;
DROP POLICY IF EXISTS "fm_floors_inspector_read" ON fm_floors;
DROP POLICY IF EXISTS "fm_floors_viewer_read"    ON fm_floors;

CREATE POLICY "fm_floors_manage" ON fm_floors
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager')
  );

CREATE POLICY "fm_floors_read" ON fm_floors
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );

-- ─── fm_floor_plans ──────────────────────────────────────────
DROP POLICY IF EXISTS "fm_floor_plans_admin_all"      ON fm_floor_plans;
DROP POLICY IF EXISTS "fm_floor_plans_supervisor_all" ON fm_floor_plans;
DROP POLICY IF EXISTS "fm_floor_plans_inspector_read" ON fm_floor_plans;
DROP POLICY IF EXISTS "fm_floor_plans_viewer_read"    ON fm_floor_plans;

CREATE POLICY "fm_floor_plans_manage" ON fm_floor_plans
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager')
  );

CREATE POLICY "fm_floor_plans_read" ON fm_floor_plans
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );

-- ─── fm_assets ───────────────────────────────────────────────
DROP POLICY IF EXISTS "fm_assets_admin_all"      ON fm_assets;
DROP POLICY IF EXISTS "fm_assets_supervisor_all" ON fm_assets;
DROP POLICY IF EXISTS "fm_assets_inspector_read" ON fm_assets;
DROP POLICY IF EXISTS "fm_assets_viewer_read"    ON fm_assets;

CREATE POLICY "fm_assets_manage" ON fm_assets
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager')
  );

CREATE POLICY "fm_assets_read" ON fm_assets
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );

-- ─── fm_inspection_templates ─────────────────────────────────
DROP POLICY IF EXISTS "fm_templates_admin_all"      ON fm_inspection_templates;
DROP POLICY IF EXISTS "fm_templates_supervisor_all" ON fm_inspection_templates;
DROP POLICY IF EXISTS "fm_templates_inspector_read" ON fm_inspection_templates;
DROP POLICY IF EXISTS "fm_templates_viewer_read"    ON fm_inspection_templates;

CREATE POLICY "fm_templates_manage" ON fm_inspection_templates
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager')
  );

-- Templates are readable by managers and viewers only
-- (contributors/workers do not need to see templates directly)
CREATE POLICY "fm_templates_read" ON fm_inspection_templates
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager', 'org_viewer')
  );

-- ─── fm_inspections ──────────────────────────────────────────
DROP POLICY IF EXISTS "fm_inspections_admin_all"             ON fm_inspections;
DROP POLICY IF EXISTS "fm_inspections_supervisor_all"        ON fm_inspections;
DROP POLICY IF EXISTS "fm_inspections_inspector_read"        ON fm_inspections;
DROP POLICY IF EXISTS "fm_inspections_inspector_write_own"   ON fm_inspections;
DROP POLICY IF EXISTS "fm_inspections_inspector_insert"      ON fm_inspections;
DROP POLICY IF EXISTS "fm_inspections_viewer_read"           ON fm_inspections;

CREATE POLICY "fm_inspections_manage" ON fm_inspections
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager')
  );

-- Viewers see inspection records and results (read-only)
CREATE POLICY "fm_inspections_read" ON fm_inspections
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'org_viewer'
  );

-- ─── fm_checklist_item_responses ─────────────────────────────
DROP POLICY IF EXISTS "fm_checklist_admin_all"       ON fm_checklist_item_responses;
DROP POLICY IF EXISTS "fm_checklist_supervisor_all"  ON fm_checklist_item_responses;
DROP POLICY IF EXISTS "fm_checklist_inspector_read"  ON fm_checklist_item_responses;
DROP POLICY IF EXISTS "fm_checklist_inspector_write" ON fm_checklist_item_responses;
DROP POLICY IF EXISTS "fm_checklist_viewer_read"     ON fm_checklist_item_responses;

CREATE POLICY "fm_checklist_manage" ON fm_checklist_item_responses
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager')
  );

CREATE POLICY "fm_checklist_read" ON fm_checklist_item_responses
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'org_viewer'
  );

-- ─── fm_hotspots ─────────────────────────────────────────────
DROP POLICY IF EXISTS "fm_hotspots_admin_all"      ON fm_hotspots;
DROP POLICY IF EXISTS "fm_hotspots_supervisor_all" ON fm_hotspots;
DROP POLICY IF EXISTS "fm_hotspots_inspector_all"  ON fm_hotspots;
DROP POLICY IF EXISTS "fm_hotspots_viewer_read"    ON fm_hotspots;

CREATE POLICY "fm_hotspots_manage" ON fm_hotspots
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager')
  );

CREATE POLICY "fm_hotspots_read" ON fm_hotspots
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );

-- ─── fm_work_orders ──────────────────────────────────────────
-- Most granular table: four distinct access levels.
--
-- org_admin / org_manager  → full access (all rows)
-- org_viewer               → read all rows (no write)
-- contributor              → INSERT own + SELECT own submissions
-- worker                   → SELECT assigned + UPDATE assigned
--
-- Note: the contributor INSERT policy enforces submitted_by_id = auth.uid()
-- at the database level so the trigger is a belt-AND-suspenders guarantee.
-- Workers can update any field on their assigned WOs; status-only enforcement
-- is applied at the application layer (the DB cannot restrict per-column).

DROP POLICY IF EXISTS "fm_work_orders_admin_all"             ON fm_work_orders;
DROP POLICY IF EXISTS "fm_work_orders_supervisor_all"        ON fm_work_orders;
DROP POLICY IF EXISTS "fm_work_orders_inspector_read"        ON fm_work_orders;
DROP POLICY IF EXISTS "fm_work_orders_inspector_update_own"  ON fm_work_orders;
DROP POLICY IF EXISTS "fm_work_orders_viewer_read"           ON fm_work_orders;

-- Managers: unrestricted within org
CREATE POLICY "fm_wo_manage" ON fm_work_orders
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager')
  );

-- Viewers: read everything, write nothing
CREATE POLICY "fm_wo_viewer_read" ON fm_work_orders
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'org_viewer'
  );

-- Contributors (Zone Manager, Nutrition Manager):
--   can submit new WOs and track their own submissions
CREATE POLICY "fm_wo_contributor_insert" ON fm_work_orders
  FOR INSERT WITH CHECK (
    org_id          = current_org_id()
    AND current_fm_capability() = 'contributor'
    AND submitted_by_id = auth.uid()
  );

CREATE POLICY "fm_wo_contributor_read" ON fm_work_orders
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'contributor'
    AND submitted_by_id = auth.uid()
  );

-- Workers (Maintenance Worker, External Supplier):
--   see only WOs assigned to them; can update status/notes
CREATE POLICY "fm_wo_worker_read" ON fm_work_orders
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'worker'
    AND assigned_to_id = auth.uid()
  );

CREATE POLICY "fm_wo_worker_update" ON fm_work_orders
  FOR UPDATE
  USING (
    org_id = current_org_id()
    AND current_fm_capability() = 'worker'
    AND assigned_to_id = auth.uid()
  )
  WITH CHECK (
    org_id         = current_org_id()
    AND assigned_to_id = auth.uid()
  );

-- ─── fm_schedules ─────────────────────────────────────────────
DROP POLICY IF EXISTS "fm_schedules_admin_all"      ON fm_schedules;
DROP POLICY IF EXISTS "fm_schedules_supervisor_all" ON fm_schedules;
DROP POLICY IF EXISTS "fm_schedules_inspector_read" ON fm_schedules;
DROP POLICY IF EXISTS "fm_schedules_viewer_read"    ON fm_schedules;

CREATE POLICY "fm_schedules_manage" ON fm_schedules
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager')
  );

CREATE POLICY "fm_schedules_read" ON fm_schedules
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager', 'org_viewer')
  );

-- ─── fm_reports ───────────────────────────────────────────────
DROP POLICY IF EXISTS "fm_reports_admin_all"      ON fm_reports;
DROP POLICY IF EXISTS "fm_reports_supervisor_all" ON fm_reports;
DROP POLICY IF EXISTS "fm_reports_inspector_read" ON fm_reports;
DROP POLICY IF EXISTS "fm_reports_viewer_read"    ON fm_reports;

CREATE POLICY "fm_reports_manage" ON fm_reports
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager')
  );

CREATE POLICY "fm_reports_read" ON fm_reports
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager', 'org_viewer')
  );

-- ─── fm_attachments ───────────────────────────────────────────
DROP POLICY IF EXISTS "fm_attachments_admin_all"       ON fm_attachments;
DROP POLICY IF EXISTS "fm_attachments_supervisor_all"  ON fm_attachments;
DROP POLICY IF EXISTS "fm_attachments_inspector_all"   ON fm_attachments;
DROP POLICY IF EXISTS "fm_attachments_viewer_read"     ON fm_attachments;

CREATE POLICY "fm_attachments_manage" ON fm_attachments
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'org_manager')
  );

CREATE POLICY "fm_attachments_read" ON fm_attachments
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );


-- ── 9. SEED DATA ────────────────────────────────────────────
-- Creates departments and role definitions for the existing org.
-- For every new org created in the future, this seed block should
-- run as part of the org-creation workflow (not another migration).
-- ON CONFLICT DO NOTHING makes this idempotent.

DO $$
DECLARE
  v_org_id     UUID;
  v_pw_dept_id UUID;
  v_fm_dept_id UUID;
BEGIN
  SELECT id INTO v_org_id FROM organizations ORDER BY created_at LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No org found — skipping role architecture seed';
    RETURN;
  END IF;

  -- ── Departments ─────────────────────────────────────────────
  INSERT INTO org_departments (org_id, name, slug, module_type)
  VALUES
    (v_org_id, 'Public Works',          'pw', 'pw'),
    (v_org_id, 'Facilities Management', 'fm', 'fm')
  ON CONFLICT (org_id, slug) DO NOTHING;

  SELECT id INTO v_pw_dept_id FROM org_departments WHERE org_id = v_org_id AND slug = 'pw';
  SELECT id INTO v_fm_dept_id FROM org_departments WHERE org_id = v_org_id AND slug = 'fm';

  -- ── Org-wide role (no department — applies across all depts) ─
  -- Uses WHERE NOT EXISTS instead of ON CONFLICT because the partial
  -- unique index (org_roledef_orgwide_uq) can't be used with ON CONFLICT
  -- in a DO block that also inserts department-scoped rows.
  INSERT INTO org_role_definitions
    (org_id, department_id, name, slug, capability_level, description, color)
  SELECT
    v_org_id, NULL,
    'Administrator', 'admin', 'org_admin',
    'Full system access: users, roles, audit trail, all departments', '#ef4444'
  WHERE NOT EXISTS (
    SELECT 1 FROM org_role_definitions
    WHERE org_id = v_org_id AND department_id IS NULL AND slug = 'admin'
  );

  -- ── PW department roles ──────────────────────────────────────
  -- Slugs mirror the old app_role values so the seed migration
  -- can map existing rows directly.
  INSERT INTO org_role_definitions
    (org_id, department_id, name, slug, capability_level, description, color)
  VALUES
    (v_org_id, v_pw_dept_id,
     'Supervisor', 'supervisor', 'org_manager',
     'Full Public Works operational access', '#3b82f6'),
    (v_org_id, v_pw_dept_id,
     'Inspector', 'inspector', 'contributor',
     'Create and manage own PW records', '#10b981'),
    (v_org_id, v_pw_dept_id,
     'Vendor', 'vendor', 'worker',
     'View and update assigned PW work orders', '#f59e0b'),
    (v_org_id, v_pw_dept_id,
     'Viewer', 'viewer', 'org_viewer',
     'Read-only access to PW data', '#94a3b8')
  ON CONFLICT (org_id, department_id, slug) DO NOTHING;

  -- ── FM department roles — Head Start ─────────────────────────
  INSERT INTO org_role_definitions
    (org_id, department_id, name, slug, capability_level, description, color)
  VALUES
    (v_org_id, v_fm_dept_id,
     'Facilities Manager', 'facilities_manager', 'org_manager',
     'Full FM operational access; no user or role management', '#3b82f6'),
    (v_org_id, v_fm_dept_id,
     'Director', 'director', 'org_viewer',
     'Read-only access to all FM data; notified on budget referrals', '#8b5cf6'),
    (v_org_id, v_fm_dept_id,
     'Zone Manager', 'zone_manager', 'contributor',
     'Submit work orders; track own submissions and status', '#10b981'),
    (v_org_id, v_fm_dept_id,
     'Nutrition Manager', 'nutrition_manager', 'contributor',
     'Submit work orders; track own submissions and status', '#10b981'),
    (v_org_id, v_fm_dept_id,
     'Maintenance Worker', 'maintenance_worker', 'worker',
     'View and update assigned work orders', '#f59e0b'),
    (v_org_id, v_fm_dept_id,
     'External Supplier', 'external_supplier', 'worker',
     'View and mark complete assigned work orders', '#f97316')
  ON CONFLICT (org_id, department_id, slug) DO NOTHING;

  -- ── Migrate existing user_roles rows ────────────────────────
  --
  -- Existing rows: role = admin|supervisor|inspector|vendor|viewer
  -- profiles.department = 'pw' | 'fm' | 'both'
  --
  -- Rule:
  --   admin role       → org-wide Administrator (department_id NULL)
  --   others + dept pw → PW role matching slug
  --   others + dept fm → FM Facilities Manager (closest match for
  --                       existing supervisor; others stay viewer)
  --   others + dept both → PW role (admins handled above)

  -- Step 1: Admin → org-wide
  UPDATE user_roles ur
  SET
    department_id      = NULL,
    role_definition_id = (
      SELECT id FROM org_role_definitions
      WHERE  org_id = v_org_id AND department_id IS NULL AND slug = 'admin'
      LIMIT 1
    )
  FROM profiles p
  WHERE ur.user_id = p.id
    AND ur.org_id  = v_org_id
    AND ur.role    = 'admin'
    AND ur.role_definition_id IS NULL;

  -- Step 2: PW users (department = pw or both, non-admin)
  UPDATE user_roles ur
  SET
    department_id      = v_pw_dept_id,
    role_definition_id = (
      SELECT id FROM org_role_definitions
      WHERE  org_id       = v_org_id
        AND  department_id = v_pw_dept_id
        AND  slug          = ur.role::TEXT   -- slug mirrors app_role name
      LIMIT 1
    )
  FROM profiles p
  WHERE ur.user_id = p.id
    AND ur.org_id  = v_org_id
    AND ur.role   != 'admin'
    AND p.department IN ('pw', 'both')
    AND ur.role_definition_id IS NULL;

  -- Step 3: FM users (department = fm, non-admin)
  -- supervisor → facilities_manager; others default to viewer
  UPDATE user_roles ur
  SET
    department_id      = v_fm_dept_id,
    role_definition_id = (
      SELECT id FROM org_role_definitions
      WHERE  org_id       = v_org_id
        AND  department_id = v_fm_dept_id
        AND  slug = CASE ur.role::TEXT
               WHEN 'supervisor' THEN 'facilities_manager'
               WHEN 'inspector'  THEN 'zone_manager'
               WHEN 'vendor'     THEN 'maintenance_worker'
               ELSE                   'director'   -- safe read-only fallback
             END
      LIMIT 1
    )
  FROM profiles p
  WHERE ur.user_id = p.id
    AND ur.org_id  = v_org_id
    AND ur.role   != 'admin'
    AND p.department = 'fm'
    AND ur.role_definition_id IS NULL;

END $$;


-- ── 10. UPDATE handle_new_user() ─────────────────────────────
-- Extends the trigger to also set department_id + role_definition_id
-- when creating a new user via invite.
--
-- New metadata keys (optional, backward-compatible):
--   department_slug   TEXT  — 'pw' | 'fm' (defaults to 'pw')
--   invited_role      TEXT  — existing role string OR new FM slugs
--                             e.g. 'zone_manager', 'director', etc.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id       UUID;
  _role_text    TEXT;
  _dept_slug    TEXT;
  _role         app_role;
  _dept_id      UUID;
  _roledef_id   UUID;
  _dept_str     TEXT;   -- for profiles.department column
BEGIN
  -- ── Resolve org ────────────────────────────────────────────
  _org_id := (NEW.raw_user_meta_data->>'org_id')::UUID;
  IF _org_id IS NULL THEN
    _org_id := '00000000-0000-0000-0000-000000000001';
  END IF;

  -- ── Upsert profile ─────────────────────────────────────────
  _dept_slug := LOWER(TRIM(COALESCE(
    NEW.raw_user_meta_data->>'department_slug', 'pw'
  )));

  _dept_str := CASE
    WHEN _dept_slug = 'fm' THEN 'fm'
    ELSE 'pw'
  END;

  INSERT INTO public.profiles (id, org_id, full_name, department)
  VALUES (
    NEW.id,
    _org_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    _dept_str
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name  = EXCLUDED.full_name,
        department = EXCLUDED.department,
        updated_at = NOW();

  -- ── Resolve role ───────────────────────────────────────────
  _role_text := NEW.raw_user_meta_data->>'invited_role';
  IF _role_text IS NULL OR TRIM(_role_text) = '' THEN
    RETURN NEW;   -- no role in metadata — done
  END IF;

  -- Map to legacy app_role for backward compat (PW policies)
  _role := fm_normalize_role(_role_text);

  -- ── Find department ────────────────────────────────────────
  SELECT id INTO _dept_id
  FROM org_departments
  WHERE org_id = _org_id AND slug = _dept_slug
  LIMIT 1;
  -- dept_id may be NULL for org_admin (applies everywhere)

  -- ── Find role definition ───────────────────────────────────
  -- Try exact slug match first, then fall back to capability mapping
  SELECT id INTO _roledef_id
  FROM org_role_definitions
  WHERE org_id       = _org_id
    AND (department_id = _dept_id OR department_id IS NULL)
    AND slug = LOWER(TRIM(_role_text))
  ORDER BY (department_id IS NULL) ASC   -- prefer dept-specific over org-wide
  LIMIT 1;

  -- Fallback: match by legacy role slug within the resolved department
  IF _roledef_id IS NULL THEN
    SELECT id INTO _roledef_id
    FROM org_role_definitions
    WHERE org_id       = _org_id
      AND department_id = _dept_id
      AND slug = _role::TEXT
    LIMIT 1;
  END IF;

  -- ── Upsert user_roles ──────────────────────────────────────
  INSERT INTO public.user_roles (org_id, user_id, role, department_id, role_definition_id)
  VALUES (_org_id, NEW.id, _role, _dept_id, _roledef_id)
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET role               = EXCLUDED.role,
        department_id      = EXCLUDED.department_id,
        role_definition_id = EXCLUDED.role_definition_id,
        updated_at         = NOW();

  RETURN NEW;
END;
$$;

-- Re-attach trigger (DROP + CREATE is safe here)
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ── 11. UPDATED get_my_profile() ─────────────────────────────
-- Returns role_slug and capability_level in addition to existing fields.
-- Backward-compatible: `role` column still returned unchanged.

CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS TABLE (
  user_id          UUID,
  org_id           UUID,
  org_name         TEXT,
  org_slug         TEXT,
  full_name        TEXT,
  avatar_url       TEXT,
  role             TEXT,       -- legacy app_role (used by PW)
  department       TEXT,       -- 'pw' | 'fm' | 'both' (from profiles)
  role_slug        TEXT,       -- e.g. 'facilities_manager', 'zone_manager'
  capability       TEXT,       -- e.g. 'org_manager', 'contributor'
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

GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;


-- ── END OF MIGRATION ─────────────────────────────────────────
-- Next steps (separate migrations / PRs):
--
--   027_pw_role_migration.sql
--     — Rewrite PW RLS policies to use current_pw_capability()
--     — Drop app_role enum after all policies migrated
--     — Drop user_roles.role column
--
--   028_wo_category_assignee_type.sql
--     — Add fm_work_orders.category (enum of 18 types)
--     — Add fm_work_orders.assignee_type (HS_STAFF | MUNICIPALITY | …)
--     — Add PENDING_REVIEW to fm_work_orders status enum
--
--   App-side follow-up:
--     — useAppMode: replace localStorage with department from get_my_profile()
--     — Sidebar: only org_admin sees the module switcher
--     — FM invite form: pass department_slug + invited_role in metadata
-- ================================================================
