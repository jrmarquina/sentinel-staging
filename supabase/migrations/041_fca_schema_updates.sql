-- =============================================================
-- Migration 041: FCA schema updates
-- =============================================================
-- 1. Add `rating` column to fm_checklist_item_responses
--    Stores 1-5 condition rating for FCA components.
--    Regular pass/fail inspections leave this NULL.
-- 2. Fix trigger NULL-safety bug in fm_auto_create_work_order
--    Previous: NULL != 'fail' evaluates to NULL in Postgres (falsy),
--    causing the trigger to proceed and create work orders on NULL saves.
--    Fixed: use IS DISTINCT FROM for NULL-safe comparison.
-- 3. Add address/year/area columns to fm_properties
--    These fields are needed for FCA Section A pre-fill and for
--    a richer property profile. All nullable.
-- =============================================================

-- ── 1. Rating column ─────────────────────────────────────────

ALTER TABLE fm_checklist_item_responses
  ADD COLUMN IF NOT EXISTS rating SMALLINT
    CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

COMMENT ON COLUMN fm_checklist_item_responses.rating IS
  '1-5 condition rating used by FCA assessments. NULL for regular pass/fail inspections.';

-- ── 2. Fix trigger NULL-safety ────────────────────────────────

CREATE OR REPLACE FUNCTION fm_auto_create_work_order()
RETURNS TRIGGER AS $$
DECLARE
  v_inspection  fm_inspections%ROWTYPE;
  v_exists      BOOLEAN;
BEGIN
  -- NULL-safe guard: only fire on explicit 'fail' result or 'HIGH' severity.
  -- Previous code used != which evaluates to NULL for NULL inputs (bug).
  IF NEW.result IS DISTINCT FROM 'fail' AND NEW.severity IS DISTINCT FROM 'HIGH' THEN
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

-- ── 3. Property address / profile columns ─────────────────────

ALTER TABLE fm_properties
  ADD COLUMN IF NOT EXISTS address          TEXT,
  ADD COLUMN IF NOT EXISTS year_built       SMALLINT
    CHECK (year_built IS NULL OR year_built BETWEEN 1800 AND 2100),
  ADD COLUMN IF NOT EXISTS gross_area_sqft  INTEGER
    CHECK (gross_area_sqft IS NULL OR gross_area_sqft > 0),
  ADD COLUMN IF NOT EXISTS num_stories      SMALLINT
    CHECK (num_stories IS NULL OR num_stories > 0),
  ADD COLUMN IF NOT EXISTS construction_type TEXT,
  ADD COLUMN IF NOT EXISTS occupancy_type    TEXT;

COMMENT ON COLUMN fm_properties.address           IS 'Full street address of the facility';
COMMENT ON COLUMN fm_properties.year_built        IS 'Year of original construction';
COMMENT ON COLUMN fm_properties.gross_area_sqft   IS 'Total gross floor area in square feet';
COMMENT ON COLUMN fm_properties.num_stories       IS 'Number of above-grade stories';
COMMENT ON COLUMN fm_properties.construction_type IS 'e.g. masonry, reinforced concrete, wood frame, steel';
COMMENT ON COLUMN fm_properties.occupancy_type    IS 'e.g. office, community center, sports complex, warehouse';

-- ── Sanity check ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fm_checklist_item_responses'
      AND column_name = 'rating'
  ) THEN
    RAISE EXCEPTION 'rating column not created on fm_checklist_item_responses';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fm_properties'
      AND column_name = 'address'
  ) THEN
    RAISE EXCEPTION 'address column not created on fm_properties';
  END IF;

  RAISE NOTICE 'Migration 041 sanity check passed.';
END $$;
