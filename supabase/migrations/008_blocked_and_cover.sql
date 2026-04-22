-- ============================================================
-- Migration 008: Blocked-by tracking + cover_url + soft-delete helpers
-- ============================================================

-- ── Projects: blocked-by fields + cover URL ───────────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS blocked           BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS blocked_by        TEXT,       -- entity name: "DTOP", "AAA", "Vendor XYZ"
  ADD COLUMN IF NOT EXISTS blocked_by_reason TEXT,
  ADD COLUMN IF NOT EXISTS blocked_since     DATE,
  ADD COLUMN IF NOT EXISTS cover_url         TEXT;       -- external image URL for mock/hero images

-- ── Work Orders: blocked-by fields ───────────────────────────

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS blocked           BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS blocked_by        TEXT,
  ADD COLUMN IF NOT EXISTS blocked_by_reason TEXT,
  ADD COLUMN IF NOT EXISTS blocked_since     DATE;

-- ── Index blocked items for dashboard queries ─────────────────

CREATE INDEX IF NOT EXISTS projects_blocked_idx
  ON projects (org_id, blocked)
  WHERE deleted_at IS NULL AND blocked = TRUE;

CREATE INDEX IF NOT EXISTS work_orders_blocked_idx
  ON work_orders (org_id, blocked)
  WHERE deleted_at IS NULL AND blocked = TRUE;

-- ── Dashboard priority view ───────────────────────────────────
-- Combines overdue projects + overdue work orders into one feed

CREATE OR REPLACE VIEW dashboard_overdue AS
SELECT
  'project'   AS item_type,
  p.id,
  p.org_id,
  p.number,
  p.name      AS title,
  p.status::TEXT,
  p.planned_end_date AS due_date,
  CURRENT_DATE - p.planned_end_date AS days_overdue,
  p.blocked,
  p.blocked_by,
  p.blocked_by_reason,
  NULL::TEXT  AS priority
FROM projects p
WHERE p.deleted_at IS NULL
  AND p.status NOT IN ('completed','cancelled')
  AND p.planned_end_date < CURRENT_DATE

UNION ALL

SELECT
  'work_order' AS item_type,
  wo.id,
  wo.org_id,
  wo.number,
  wo.title,
  wo.status::TEXT,
  wo.due_date,
  CURRENT_DATE - wo.due_date AS days_overdue,
  wo.blocked,
  wo.blocked_by,
  wo.blocked_by_reason,
  wo.priority::TEXT
FROM work_orders wo
WHERE wo.deleted_at IS NULL
  AND wo.status NOT IN ('closed','cancelled')
  AND wo.due_date < CURRENT_DATE

ORDER BY days_overdue DESC;
