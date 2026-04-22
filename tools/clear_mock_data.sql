-- ============================================================
-- Clear Mock Data — Municipio de Guaynabo
-- Deletes all records with number prefixes from migration 009.
-- Safe to run at any time. Does NOT delete real user data.
-- ============================================================

BEGIN;

-- Checklist items linked to mock inspections
DELETE FROM inspection_checklist_items
  WHERE inspection_id IN (
    SELECT id FROM inspections WHERE number LIKE 'IN-2026-01%' OR number LIKE 'IN-2025-04%'
  );

-- Inspections
DELETE FROM inspections
  WHERE number LIKE 'IN-2026-01%' OR number LIKE 'IN-2025-04%';

-- Pothole reports
DELETE FROM pothole_reports
  WHERE number LIKE 'PH-2026-01%' OR number LIKE 'PH-2025-04%';

-- Work orders
DELETE FROM work_orders
  WHERE number LIKE 'WO-2026-01%' OR number LIKE 'WO-2025-04%';

-- Contract bids
DELETE FROM contract_bids
  WHERE contract_id IN (
    SELECT id FROM contracts WHERE number LIKE 'CT-202%-01%' OR number LIKE 'CT-202%-02%' OR number LIKE 'CT-202%-03%'
  );

-- Contracts
DELETE FROM contracts
  WHERE number LIKE 'CT-2025-01%' OR number LIKE 'CT-2026-01%';

-- Project attachments
DELETE FROM attachments
  WHERE related_id IN (
    SELECT id FROM projects WHERE number LIKE 'PJ-2025-01%' OR number LIKE 'PJ-2026-01%'
  );

-- Projects
DELETE FROM projects
  WHERE number LIKE 'PJ-2025-01%' OR number LIKE 'PJ-2026-01%';

COMMIT;

SELECT 'Mock data cleared.' AS status;
