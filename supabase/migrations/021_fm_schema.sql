-- =============================================================
-- Migration 021: Facilities Management (FM) Schema
--
-- Translates the Prisma schema from Sentinel FM (v2) into
-- Supabase-native SQL following project conventions:
--   · org_id scoping on every table (multi-tenant isolation)
--   · UUID PKs via gen_random_uuid()
--   · deleted_at soft deletes
--   · updated_at trigger on mutable tables
--   · RLS enabled immediately with 5-role policies
--   · Indexes on org_id, status, and lookup columns
--
-- Naming:
--   Tables that conflict with existing PW tables are prefixed fm_
--   (fm_inspections, fm_work_orders, fm_schedules, fm_reports)
--   Tables with no PW conflict use clean names
--   (fm_properties, fm_floors, fm_floor_plans, fm_hotspots,
--    fm_assets, fm_inspection_templates, fm_checklist_item_responses,
--    fm_attachments)
--
-- Role mapping (FM → existing app_role enum):
--   ADMIN        → admin
--   MANAGER      → supervisor
--   INSPECTOR    → inspector
--   CLIENT_VIEWER → viewer
-- =============================================================

-- ── 0. SHARED TRIGGER FUNCTION ───────────────────────────────
-- Creates trigger_set_timestamp() if it doesn't already exist.
-- Earlier migrations may define set_updated_at or update_updated_at_column
-- under different names — this ensures the name used below is always present.
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ── 1. FM PROPERTIES ────────────────────────────────────────
-- Physical sites (buildings, facilities, campuses).
-- Replaces Prisma Property model.
CREATE TABLE fm_properties (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id         UUID        NOT NULL REFERENCES organizations(id),
  name           TEXT        NOT NULL,
  code           TEXT        NOT NULL,
  address        TEXT,
  region         TEXT,
  city           TEXT,
  risk_level     TEXT,
  status         TEXT        NOT NULL DEFAULT 'ACTIVE'
                             CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  main_image_key TEXT,
  -- Lat/lng stored as floats for direct API compatibility.
  -- Use ST_MakePoint(longitude, latitude) for any spatial queries.
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  -- Code is unique per org (not globally)
  UNIQUE (org_id, code)
);

ALTER TABLE fm_properties ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_fm_properties_updated_at
  BEFORE UPDATE ON fm_properties
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Indexes
CREATE INDEX idx_fm_properties_org_id   ON fm_properties(org_id);
CREATE INDEX idx_fm_properties_status   ON fm_properties(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_fm_properties_location ON fm_properties(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- RLS Policies
CREATE POLICY "fm_properties_admin_all" ON fm_properties
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin'
  );

CREATE POLICY "fm_properties_supervisor_all" ON fm_properties
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'supervisor'
  );

CREATE POLICY "fm_properties_inspector_read" ON fm_properties
  FOR SELECT
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector'
  );

CREATE POLICY "fm_properties_viewer_read" ON fm_properties
  FOR SELECT
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'viewer'
  );


-- ── 2. FM FLOORS ─────────────────────────────────────────────
-- Building floors within a property.
CREATE TABLE fm_floors (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID        NOT NULL REFERENCES organizations(id),
  property_id UUID        NOT NULL REFERENCES fm_properties(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  level       INTEGER,
  is_default  BOOLEAN     DEFAULT FALSE,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fm_floors ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_fm_floors_org_id      ON fm_floors(org_id);
CREATE INDEX idx_fm_floors_property_id ON fm_floors(property_id);

-- Inherit property-level access — same role pattern
CREATE POLICY "fm_floors_admin_all"       ON fm_floors
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

CREATE POLICY "fm_floors_supervisor_all"  ON fm_floors
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'supervisor');

CREATE POLICY "fm_floors_inspector_read"  ON fm_floors FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector');

CREATE POLICY "fm_floors_viewer_read"     ON fm_floors FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'viewer');


