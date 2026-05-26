-- ─────────────────────────────────────────────────────────────────────────────
-- 046_fm_inspection_commentary.sql
--
-- Adds structured commentary fields to fm_checklist_item_responses so that
-- FCA inspection reports can carry RICS-style per-element narratives:
--   • notes            (existing) — field observation / what was seen
--   • inspector_notes             — professional assessment / interpretation
--   • recommended_action          — specific next step with timeline
--
-- The existing `notes` column is intentionally preserved unchanged so that
-- all current data and the existing "Form View" layout remain fully intact.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fm_checklist_item_responses
  ADD COLUMN IF NOT EXISTS inspector_notes    TEXT,
  ADD COLUMN IF NOT EXISTS recommended_action TEXT;

-- Sanity check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fm_checklist_item_responses'
      AND column_name = 'inspector_notes'
  ) THEN
    RAISE EXCEPTION 'inspector_notes column was not added';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fm_checklist_item_responses'
      AND column_name = 'recommended_action'
  ) THEN
    RAISE EXCEPTION 'recommended_action column was not added';
  END IF;
END $$;
