-- ============================================================
-- Migration 007: Projects & Inspections
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE project_status AS ENUM (
  'planning',
  'active',
  'on_hold',
  'completed',
  'cancelled'
);

CREATE TYPE inspection_status AS ENUM (
  'draft',
  'in_progress',
  'completed',
  'approved'
);

CREATE TYPE inspection_item_result AS ENUM (
  'pass',
  'fail',
  'na',
  'observation'
);

CREATE TYPE inspection_item_severity AS ENUM (
  'critical',
  'major',
  'minor',
  'informational'
);

-- ── Number sequences ──────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS project_number_seq
  START 1 INCREMENT 1 MINVALUE 1 NO MAXVALUE CACHE 1;

CREATE SEQUENCE IF NOT EXISTS inspection_number_seq
  START 1 INCREMENT 1 MINVALUE 1 NO MAXVALUE CACHE 1;

-- ── projects table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number            TEXT          NOT NULL,
  name              TEXT          NOT NULL,
  code              TEXT          NOT NULL,       -- short identifier e.g. RD-2026-01
  description       TEXT,
  status            project_status NOT NULL DEFAULT 'planning',

  -- Location
  address           TEXT,
  latitude          NUMERIC(10, 7),
  longitude         NUMERIC(10, 7),

  -- Cover image (FK to attachments)
  cover_image_id    UUID          REFERENCES attachments(id) ON DELETE SET NULL,

  -- Timeline
  start_date        DATE,
  planned_end_date  DATE,          -- original planned completion
  end_date          DATE,          -- actual completion date (set when completed)

  -- Budget
  budget            NUMERIC(14, 2),
  actual_cost       NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- People
  project_manager   UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by        UUID          NOT NULL REFERENCES auth.users(id),

  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX projects_org_number_idx ON projects (org_id, number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX projects_org_code_idx   ON projects (org_id, code)   WHERE deleted_at IS NULL;
CREATE INDEX projects_latlon_idx ON projects (org_id, latitude, longitude) WHERE deleted_at IS NULL;
CREATE INDEX projects_status_idx ON projects (org_id, status) WHERE deleted_at IS NULL;

-- ── inspections table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inspections (
  id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID              NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number           TEXT              NOT NULL,

  -- What is being inspected
  title            TEXT              NOT NULL,
  project_id       UUID              REFERENCES projects(id) ON DELETE SET NULL,
  work_order_id    UUID              REFERENCES work_orders(id) ON DELETE SET NULL,
  pothole_id       UUID              REFERENCES pothole_reports(id) ON DELETE SET NULL,

  status           inspection_status NOT NULL DEFAULT 'draft',
  inspector_id     UUID              REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Scoring: 0-100 computed from checklist pass/fail items
  score            SMALLINT          CHECK (score BETWEEN 0 AND 100),

  -- Dates
  scheduled_at     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,

  -- Location snapshot (may differ from project location)
  latitude         NUMERIC(10, 7),
  longitude        NUMERIC(10, 7),
  address          TEXT,

  notes            TEXT,
  created_by       UUID              NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX inspections_org_number_idx ON inspections (org_id, number) WHERE deleted_at IS NULL;
CREATE INDEX inspections_project_idx   ON inspections (project_id) WHERE deleted_at IS NULL;
CREATE INDEX inspections_workorder_idx ON inspections (work_order_id) WHERE deleted_at IS NULL;

-- ── inspection_checklist_items table ──────────────────────────

CREATE TABLE IF NOT EXISTS inspection_checklist_items (
  id             UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id  UUID                    NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  org_id         UUID                    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_number    SMALLINT                NOT NULL,   -- ordering
  category       TEXT                    NOT NULL,   -- e.g. "Drainage", "Pavement", "Signage"
  description    TEXT                    NOT NULL,   -- what to check
  result         inspection_item_result,             -- null = not yet evaluated
  severity       inspection_item_severity NOT NULL DEFAULT 'minor',
  notes          TEXT,
  photo_id       UUID                    REFERENCES attachments(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE INDEX checklist_items_inspection_idx ON inspection_checklist_items (inspection_id);

-- ── Auto-number triggers ──────────────────────────────────────

CREATE OR REPLACE FUNCTION set_project_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.number := 'PJ-' || to_char(NOW(), 'YYYY') || '-' ||
                LPAD(nextval('project_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_number
  BEFORE INSERT ON projects
  FOR EACH ROW
  WHEN (NEW.number IS NULL OR NEW.number = '')
  EXECUTE FUNCTION set_project_number();

CREATE OR REPLACE FUNCTION set_inspection_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.number := 'IN-' || to_char(NOW(), 'YYYY') || '-' ||
                LPAD(nextval('inspection_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inspection_number
  BEFORE INSERT ON inspections
  FOR EACH ROW
  WHEN (NEW.number IS NULL OR NEW.number = '')
  EXECUTE FUNCTION set_inspection_number();

-- ── updated_at triggers ───────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_projects_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW
  EXECUTE FUNCTION touch_projects_updated_at();

CREATE OR REPLACE FUNCTION touch_inspections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_inspections_updated_at
  BEFORE UPDATE ON inspections FOR EACH ROW
  EXECUTE FUNCTION touch_inspections_updated_at();

CREATE OR REPLACE FUNCTION touch_checklist_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_checklist_updated_at
  BEFORE UPDATE ON inspection_checklist_items FOR EACH ROW
  EXECUTE FUNCTION touch_checklist_updated_at();

-- ── Score recalculation function ──────────────────────────────
-- Call after saving checklist items to update inspection.score
-- Score = (pass_count / (pass_count + fail_count)) * 100
-- NA and observation items are excluded from scoring

CREATE OR REPLACE FUNCTION recalculate_inspection_score(p_inspection_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  total_scored INT;
  pass_count   INT;
  new_score    SMALLINT;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE result IN ('pass','fail')),
    COUNT(*) FILTER (WHERE result = 'pass')
  INTO total_scored, pass_count
  FROM inspection_checklist_items
  WHERE inspection_id = p_inspection_id;

  IF total_scored > 0 THEN
    new_score := ROUND((pass_count::NUMERIC / total_scored) * 100)::SMALLINT;
  ELSE
    new_score := NULL;
  END IF;

  UPDATE inspections SET score = new_score WHERE id = p_inspection_id;
END;
$$;

-- ── Map view: projects with delay status ──────────────────────
-- Used by the dashboard map to color-code project pins

CREATE OR REPLACE VIEW project_map_pins AS
SELECT
  p.id,
  p.org_id,
  p.number,
  p.name,
  p.code,
  p.status,
  p.address,
  p.latitude,
  p.longitude,
  p.start_date,
  p.planned_end_date,
  p.end_date,
  p.budget,
  p.actual_cost,
  CASE
    WHEN p.status IN ('completed', 'cancelled') THEN 'closed'
    WHEN p.planned_end_date IS NULL              THEN 'unknown'
    WHEN p.planned_end_date < CURRENT_DATE AND p.status NOT IN ('completed','cancelled')
                                                 THEN 'overdue'
    WHEN p.planned_end_date <= CURRENT_DATE + INTERVAL '14 days'
                                                 THEN 'at_risk'
    ELSE                                              'on_track'
  END AS delay_status
FROM projects p
WHERE p.deleted_at IS NULL
  AND p.latitude IS NOT NULL
  AND p.longitude IS NOT NULL;

-- ── Row-Level Security ────────────────────────────────────────

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select" ON projects FOR SELECT USING (
  org_id = (SELECT org_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND org_id = projects.org_id
      AND role IN ('admin', 'supervisor')
  )
);

CREATE POLICY "projects_update" ON projects FOR UPDATE USING (
  project_manager = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND org_id = projects.org_id
      AND role IN ('admin', 'supervisor')
  )
);

ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inspections_select" ON inspections FOR SELECT USING (
  org_id = (SELECT org_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "inspections_insert" ON inspections FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND org_id = inspections.org_id
      AND role IN ('admin', 'supervisor', 'inspector')
  )
);

CREATE POLICY "inspections_update" ON inspections FOR UPDATE USING (
  inspector_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND org_id = inspections.org_id
      AND role IN ('admin', 'supervisor')
  )
);

ALTER TABLE inspection_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_select" ON inspection_checklist_items FOR SELECT USING (
  org_id = (SELECT org_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "checklist_write" ON inspection_checklist_items FOR ALL USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND org_id = inspection_checklist_items.org_id
      AND role IN ('admin', 'supervisor', 'inspector')
  )
);