-- ── 3. FM FLOOR PLANS ────────────────────────────────────────
-- Blueprint/floor plan images linked to a floor.
-- file_key → Supabase Storage path in 'fm-floor-plans' bucket.
CREATE TABLE fm_floor_plans (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id     UUID        NOT NULL REFERENCES organizations(id),
  floor_id   UUID        NOT NULL REFERENCES fm_floors(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  file_key   TEXT        NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fm_floor_plans ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_fm_floor_plans_org_id   ON fm_floor_plans(org_id);
CREATE INDEX idx_fm_floor_plans_floor_id ON fm_floor_plans(floor_id);

CREATE POLICY "fm_floor_plans_admin_all"      ON fm_floor_plans
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

CREATE POLICY "fm_floor_plans_supervisor_all" ON fm_floor_plans
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'supervisor');

CREATE POLICY "fm_floor_plans_inspector_read" ON fm_floor_plans FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector');

CREATE POLICY "fm_floor_plans_viewer_read"    ON fm_floor_plans FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'viewer');


-- ── 4. FM ASSETS ─────────────────────────────────────────────
-- Inspectable items within a property (HVAC, electrical, etc.).
-- qr_token enables QR scan → asset lookup flow.
CREATE TABLE fm_assets (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID        NOT NULL REFERENCES organizations(id),
  property_id     UUID        NOT NULL REFERENCES fm_properties(id) ON DELETE CASCADE,
  code            TEXT        NOT NULL,
  -- qr_token is globally unique (UUIDs won't collide across orgs)
  qr_token        TEXT        UNIQUE,
  name            TEXT        NOT NULL,
  category        TEXT        NOT NULL,
  location        TEXT,
  condition       TEXT        CHECK (condition IN ('GOOD','FAIR','POOR') OR condition IS NULL),
  last_inspection TIMESTAMPTZ,
  next_inspection TIMESTAMPTZ,
  risk            TEXT,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, code)
);

ALTER TABLE fm_assets ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_fm_assets_updated_at
  BEFORE UPDATE ON fm_assets
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX idx_fm_assets_org_id      ON fm_assets(org_id);
CREATE INDEX idx_fm_assets_property_id ON fm_assets(property_id);
CREATE INDEX idx_fm_assets_qr_token    ON fm_assets(qr_token) WHERE qr_token IS NOT NULL;
CREATE INDEX idx_fm_assets_condition   ON fm_assets(condition) WHERE deleted_at IS NULL;

CREATE POLICY "fm_assets_admin_all"      ON fm_assets
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

CREATE POLICY "fm_assets_supervisor_all" ON fm_assets
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'supervisor');

CREATE POLICY "fm_assets_inspector_read" ON fm_assets FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector');

CREATE POLICY "fm_assets_viewer_read"    ON fm_assets FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'viewer');


-- ── 5. FM INSPECTION TEMPLATES ───────────────────────────────
-- Reusable inspection form definitions.
-- json_schema stores the field list:
--   {"fields": [{"id":"fire_ext","label":"Fire Extinguisher","type":"pass_fail"}]}
CREATE TABLE fm_inspection_templates (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID        NOT NULL REFERENCES organizations(id),
  name        TEXT        NOT NULL,
  description TEXT,
  json_schema JSONB       NOT NULL DEFAULT '{"fields": []}',
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fm_inspection_templates ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_fm_inspection_templates_updated_at
  BEFORE UPDATE ON fm_inspection_templates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX idx_fm_inspection_templates_org_id ON fm_inspection_templates(org_id);

CREATE POLICY "fm_templates_admin_all"      ON fm_inspection_templates
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

CREATE POLICY "fm_templates_supervisor_all" ON fm_inspection_templates
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'supervisor');

CREATE POLICY "fm_templates_inspector_read" ON fm_inspection_templates FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector');

CREATE POLICY "fm_templates_viewer_read"    ON fm_inspection_templates FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'viewer');


