-- 1. Add module + fm_property_id to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS module TEXT NOT NULL DEFAULT 'pw'
    CHECK (module IN ('pw', 'fm')),
  ADD COLUMN IF NOT EXISTS fm_property_id UUID
    REFERENCES fm_properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_module_idx ON projects(org_id, module) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS projects_fm_property_idx ON projects(fm_property_id) WHERE deleted_at IS NULL;

-- 2. project_tasks table
CREATE TABLE IF NOT EXISTS project_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'not_started'
                     CHECK (status IN ('not_started','in_progress','completed','blocked')),
  assignee_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  depends_on_id    UUID REFERENCES project_tasks(id) ON DELETE SET NULL,
  work_order_id    UUID,
  work_order_table TEXT CHECK (work_order_table IN ('work_orders','fm_work_orders')),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS project_tasks_project_idx ON project_tasks(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS project_tasks_org_idx     ON project_tasks(org_id)     WHERE deleted_at IS NULL;

ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_tasks_select" ON project_tasks FOR SELECT
  USING (org_id = (SELECT org_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1)
    AND deleted_at IS NULL);

CREATE POLICY "project_tasks_insert" ON project_tasks FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1)
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()
      AND role IN ('admin','supervisor')));

CREATE POLICY "project_tasks_update" ON project_tasks FOR UPDATE
  USING (org_id = (SELECT org_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1)
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()
      AND role IN ('admin','supervisor')));

CREATE OR REPLACE FUNCTION touch_project_tasks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_project_tasks_updated_at
  BEFORE UPDATE ON project_tasks
  FOR EACH ROW EXECUTE FUNCTION touch_project_tasks_updated_at();

-- 3. project_milestones table
CREATE TABLE IF NOT EXISTS project_milestones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  date       DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE project_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_milestones_select" ON project_milestones FOR SELECT
  USING (org_id = (SELECT org_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "project_milestones_write" ON project_milestones FOR ALL
  WITH CHECK (org_id = (SELECT org_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1)
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()
      AND role IN ('admin','supervisor')));

-- 4. Add project_task to event_type enum
DO $$ BEGIN
  ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'project_task';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Trigger: auto-complete task when linked PW work order closes
CREATE OR REPLACE FUNCTION sync_task_from_work_order()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    UPDATE project_tasks
    SET status = 'completed', updated_at = NOW()
    WHERE work_order_id = NEW.id
      AND work_order_table = 'work_orders'
      AND status <> 'completed'
      AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wo_sync_task
  AFTER UPDATE OF status ON work_orders
  FOR EACH ROW EXECUTE FUNCTION sync_task_from_work_order();

-- 6. Trigger: auto-complete task when linked FM work order closes
CREATE OR REPLACE FUNCTION sync_task_from_fm_work_order()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status <> 'COMPLETED' THEN
    UPDATE project_tasks
    SET status = 'completed', updated_at = NOW()
    WHERE work_order_id = NEW.id
      AND work_order_table = 'fm_work_orders'
      AND status <> 'completed'
      AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fm_wo_sync_task
  AFTER UPDATE OF status ON fm_work_orders
  FOR EACH ROW EXECUTE FUNCTION sync_task_from_fm_work_order();
