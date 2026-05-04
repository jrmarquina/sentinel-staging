-- ================================================================
-- 028_contract_amendments.sql
-- Track contract amendments (order changes / value/date updates)
--
-- When a contract is amended in SAP (e.g. a new Purchase Order line),
-- we store the superseded values alongside the current valid values
-- so the UI can display a visual history without a separate audit table.
--
-- Changes:
--   1. previous_value    NUMERIC(14,2) — contract_value before amendment
--   2. previous_end_date DATE          — end_date before amendment
--   3. amended_at        TIMESTAMPTZ   — when the amendment was recorded
--
-- Safe for existing data:
--   · All columns nullable — no existing rows break
--   · NULL = never amended (standard display)
--   · Non-NULL = the contract has been amended at least once;
--     the current row holds the valid values,
--     previous_* holds what was superseded
-- ================================================================

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS previous_value    NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS previous_end_date DATE,
  ADD COLUMN IF NOT EXISTS amended_at        TIMESTAMPTZ;

COMMENT ON COLUMN contracts.previous_value IS
  'contract_value before the most recent amendment. '
  'NULL means the contract has never been amended.';

COMMENT ON COLUMN contracts.previous_end_date IS
  'end_date before the most recent amendment. '
  'NULL means the contract has never been amended.';

COMMENT ON COLUMN contracts.amended_at IS
  'Timestamp when the most recent amendment was recorded. '
  'NULL means the contract has never been amended. '
  'The UI renders a yellow ghost row showing previous_value / previous_end_date '
  'immediately above the current (valid) contract row.';

-- Partial index for quick amendment queries
CREATE INDEX IF NOT EXISTS idx_contracts_amended
  ON contracts(org_id, amended_at)
  WHERE amended_at IS NOT NULL AND deleted_at IS NULL;

-- ── END OF MIGRATION ─────────────────────────────────────────────
-- Data backfill for production was applied directly via SSH:
--   4600007204: 24,000 / 2026-04-17 → 30,000 / 2026-05-17
--   4600006852: 150,000 / 2026-04-29 → 162,500 / 2026-05-29
--   4600007146: 40,800 / 2026-04-29 → 61,200 / 2026-07-29
--   4600006416: 897,720 / 2026-04-30 → 995,720 / 2026-06-30
--   4600006842: 1,347,886 (same date) → 1,737,886
-- ================================================================