-- ── 6. FM INSPECTIONS ────────────────────────────────────────
-- Core operational entity. Prefixed fm_ to avoid conflict with
-- the existing PW `inspections` table (field compliance checklists).
-- Status flow: DRAFT → IN_PROGRESS → PENDING_APPROVAL → COMPLETED
CREATE TABLE fm_inspections (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID        NOT NULL REFERENCES organizations(id),
  property_id     UUID        NOT NULL REFERENCES fm_properties(id) ON DELETE CASCADE,
  asset_id        UUID        REFERENCES fm_assets(id),
  template_id     UUID        NOT NULL REFERENCES fm_inspection_templates(id),
  inspector_id    UUID        REFERENCES profiles(id),
  approved_by_id  UUID        REFERENCES profiles(id),
  status          TEXT        NOT NULL DEFAULT 'DRAFT'
                              CHECK (status IN (
                                'DRAFT','SCHEDULED','IN_PROGRESS',
                                'PENDING_APPROVAL','COMPLETED','CANCELLED'
                              )),
  scheduled_for   TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  -- 0–100 compliance score, calculated on completion
  score           DOUBLE PRECISION CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fm_inspections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_fm_inspections_updated_at
  BEFORE UPDATE ON fm_inspections
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX idx_fm_inspections_org_id      ON fm_inspections(org_id);
CREATE INDEX idx_fm_inspections_property_id ON fm_inspections(property_id);
CREATE INDEX idx_fm_inspections_status      ON fm_inspections(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_fm_inspections_inspector   ON fm_inspections(inspector_id);
CREATE INDEX idx_fm_inspections_scheduled   ON fm_inspections(scheduled_for) WHERE deleted_at IS NULL;

-- Admin: full access
CREATE POLICY "fm_inspections_admin_all" ON fm_inspections
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

-- Supervisor: full access (can approve, view all)
CREATE POLICY "fm_inspections_supervisor_all" ON fm_inspections
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'supervisor');

-- Inspector: read all in org, write only own inspections
CREATE POLICY "fm_inspections_inspector_read" ON fm_inspections FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector');

CREATE POLICY "fm_inspections_inspector_write_own" ON fm_inspections
  FOR UPDATE
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND inspector_id = auth.uid()
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector'
  );

CREATE POLICY "fm_inspections_inspector_insert" ON fm_inspections
  FOR INSERT
  WITH CHECK (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector'
  );

-- Viewer: read only
CREATE POLICY "fm_inspections_viewer_read" ON fm_inspections FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'viewer');


-- ── 7. FM CHECKLIST ITEM RESPONSES ───────────────────────────
-- One row per checklist field per inspection.
-- evidence: [{fileKey: "path/in/storage"}]
-- location_data: {x: float, y: float, floorIndex: int}
CREATE TABLE fm_checklist_item_responses (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        UUID        NOT NULL REFERENCES organizations(id),
  inspection_id UUID        NOT NULL REFERENCES fm_inspections(id) ON DELETE CASCADE,
  key           TEXT        NOT NULL,
  label         TEXT        NOT NULL,
  result        TEXT        CHECK (result IN ('pass','fail','yes','no') OR result IS NULL),
  severity      TEXT        CHECK (severity IN ('HIGH','MEDIUM','LOW') OR severity IS NULL),
  notes         TEXT,
  evidence      JSONB       DEFAULT '[]',
  location_data JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fm_checklist_item_responses ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_fm_checklist_org_id      ON fm_checklist_item_responses(org_id);
CREATE INDEX idx_fm_checklist_inspection  ON fm_checklist_item_responses(inspection_id);
CREATE INDEX idx_fm_checklist_result      ON fm_checklist_item_responses(result);
CREATE INDEX idx_fm_checklist_severity    ON fm_checklist_item_responses(severity);

-- Access follows inspection membership
CREATE POLICY "fm_checklist_admin_all"      ON fm_checklist_item_responses
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

CREATE POLICY "fm_checklist_supervisor_all" ON fm_checklist_item_responses
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'supervisor');

CREATE POLICY "fm_checklist_inspector_read" ON fm_checklist_item_responses FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) IN ('inspector'));

