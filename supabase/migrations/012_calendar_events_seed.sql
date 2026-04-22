-- ============================================================
-- Migration 012: Seed calendar_events from existing work orders,
-- projects, and inspections for Guaynabo mock data.
-- ============================================================

DO $$
DECLARE
  v_org_id  UUID;
  v_user_id UUID;
BEGIN
  SELECT id INTO v_org_id  FROM organizations LIMIT 1;
  SELECT id INTO v_user_id FROM profiles      LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No org found — skipping.';
    RETURN;
  END IF;

  -- Clear any previous seed events to keep idempotent
  DELETE FROM calendar_events
  WHERE org_id = v_org_id
    AND related_table IN ('work_orders', 'projects', 'inspections');

  -- ── Work order due dates ─────────────────────────────────────
  INSERT INTO calendar_events
    (id, org_id, title, start_at, end_at, event_type, related_id, related_table,
     color, all_day, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    v_org_id,
    '[' || number || '] ' || title,
    due_date::timestamptz,
    (due_date + INTERVAL '2 hours')::timestamptz,
    'work_order',
    id,
    'work_orders',
    CASE priority
      WHEN 'P1' THEN '#7c3aed'
      WHEN 'P2' THEN '#3b82f6'
      WHEN 'P3' THEN '#64748b'
      ELSE '#94a3b8'
    END,
    TRUE,
    NOW(),
    NOW()
  FROM work_orders
  WHERE org_id = v_org_id
    AND due_date IS NOT NULL
    AND deleted_at IS NULL
    AND status NOT IN ('closed', 'cancelled');

  -- ── Project planned end dates ────────────────────────────────
  INSERT INTO calendar_events
    (id, org_id, title, start_at, end_at, event_type, related_id, related_table,
     color, all_day, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    v_org_id,
    '[' || number || '] ' || name || ' — Deadline',
    planned_end_date::timestamptz,
    (planned_end_date + INTERVAL '1 day')::timestamptz,
    'contract_milestone',
    id,
    'projects',
    CASE
      WHEN blocked THEN '#b45309'
      WHEN planned_end_date < CURRENT_DATE THEN '#9f403d'
      WHEN planned_end_date < CURRENT_DATE + INTERVAL '14 days' THEN '#d97706'
      ELSE '#006b62'
    END,
    TRUE,
    NOW(),
    NOW()
  FROM projects
  WHERE org_id = v_org_id
    AND planned_end_date IS NOT NULL
    AND deleted_at IS NULL
    AND status NOT IN ('completed', 'cancelled');

  -- ── Project start dates ──────────────────────────────────────
  INSERT INTO calendar_events
    (id, org_id, title, start_at, end_at, event_type, related_id, related_table,
     color, all_day, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    v_org_id,
    '[' || number || '] ' || name || ' — Start',
    start_date::timestamptz,
    (start_date + INTERVAL '1 day')::timestamptz,
    'contract_milestone',
    id,
    'projects',
    '#565e74',
    TRUE,
    NOW(),
    NOW()
  FROM projects
  WHERE org_id = v_org_id
    AND start_date IS NOT NULL
    AND deleted_at IS NULL;

  -- ── Scheduled inspections ────────────────────────────────────
  INSERT INTO calendar_events
    (id, org_id, title, start_at, end_at, event_type, related_id, related_table,
     color, all_day, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    v_org_id,
    '[' || number || '] ' || title,
    scheduled_at,
    scheduled_at + INTERVAL '4 hours',
    'inspection',
    id,
    'inspections',
    '#10b981',
    FALSE,
    NOW(),
    NOW()
  FROM inspections
  WHERE org_id = v_org_id
    AND scheduled_at IS NOT NULL
    AND deleted_at IS NULL;

  RAISE NOTICE 'Calendar events seeded for org_id = %', v_org_id;
END $$;
