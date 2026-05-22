-- Migration 044: Fix fm_reports table to match application expectations
--
-- Problems fixed:
--   1. Add missing `status` column (route inserts 'PENDING')
--   2. Add missing `metadata` JSONB column (portfolio report stores inspection count)
--   3. Add missing `signed_url` column (reports page displays download link)
--   4. Make `file_key` nullable (route never provides it; key is set when PDF is generated)
--   5. Fix type check constraint: 'INSPECTION_SUMMARY' → 'INSPECTION' to match route enum

-- 1. Status
ALTER TABLE fm_reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING';

-- 2. Metadata
ALTER TABLE fm_reports
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 3. Signed URL (populated when PDF is ready for download)
ALTER TABLE fm_reports
  ADD COLUMN IF NOT EXISTS signed_url TEXT;

-- 4. Make file_key nullable (set later by background job when PDF is stored)
ALTER TABLE fm_reports
  ALTER COLUMN file_key DROP NOT NULL,
  ALTER COLUMN file_key SET DEFAULT NULL;

-- 5. Fix type constraint: replace INSPECTION_SUMMARY with INSPECTION
ALTER TABLE fm_reports
  DROP CONSTRAINT IF EXISTS fm_reports_type_check;

ALTER TABLE fm_reports
  ADD CONSTRAINT fm_reports_type_check
    CHECK (type = ANY (ARRAY['INSPECTION'::text, 'PORTFOLIO_COMPLIANCE'::text]));

-- Update any existing rows that used the old value
UPDATE fm_reports SET type = 'INSPECTION' WHERE type = 'INSPECTION_SUMMARY';