CREATE POLICY "fm_checklist_inspector_write" ON fm_checklist_item_responses
  FOR ALL
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector'
    -- Can only write to inspections they own
    AND inspection_id IN (
      SELECT id FROM fm_inspections WHERE inspector_id = auth.uid()
    )
  );

CREATE POLICY "fm_checklist_viewer_read"    ON fm_checklist_item_responses FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'viewer');


-- ── 8. FM HOTSPOTS ───────────────────────────────────────────
-- X/Y coordinate pins on floor plan images.
-- Created after fm_inspections and fm_assets so FKs resolve.
CREATE TABLE fm_hotspots (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        UUID        NOT NULL REFERENCES organizations(id),
  floor_plan_id UUID        NOT NULL REFERENCES fm_floor_plans(id) ON DELETE CASCADE,
  x             DOUBLE PRECISION NOT NULL,
  y             DOUBLE PRECISION NOT NULL,
  label         TEXT,
  asset_id      UUID        REFERENCES fm_assets(id),
  inspection_id UUID        REFERENCES fm_inspections(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fm_hotspots ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_fm_hotspots_org_id       ON fm_hotspots(org_id);
CREATE INDEX idx_fm_hotspots_floor_plan   ON fm_hotspots(floor_plan_id);
CREATE INDEX idx_fm_hotspots_asset        ON fm_hotspots(asset_id);
CREATE INDEX idx_fm_hotspots_inspection   ON fm_hotspots(inspection_id);

CREATE POLICY "fm_hotspots_admin_all"      ON fm_hotspots
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

CREATE POLICY "fm_hotspots_supervisor_all" ON fm_hotspots
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'supervisor');

CREATE POLICY "fm_hotspots_inspector_all"  ON fm_hotspots
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector');

CREATE POLICY "fm_hotspots_viewer_read"    ON fm_hotspots FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'viewer');


-- ── 9. FM WORK ORDERS ────────────────────────────────────────
-- Maintenance lifecycle tracking. Prefixed fm_ to avoid conflict
-- with PW work_orders (different schema, different domain).
-- Auto-created when a checklist item result = 'fail' OR severity = 'HIGH'.
CREATE TABLE fm_work_orders (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              UUID        NOT NULL REFERENCES organizations(id),
  property_id         UUID        REFERENCES fm_properties(id) ON DELETE CASCADE,
  asset_id            UUID        REFERENCES fm_assets(id),
  inspection_id       UUID        REFERENCES fm_inspections(id),
  checklist_item_id   UUID        REFERENCES fm_checklist_item_responses(id),
  assigned_to_id      UUID        REFERENCES profiles(id),
  engaged_by_id       UUID        REFERENCES profiles(id),
  resolved_by_id      UUID        REFERENCES profiles(id),
  title               TEXT        NOT NULL,
  description         TEXT,
  status              TEXT        NOT NULL DEFAULT 'OPEN'
                                  CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED')),
  priority            TEXT        CHECK (priority IN ('LOW','MEDIUM','HIGH') OR priority IS NULL),
  due_date            TIMESTAMPTZ,
  engaged_at          TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fm_work_orders ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_fm_work_orders_updated_at
  BEFORE UPDATE ON fm_work_orders
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX idx_fm_work_orders_org_id      ON fm_work_orders(org_id);
CREATE INDEX idx_fm_work_orders_property    ON fm_work_orders(property_id);
CREATE INDEX idx_fm_work_orders_status      ON fm_work_orders(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_fm_work_orders_assigned    ON fm_work_orders(assigned_to_id);
CREATE INDEX idx_fm_work_orders_due_date    ON fm_work_orders(due_date) WHERE deleted_at IS NULL;
-- Composite index for overdue query: status != COMPLETED AND due_date < NOW()
CREATE INDEX idx_fm_work_orders_overdue     ON fm_work_orders(due_date, status)
  WHERE status != 'COMPLETED' AND deleted_at IS NULL;

CREATE POLICY "fm_work_orders_admin_all"      ON fm_work_orders
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

CREATE POLICY "fm_work_orders_supervisor_all" ON fm_work_orders
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'supervisor');

-- Inspectors: read all in org, write/update own assignments
CREATE POLICY "fm_work_orders_inspector_read" ON fm_work_orders FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector');

CREATE POLICY "fm_work_orders_inspector_update_own" ON fm_work_orders FOR UPDATE
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND assigned_to_id = auth.uid()
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector'
  );

