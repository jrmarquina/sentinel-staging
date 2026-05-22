-- Migration 045: Add cost_estimate to fm_checklist_item_responses
-- Allows admins to attach an optional remediation cost estimate to any
-- deficiency found during an FM / FCA inspection.

ALTER TABLE fm_checklist_item_responses
  ADD COLUMN IF NOT EXISTS cost_estimate NUMERIC(12,2)
    CHECK (cost_estimate IS NULL OR cost_estimate >= 0);

COMMENT ON COLUMN fm_checklist_item_responses.cost_estimate IS
  'Optional estimated remediation cost. Set by org_admin after assessment. Not required for inspection completion.';

-- Verify
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fm_checklist_item_responses' AND column_name = 'cost_estimate'
  ) THEN
    RAISE EXCEPTION 'cost_estimate column not created';
  END IF;
  RAISE NOTICE 'Migration 045 passed.';
END $$;
