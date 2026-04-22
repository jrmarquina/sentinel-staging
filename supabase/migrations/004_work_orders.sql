-- ============================================================
-- Migration 004: Work Orders
-- Core module — MUST HAVE for Guaynabo Phase 1
-- ============================================================

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE work_order_status AS ENUM (
  'draft',
  'open',
  'in_progress',
  'on_hold',
  'closed',
  'cancelled'
);

CREATE TYPE work_order_priority AS ENUM ('P1', 'P2', 'P3', 'P4');

CREATE TYPE work_order_severity AS ENUM ('critical', 'high', 'medium', 'low');

-- ─── Auto-number sequence ─────────────────────────────────────────────────────

CREATE SEQUENCE work_order_number_seq START 1;

-- ─── work_orders ──────────────────────────────────────────────────────────────

CREATE TABLE work_orders (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id         UUID        NOT NULL REFERENCES organizations(id),
  number         TEXT        NOT NULL UNIQUE,          -- WO-2026-0001
  title          TEXT        NOT NULL,
  description    TEXT,
  status         work_order_status NOT NULL DEFAULT 'open',
  priority       work_order_priority NOT NULL DEFAULT 'P3',
  severity       work_order_severity,
  assigned_to    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  location_id    UUID        REFERENCES locations(id)  ON DELETE SET NULL,
  due_date       DATE,
  started_at     TIMESTAMPTZ,
  closed_at      TIMESTAMPTZ,
  labor_hours    NUMERIC(10,2) NOT NULL DEFAULT 0,
  labor_cost     NUMERIC(12,2) NOT NULL DEFAULT 0,
  materials_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost     NUMERIC(12,2) GENERATED ALWAYS AS (labor_cost + materials_cost) STORED,
  notes          TEXT,
  created_by     UUID        NOT NULL REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_work_orders_org_id   ON work_orders(org_id)     WHERE deleted_at IS NULL;
CREATE INDEX idx_work_orders_status   ON work_orders(status)     WHERE deleted_at IS NULL;
CREATE INDEX idx_work_orders_assigned ON work_orders(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_work_orders_created  ON work_orders(created_at DESC) WHERE deleted_at IS NULL;

-- ─── Auto-generate WO number ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_work_order_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.number := 'WO-' || to_char(NOW(), 'YYYY') || '-' ||
                LPAD(nextval('work_order_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_work_order_number
  BEFORE INSERT ON work_orders
  FOR EACH ROW
  WHEN (NEW.number IS NULL OR NEW.number = '')
  EXECUTE FUNCTION set_work_order_number();

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE TRIGGER trg_work_orders_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Audit trigger ────────────────────────────────────────────────────────────

CREATE TRIGGER trg_work_orders_audit
  AFTER INSERT OR UPDATE OR DELETE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

-- ─── RLS Policies ─────────────────────────────────────────────────────────────

-- All org members can read open work orders
CREATE POLICY "work_orders_select_org" ON work_orders
  FOR SELECT USING (
    org_id = current_user_org() AND deleted_at IS NULL
  );

-- Inspectors, supervisors, admins can create work orders
CREATE POLICY "work_orders_insert_write_roles" ON work_orders
  FOR INSERT WITH CHECK (
    org_id = current_user_org()
    AND current_user_role() IN ('admin', 'supervisor', 'inspector')
  );

-- Assigned user can update their own; supervisors/admins can update any
CREATE POLICY "work_orders_update_assigned_or_manage" ON work_orders
  FOR UPDATE USING (
    org_id = current_user_org()
    AND (
      assigned_to = auth.uid()
      OR current_user_role() IN ('admin', 'supervisor')
    )
  );

-- Only admins can soft-delete
CREATE POLICY "work_orders_delete_admin" ON work_orders
  FOR UPDATE USING (
    org_id = current_user_org()
    AND current_user_role() = 'admin'
  );