CREATE POLICY "fm_work_orders_viewer_read"    ON fm_work_orders FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'viewer');


-- ── 10. FM SCHEDULES ─────────────────────────────────────────
-- Recurring inspection cadences per property/template pair.
-- cron: optional cron expression (1 AM daily processor checks this).
-- frequency: DAILY | WEEKLY | MONTHLY | QUARTERLY
CREATE TABLE fm_schedules (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID        NOT NULL REFERENCES organizations(id),
  property_id UUID        NOT NULL REFERENCES fm_properties(id) ON DELETE CASCADE,
  template_id UUID        REFERENCES fm_inspection_templates(id),
  cron        TEXT,
  frequency   TEXT        CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY','QUARTERLY') OR frequency IS NULL),
  type        TEXT        NOT NULL DEFAULT 'RECURRING',
  active      BOOLEAN     DEFAULT TRUE,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fm_schedules ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_fm_schedules_updated_at
  BEFORE UPDATE ON fm_schedules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX idx_fm_schedules_org_id    ON fm_schedules(org_id);
CREATE INDEX idx_fm_schedules_active    ON fm_schedules(active) WHERE deleted_at IS NULL;
CREATE INDEX idx_fm_schedules_property  ON fm_schedules(property_id);

CREATE POLICY "fm_schedules_admin_all"      ON fm_schedules
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

CREATE POLICY "fm_schedules_supervisor_all" ON fm_schedules
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'supervisor');

CREATE POLICY "fm_schedules_inspector_read" ON fm_schedules FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector');

CREATE POLICY "fm_schedules_viewer_read"    ON fm_schedules FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'viewer');


-- ── 11. FM REPORTS ───────────────────────────────────────────
-- Generated PDF reports. file_key → Supabase Storage 'fm-reports' bucket.
-- type: INSPECTION_SUMMARY | PORTFOLIO_COMPLIANCE
CREATE TABLE fm_reports (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        UUID        NOT NULL REFERENCES organizations(id),
  property_id   UUID        REFERENCES fm_properties(id) ON DELETE CASCADE,
  -- One-to-one with fm_inspections (regenerating replaces the row)
  inspection_id UUID        UNIQUE REFERENCES fm_inspections(id),
  type          TEXT        NOT NULL
                            CHECK (type IN ('INSPECTION_SUMMARY','PORTFOLIO_COMPLIANCE')),
  file_key      TEXT        NOT NULL,
  name          TEXT        NOT NULL DEFAULT 'Report',
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fm_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_fm_reports_org_id      ON fm_reports(org_id);
CREATE INDEX idx_fm_reports_property    ON fm_reports(property_id);
CREATE INDEX idx_fm_reports_inspection  ON fm_reports(inspection_id);

CREATE POLICY "fm_reports_admin_all"      ON fm_reports
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

CREATE POLICY "fm_reports_supervisor_all" ON fm_reports
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'supervisor');

CREATE POLICY "fm_reports_inspector_read" ON fm_reports FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector');

CREATE POLICY "fm_reports_viewer_read"    ON fm_reports FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'viewer');


