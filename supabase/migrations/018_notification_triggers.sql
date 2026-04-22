-- ============================================================
-- Migration 018: Notification Triggers
-- Inserts into notifications table on four events:
--   1. Item assigned to a user (work_orders, pothole_reports, inspections)
--   2. Item blocked status set (work_orders, projects)
--   3. Inspection score submitted (score changed from NULL → value)
--   4. Item overdue (due_date/scheduled_at crossed, checked on UPDATE)
--
-- All functions are SECURITY DEFINER so they bypass the RLS policy
-- that restricts notification inserts to the service role.
-- Notifications are per-user: only the affected user receives them.
-- ============================================================

-- ─── Helper: insert one notification safely ───────────────────────────────────
-- Skips silently if user_id is NULL (unassigned items).

CREATE OR REPLACE FUNCTION notify_user(
  p_org_id       UUID,
  p_user_id      UUID,
  p_title        TEXT,
  p_body         TEXT,
  p_related_id   UUID,
  p_related_table TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  INSERT INTO notifications (org_id, user_id, title, body, related_id, related_table)
  VALUES (p_org_id, p_user_id, p_title, p_body, p_related_id, p_related_table);
END;
$$;

-- ─── 1 + 2 + 4: work_orders ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_work_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_label TEXT := '[' || NEW.number || '] ' || NEW.title;
BEGIN
  -- Skip deleted records
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  -- 1. Assignment: assigned_to changed and is not NULL
  IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND NEW.assigned_to IS NOT NULL THEN
    PERFORM notify_user(
      NEW.org_id, NEW.assigned_to,
      'Work order assigned to you',
      v_label,
      NEW.id, 'work_orders'
    );
  END IF;

  -- 2. Blocked: blocked flipped TRUE
  IF (OLD.blocked IS DISTINCT FROM NEW.blocked) AND NEW.blocked = TRUE THEN
    -- Notify assignee (if any)
    PERFORM notify_user(
      NEW.org_id, NEW.assigned_to,
      'Work order blocked',
      v_label || ' is now blocked' || COALESCE(' by ' || NEW.blocked_by, ''),
      NEW.id, 'work_orders'
    );
  END IF;

  -- 4. Overdue: due_date newly in the past and status still open/in_progress
  IF NEW.due_date IS NOT NULL
     AND NEW.due_date < CURRENT_DATE
     AND NEW.status IN ('open', 'in_progress', 'on_hold')
     AND NEW.assigned_to IS NOT NULL
     -- Only fire once: either due_date just changed to past, or status just changed into open/in_progress
     AND (
       OLD.due_date IS DISTINCT FROM NEW.due_date
       OR OLD.status IS DISTINCT FROM NEW.status
     )
  THEN
    PERFORM notify_user(
      NEW.org_id, NEW.assigned_to,
      'Work order overdue',
      v_label || ' was due ' || to_char(NEW.due_date, 'Mon DD, YYYY'),
      NEW.id, 'work_orders'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_work_order
  AFTER UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_work_order();

-- Also fire on INSERT so creating a pre-assigned work order notifies immediately
CREATE OR REPLACE FUNCTION notify_work_order_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_label TEXT := '[' || NEW.number || '] ' || NEW.title;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    PERFORM notify_user(
      NEW.org_id, NEW.assigned_to,
      'Work order assigned to you',
      v_label,
      NEW.id, 'work_orders'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_work_order_insert
  AFTER INSERT ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_work_order_insert();

-- ─── 1 + 2 + 4: pothole_reports ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_pothole()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_label TEXT := '[' || NEW.number || '] ' || NEW.title;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  -- 1. Assignment
  IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND NEW.assigned_to IS NOT NULL THEN
    PERFORM notify_user(
      NEW.org_id, NEW.assigned_to,
      'Damage report assigned to you',
      v_label,
      NEW.id, 'pothole_reports'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_pothole
  AFTER UPDATE ON pothole_reports
  FOR EACH ROW
  EXECUTE FUNCTION notify_pothole();

CREATE OR REPLACE FUNCTION notify_pothole_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    PERFORM notify_user(
      NEW.org_id, NEW.assigned_to,
      'Damage report assigned to you',
      '[' || NEW.number || '] ' || NEW.title,
      NEW.id, 'pothole_reports'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_pothole_insert
  AFTER INSERT ON pothole_reports
  FOR EACH ROW
  EXECUTE FUNCTION notify_pothole_insert();

-- ─── 1 + 3 + 4: inspections ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_inspection()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_label TEXT := '[' || NEW.number || '] ' || NEW.title;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  -- 1. Assignment (inspector_id changed)
  IF (OLD.inspector_id IS DISTINCT FROM NEW.inspector_id) AND NEW.inspector_id IS NOT NULL THEN
    PERFORM notify_user(
      NEW.org_id, NEW.inspector_id,
      'Inspection assigned to you',
      v_label,
      NEW.id, 'inspections'
    );
  END IF;

  -- 3. Score submitted: score changed from NULL to a value
  IF OLD.score IS NULL AND NEW.score IS NOT NULL THEN
    -- Notify the inspector that their score was recorded
    PERFORM notify_user(
      NEW.org_id, NEW.inspector_id,
      'Inspection score recorded: ' || NEW.score || '%',
      v_label,
      NEW.id, 'inspections'
    );
    -- Also notify the creator if different from inspector
    IF NEW.created_by IS DISTINCT FROM NEW.inspector_id THEN
      PERFORM notify_user(
        NEW.org_id, NEW.created_by,
        'Inspection score recorded: ' || NEW.score || '%',
        v_label,
        NEW.id, 'inspections'
      );
    END IF;
  END IF;

  -- 4. Overdue: scheduled_at newly in the past, not yet completed/approved
  IF NEW.scheduled_at IS NOT NULL
     AND NEW.scheduled_at < NOW()
     AND NEW.status IN ('draft', 'in_progress')
     AND NEW.inspector_id IS NOT NULL
     AND (
       OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
       OR OLD.status IS DISTINCT FROM NEW.status
     )
  THEN
    PERFORM notify_user(
      NEW.org_id, NEW.inspector_id,
      'Inspection overdue',
      v_label || ' was scheduled for ' || to_char(NEW.scheduled_at AT TIME ZONE 'UTC', 'Mon DD, YYYY'),
      NEW.id, 'inspections'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_inspection
  AFTER UPDATE ON inspections
  FOR EACH ROW
  EXECUTE FUNCTION notify_inspection();

CREATE OR REPLACE FUNCTION notify_inspection_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.inspector_id IS NOT NULL THEN
    PERFORM notify_user(
      NEW.org_id, NEW.inspector_id,
      'Inspection assigned to you',
      '[' || NEW.number || '] ' || NEW.title,
      NEW.id, 'inspections'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_inspection_insert
  AFTER INSERT ON inspections
  FOR EACH ROW
  EXECUTE FUNCTION notify_inspection_insert();

-- ─── 2. projects blocked ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_project()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_label TEXT := '[' || NEW.number || '] ' || NEW.name;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  -- Blocked status set
  IF (OLD.blocked IS DISTINCT FROM NEW.blocked) AND NEW.blocked = TRUE THEN
    -- Notify the project manager
    PERFORM notify_user(
      NEW.org_id, NEW.project_manager,
      'Project blocked',
      v_label || ' is now blocked' || COALESCE(' by ' || NEW.blocked_by, ''),
      NEW.id, 'projects'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_project
  AFTER UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION notify_project();
