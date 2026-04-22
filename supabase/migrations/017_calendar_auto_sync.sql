-- ============================================================
-- Migration 017: Calendar Auto-Sync
-- DB triggers that keep calendar_events in sync whenever
-- work_orders, projects, or inspections are inserted/updated.
--
-- Rules:
--   work_orders   → event when due_date IS NOT NULL and status NOT IN (closed, cancelled)
--   projects      → event when planned_end_date IS NOT NULL and status NOT IN (completed, cancelled)
--   inspections   → event when scheduled_at IS NOT NULL and status NOT IN (completed, approved)
--
-- On soft-delete (deleted_at set): matching calendar event is also soft-deleted.
-- On date cleared: calendar event is soft-deleted.
-- On date changed: calendar event is updated in place (same related_id).
-- ============================================================

-- ─── work_orders → calendar_events ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_work_order_calendar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_color TEXT;
BEGIN
  -- Soft-delete: remove the calendar event
  IF NEW.deleted_at IS NOT NULL THEN
    UPDATE calendar_events
    SET deleted_at = NEW.deleted_at
    WHERE related_id = NEW.id
      AND related_table = 'work_orders'
      AND deleted_at IS NULL;
    RETURN NEW;
  END IF;

  -- Status closed/cancelled: remove the calendar event
  IF NEW.status IN ('closed', 'cancelled') THEN
    UPDATE calendar_events
    SET deleted_at = NOW()
    WHERE related_id = NEW.id
      AND related_table = 'work_orders'
      AND deleted_at IS NULL;
    RETURN NEW;
  END IF;

  -- No due_date: remove any existing event
  IF NEW.due_date IS NULL THEN
    UPDATE calendar_events
    SET deleted_at = NOW()
    WHERE related_id = NEW.id
      AND related_table = 'work_orders'
      AND deleted_at IS NULL;
    RETURN NEW;
  END IF;

  -- Determine color by priority
  v_color := CASE NEW.priority
    WHEN 'P1' THEN '#7c3aed'
    WHEN 'P2' THEN '#3b82f6'
    WHEN 'P3' THEN '#64748b'
    ELSE            '#94a3b8'
  END;

  -- Upsert: update existing event or insert a new one
  UPDATE calendar_events
  SET
    title      = '[' || NEW.number || '] ' || NEW.title,
    start_at   = NEW.due_date::timestamptz,
    end_at     = (NEW.due_date + INTERVAL '2 hours')::timestamptz,
    color      = v_color,
    deleted_at = NULL,
    updated_at = NOW()
  WHERE related_id    = NEW.id
    AND related_table = 'work_orders';

  IF NOT FOUND THEN
    INSERT INTO calendar_events
      (org_id, title, start_at, end_at, event_type, related_id, related_table, color, all_day)
    VALUES (
      NEW.org_id,
      '[' || NEW.number || '] ' || NEW.title,
      NEW.due_date::timestamptz,
      (NEW.due_date + INTERVAL '2 hours')::timestamptz,
      'work_order',
      NEW.id,
      'work_orders',
      v_color,
      TRUE
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_work_order_calendar_sync
  AFTER INSERT OR UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_work_order_calendar();

-- ─── projects → calendar_events ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_project_calendar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Soft-delete
  IF NEW.deleted_at IS NOT NULL THEN
    UPDATE calendar_events
    SET deleted_at = NEW.deleted_at
    WHERE related_id = NEW.id
      AND related_table = 'projects'
      AND deleted_at IS NULL;
    RETURN NEW;
  END IF;

  -- Status completed/cancelled
  IF NEW.status IN ('completed', 'cancelled') THEN
    UPDATE calendar_events
    SET deleted_at = NOW()
    WHERE related_id = NEW.id
      AND related_table = 'projects'
      AND deleted_at IS NULL;
    RETURN NEW;
  END IF;

  -- No planned_end_date
  IF NEW.planned_end_date IS NULL THEN
    UPDATE calendar_events
    SET deleted_at = NOW()
    WHERE related_id = NEW.id
      AND related_table = 'projects'
      AND deleted_at IS NULL;
    RETURN NEW;
  END IF;

  -- Upsert
  UPDATE calendar_events
  SET
    title      = '[' || NEW.number || '] ' || NEW.name || ' — Deadline',
    start_at   = NEW.planned_end_date::timestamptz,
    end_at     = (NEW.planned_end_date + INTERVAL '1 day')::timestamptz,
    color      = '#0ea5e9',
    deleted_at = NULL,
    updated_at = NOW()
  WHERE related_id    = NEW.id
    AND related_table = 'projects';

  IF NOT FOUND THEN
    INSERT INTO calendar_events
      (org_id, title, start_at, end_at, event_type, related_id, related_table, color, all_day)
    VALUES (
      NEW.org_id,
      '[' || NEW.number || '] ' || NEW.name || ' — Deadline',
      NEW.planned_end_date::timestamptz,
      (NEW.planned_end_date + INTERVAL '1 day')::timestamptz,
      'contract_milestone',
      NEW.id,
      'projects',
      '#0ea5e9',
      TRUE
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_calendar_sync
  AFTER INSERT OR UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION sync_project_calendar();

-- ─── inspections → calendar_events ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_inspection_calendar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Soft-delete
  IF NEW.deleted_at IS NOT NULL THEN
    UPDATE calendar_events
    SET deleted_at = NEW.deleted_at
    WHERE related_id = NEW.id
      AND related_table = 'inspections'
      AND deleted_at IS NULL;
    RETURN NEW;
  END IF;

  -- Status completed/approved: remove from calendar (done)
  IF NEW.status IN ('completed', 'approved') THEN
    UPDATE calendar_events
    SET deleted_at = NOW()
    WHERE related_id = NEW.id
      AND related_table = 'inspections'
      AND deleted_at IS NULL;
    RETURN NEW;
  END IF;

  -- No scheduled_at
  IF NEW.scheduled_at IS NULL THEN
    UPDATE calendar_events
    SET deleted_at = NOW()
    WHERE related_id = NEW.id
      AND related_table = 'inspections'
      AND deleted_at IS NULL;
    RETURN NEW;
  END IF;

  -- Upsert
  UPDATE calendar_events
  SET
    title      = '[' || NEW.number || '] ' || NEW.title,
    start_at   = NEW.scheduled_at,
    end_at     = NEW.scheduled_at + INTERVAL '2 hours',
    color      = '#10b981',
    deleted_at = NULL,
    updated_at = NOW()
  WHERE related_id    = NEW.id
    AND related_table = 'inspections';

  IF NOT FOUND THEN
    INSERT INTO calendar_events
      (org_id, title, start_at, end_at, event_type, related_id, related_table, color, all_day)
    VALUES (
      NEW.org_id,
      '[' || NEW.number || '] ' || NEW.title,
      NEW.scheduled_at,
      NEW.scheduled_at + INTERVAL '2 hours',
      'inspection',
      NEW.id,
      'inspections',
      '#10b981',
      FALSE
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inspection_calendar_sync
  AFTER INSERT OR UPDATE ON inspections
  FOR EACH ROW
  EXECUTE FUNCTION sync_inspection_calendar();

-- ─── Back-fill: sync existing records that have no calendar event yet ─────────
-- Runs once at migration time. Fires the same logic by touching updated_at,
-- which triggers the AFTER UPDATE hooks above.

UPDATE work_orders
SET updated_at = updated_at
WHERE deleted_at IS NULL
  AND due_date IS NOT NULL
  AND status NOT IN ('closed', 'cancelled')
  AND NOT EXISTS (
    SELECT 1 FROM calendar_events
    WHERE related_id = work_orders.id
      AND related_table = 'work_orders'
      AND deleted_at IS NULL
  );

UPDATE projects
SET updated_at = updated_at
WHERE deleted_at IS NULL
  AND planned_end_date IS NOT NULL
  AND status NOT IN ('completed', 'cancelled')
  AND NOT EXISTS (
    SELECT 1 FROM calendar_events
    WHERE related_id = projects.id
      AND related_table = 'projects'
      AND deleted_at IS NULL
  );

UPDATE inspections
SET updated_at = updated_at
WHERE deleted_at IS NULL
  AND scheduled_at IS NOT NULL
  AND status NOT IN ('completed', 'approved')
  AND NOT EXISTS (
    SELECT 1 FROM calendar_events
    WHERE related_id = inspections.id
      AND related_table = 'inspections'
      AND deleted_at IS NULL
  );