-- ── 12. FM ATTACHMENTS ───────────────────────────────────────
-- File attachments for FM entities. Separate from PW attachments
-- table to keep domain data isolated.
-- file_key → Supabase Storage 'fm-uploads' bucket.
CREATE TABLE fm_attachments (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        UUID        NOT NULL REFERENCES organizations(id),
  file_key      TEXT        NOT NULL,
  name          TEXT        NOT NULL DEFAULT 'Untitled File',
  type          TEXT        NOT NULL,
  sort_order    INTEGER     DEFAULT 0,
  -- Nullable FKs — attach to property, asset, OR inspection
  property_id   UUID        REFERENCES fm_properties(id) ON DELETE CASCADE,
  asset_id      UUID        REFERENCES fm_assets(id)    ON DELETE CASCADE,
  inspection_id UUID        REFERENCES fm_inspections(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fm_attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_fm_attachments_org_id      ON fm_attachments(org_id);
CREATE INDEX idx_fm_attachments_property    ON fm_attachments(property_id);
CREATE INDEX idx_fm_attachments_asset       ON fm_attachments(asset_id);
CREATE INDEX idx_fm_attachments_inspection  ON fm_attachments(inspection_id);

CREATE POLICY "fm_attachments_admin_all"      ON fm_attachments
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

CREATE POLICY "fm_attachments_supervisor_all" ON fm_attachments
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'supervisor');

CREATE POLICY "fm_attachments_inspector_all"  ON fm_attachments
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'inspector');

CREATE POLICY "fm_attachments_viewer_read"    ON fm_attachments FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'viewer');


-- ── 13. AUTO WORK ORDER TRIGGER ──────────────────────────────
-- Mirrors FM's workOrderService.existsForTask() logic:
-- When a checklist item is saved with result='fail' OR severity='HIGH',
-- automatically create an fm_work_order if one doesn't exist yet.
CREATE OR REPLACE FUNCTION fm_auto_create_work_order()
RETURNS TRIGGER AS $$
DECLARE
  v_inspection  fm_inspections%ROWTYPE;
  v_exists      BOOLEAN;
BEGIN
  -- Only trigger on fail/HIGH results
  IF NEW.result != 'fail' AND NEW.severity != 'HIGH' THEN
    RETURN NEW;
  END IF;

  -- Check if an active work order already exists for this checklist item
  SELECT EXISTS (
    SELECT 1 FROM fm_work_orders
    WHERE checklist_item_id = NEW.id
      AND status != 'COMPLETED'
      AND deleted_at IS NULL
  ) INTO v_exists;

  IF v_exists THEN
    RETURN NEW;
  END IF;

  -- Fetch parent inspection for context
  SELECT * INTO v_inspection FROM fm_inspections WHERE id = NEW.inspection_id;

  -- Create the work order
  INSERT INTO fm_work_orders (
    org_id,
    property_id,
    inspection_id,
    checklist_item_id,
    title,
    description,
    status,
    priority
  ) VALUES (
    NEW.org_id,
    v_inspection.property_id,
    NEW.inspection_id,
    NEW.id,
    'Issue: ' || NEW.label,
    COALESCE(NEW.notes, 'Auto-generated from failed inspection item'),
    'OPEN',
    CASE WHEN NEW.severity = 'HIGH' THEN 'HIGH'
         WHEN NEW.result = 'fail'   THEN 'MEDIUM'
         ELSE 'LOW' END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER fm_checklist_auto_work_order
  AFTER INSERT OR UPDATE OF result, severity
  ON fm_checklist_item_responses
  FOR EACH ROW
  EXECUTE FUNCTION fm_auto_create_work_order();


-- ── 14. ASSET CONDITION TRIGGER ──────────────────────────────
-- When an inspection completes, update the asset's condition:
--   score > 80 → GOOD | score > 50 → FAIR | score ≤ 50 → POOR
CREATE OR REPLACE FUNCTION fm_update_asset_condition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND NEW.score IS NOT NULL AND NEW.asset_id IS NOT NULL THEN
    UPDATE fm_assets SET
      condition = CASE
        WHEN NEW.score > 80 THEN 'GOOD'
        WHEN NEW.score > 50 THEN 'FAIR'
        ELSE 'POOR'
      END,
      last_inspection = NEW.completed_at,
      updated_at      = NOW()
    WHERE id = NEW.asset_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER fm_inspection_update_asset
  AFTER UPDATE OF status, score ON fm_inspections
  FOR EACH ROW
  WHEN (NEW.status = 'COMPLETED')
  EXECUTE FUNCTION fm_update_asset_condition();


-- ── 15. ANALYTICS HELPER VIEWS ───────────────────────────────
-- These views power the FM dashboard analytics endpoint,
-- replacing analyticsService.ts. RLS applies through the view.

-- Portfolio score: average completion score per org
CREATE OR REPLACE VIEW fm_portfolio_analytics AS
SELECT
  p.org_id,
  COUNT(DISTINCT p.id)                                          AS total_properties,
  COUNT(DISTINCT a.id)                                          AS total_assets,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'COMPLETED')   AS completed_inspections,
  COUNT(DISTINCT i.id) FILTER (WHERE i.scheduled_for > NOW())  AS upcoming_inspections,
  ROUND(AVG(i.score) FILTER (WHERE i.status = 'COMPLETED'))    AS avg_score,
  COUNT(DISTINCT wo.id) FILTER (WHERE wo.status != 'COMPLETED' AND wo.deleted_at IS NULL) AS active_work_orders,
  COUNT(DISTINCT wo.id) FILTER (
    WHERE wo.status != 'COMPLETED'
    AND wo.due_date < NOW()
    AND wo.deleted_at IS NULL
  )                                                             AS overdue_work_orders,
  ROUND(
    100.0 * COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'COMPLETED' AND i.score >= 70)
    / NULLIF(COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'COMPLETED'), 0)
  )                                                             AS compliance_rate
FROM fm_properties p
LEFT JOIN fm_assets       a  ON a.property_id = p.id AND a.deleted_at IS NULL
LEFT JOIN fm_inspections  i  ON i.property_id = p.id AND i.deleted_at IS NULL
LEFT JOIN fm_work_orders  wo ON wo.property_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.org_id;

-- Property health matrix: last score per property (for dashboard bars)
CREATE OR REPLACE VIEW fm_property_health AS
SELECT
  p.id,
  p.org_id,
  p.name,
  p.code,
  p.status,
  p.latitude,
  p.longitude,
  p.main_image_key,
  COALESCE(
    (SELECT score FROM fm_inspections
     WHERE property_id = p.id AND status = 'COMPLETED' AND deleted_at IS NULL
     ORDER BY completed_at DESC LIMIT 1),
    100
  ) AS recent_score,
  (SELECT COUNT(*) FROM fm_work_orders
   WHERE property_id = p.id AND status != 'COMPLETED' AND deleted_at IS NULL
  ) AS open_work_orders
FROM fm_properties p
WHERE p.deleted_at IS NULL;


-- ── 16. SUPABASE STORAGE BUCKETS (declarative) ───────────────
-- Run once after migration via Supabase Dashboard or CLI:
--
--   supabase storage create fm-uploads   --public=false
--   supabase storage create fm-floor-plans --public=false
--   supabase storage create fm-reports   --public=false
--
-- Or via SQL (Supabase-specific):
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('fm-uploads',     'fm-uploads',     false, 10485760,  -- 10 MB
   ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('fm-floor-plans', 'fm-floor-plans', false, 52428800,  -- 50 MB
   ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('fm-reports',     'fm-reports',     false, 52428800,  -- 50 MB
   ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can only access files in their org's path
CREATE POLICY "fm_uploads_org_access" ON storage.objects
  FOR ALL USING (
    bucket_id = 'fm-uploads'
    AND (storage.foldername(name))[1] = (
      SELECT org_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "fm_floor_plans_org_access" ON storage.objects
  FOR ALL USING (
    bucket_id = 'fm-floor-plans'
    AND (storage.foldername(name))[1] = (
      SELECT org_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "fm_reports_org_access" ON storage.objects
  FOR ALL USING (
    bucket_id = 'fm-reports'
    AND (storage.foldername(name))[1] = (
      SELECT org_id::text FROM profiles WHERE id = auth.uid()
    )
  );
