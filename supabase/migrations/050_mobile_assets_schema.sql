-- =============================================================
-- Migration 050: Mobile Assets — custodians, spaces, and asset
--                schema extensions
--
-- Adds the data foundation for tracking MOBILE assets (tables,
-- chairs, laptops) alongside the existing FIXED assets (cisterns,
-- generators, A/C units) already modelled in fm_assets.
--
-- New concepts:
--   · fm_custodians — people who can hold a mobile asset. These are
--     NOT login users (teachers, maintenance staff). Every property
--     also gets a system STORAGE custodian (created in migration 051)
--     representing "in storage / no specific person".
--   · fm_spaces — structured sub-locations within a building
--     (classrooms, offices, storage rooms). Nests optionally under
--     the existing fm_floors. Mirrors the "BUILDING \ FLOOR \ ROOM"
--     hierarchy in the municipal SAP inventory export.
--   · fm_assets extensions — mobility + status + denormalized
--     "current holder / current location" pointers, plus the SAP /
--     municipal inventory fields needed to ingest the existing
--     Inventario export (asset number, inventory tag, serial,
--     tablilla, fund/cost centre, acquisition + inventory dates).
--
-- Conventions (per CLAUDE.md §6):
--   · org_id scoping on every table
--   · UUID PKs via gen_random_uuid()
--   · deleted_at soft deletes
--   · updated_at trigger on mutable tables (trigger_set_timestamp)
--   · RLS enabled here; policies added in migration 052
-- =============================================================

-- ── 1. fm_custodians ─────────────────────────────────────────
-- People (and per-building STORAGE buckets) who can hold assets.
-- custodian_type:
--   TEACHER      — classroom teacher / Head Start staff
--   MAINTENANCE  — maintenance personnel (may roam buildings)
--   STAFF        — other municipal staff
--   STORAGE      — system bucket: "held by the building's storage,
--                  no specific person". One per property (enforced
--                  by the partial unique index below). Auto-created
--                  in migration 051.
CREATE TABLE fm_custodians (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id         UUID        NOT NULL REFERENCES organizations(id),
  -- Home / responsible building. NULL for roaming staff. STORAGE
  -- custodians always carry their building here.
  property_id    UUID        REFERENCES fm_properties(id) ON DELETE CASCADE,
  full_name      TEXT        NOT NULL,
  custodian_type TEXT        NOT NULL DEFAULT 'STAFF'
                             CHECK (custodian_type IN
                               ('TEACHER','MAINTENANCE','STAFF','STORAGE')),
  contact_email  TEXT,
  contact_phone  TEXT,
  -- Optional link to a login user, if this custodian happens to be
  -- a system user. Most custodians will not have one.
  profile_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  -- SAP "Personnel Number" from the inventory export, when present.
  external_ref   TEXT,
  -- Retiring a custodian keeps history intact (is_active = false):
  -- they drop out of check-out dropdowns but stay in the ledger.
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  notes          TEXT,
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fm_custodians ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_fm_custodians_updated_at
  BEFORE UPDATE ON fm_custodians
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX idx_fm_custodians_org_id      ON fm_custodians(org_id);
CREATE INDEX idx_fm_custodians_property_id ON fm_custodians(property_id);
CREATE INDEX idx_fm_custodians_active      ON fm_custodians(org_id, is_active)
  WHERE deleted_at IS NULL;

-- Exactly one STORAGE custodian per building.
CREATE UNIQUE INDEX uq_fm_custodians_storage_per_property
  ON fm_custodians(property_id)
  WHERE custodian_type = 'STORAGE' AND deleted_at IS NULL;


-- ── 2. fm_spaces ─────────────────────────────────────────────
-- Structured sub-locations inside a building. floor_id is optional
-- (not every export row identifies a floor). source_path preserves
-- the raw "BUILDING \ FLOOR \ ROOM" string from the SAP export for
-- traceability during/after ingestion.
CREATE TABLE fm_spaces (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID        NOT NULL REFERENCES organizations(id),
  property_id UUID        NOT NULL REFERENCES fm_properties(id) ON DELETE CASCADE,
  floor_id    UUID        REFERENCES fm_floors(id) ON DELETE SET NULL,
  name        TEXT        NOT NULL,
  space_type  TEXT        NOT NULL DEFAULT 'OTHER'
                          CHECK (space_type IN
                            ('CLASSROOM','OFFICE','STORAGE','COMMON','OUTDOOR','OTHER')),
  code        TEXT,
  source_path TEXT,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fm_spaces ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_fm_spaces_updated_at
  BEFORE UPDATE ON fm_spaces
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX idx_fm_spaces_org_id      ON fm_spaces(org_id);
CREATE INDEX idx_fm_spaces_property_id ON fm_spaces(property_id);
CREATE INDEX idx_fm_spaces_floor_id    ON fm_spaces(floor_id) WHERE floor_id IS NOT NULL;
CREATE UNIQUE INDEX uq_fm_spaces_property_name
  ON fm_spaces(property_id, name) WHERE deleted_at IS NULL;


-- ── 3. fm_assets extensions ──────────────────────────────────
-- mobility distinguishes FIXED (always tied to a building) from
-- MOBILE (movable, tracked via the fm_asset_movements ledger).
-- The current_* pointers are denormalized "latest state" columns
-- kept in sync by a trigger in migration 051 — they always reflect
-- the most recent movement and exist purely to make list/detail
-- reads cheap. property_id remains the asset's current building.
ALTER TABLE fm_assets
  ADD COLUMN IF NOT EXISTS mobility             TEXT NOT NULL DEFAULT 'FIXED'
                             CHECK (mobility IN ('FIXED','MOBILE')),
  ADD COLUMN IF NOT EXISTS status               TEXT NOT NULL DEFAULT 'IN_SERVICE'
                             CHECK (status IN
                               ('IN_SERVICE','IN_STORAGE','IN_REPAIR','RETIRED')),
  ADD COLUMN IF NOT EXISTS current_custodian_id UUID REFERENCES fm_custodians(id),
  ADD COLUMN IF NOT EXISTS current_space_id     UUID REFERENCES fm_spaces(id),
  -- ── SAP / municipal inventory fields (from the Inventario export) ──
  ADD COLUMN IF NOT EXISTS sap_asset_number     TEXT,
  ADD COLUMN IF NOT EXISTS sap_subnumber        TEXT,
  ADD COLUMN IF NOT EXISTS inventory_number     TEXT,
  ADD COLUMN IF NOT EXISTS serial               TEXT,
  ADD COLUMN IF NOT EXISTS tablilla             TEXT,
  ADD COLUMN IF NOT EXISTS modulo               TEXT,
  ADD COLUMN IF NOT EXISTS fund                 TEXT,
  ADD COLUMN IF NOT EXISTS fund_center          TEXT,
  ADD COLUMN IF NOT EXISTS cost_center          TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_year          TEXT,
  ADD COLUMN IF NOT EXISTS acquisition_date     DATE,
  ADD COLUMN IF NOT EXISTS acquisition_value    NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS last_inventory_date  DATE;

-- Lookups used by the asset list filters and custody search.
CREATE INDEX IF NOT EXISTS idx_fm_assets_mobility
  ON fm_assets(org_id, mobility) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fm_assets_status
  ON fm_assets(org_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fm_assets_current_custodian
  ON fm_assets(current_custodian_id) WHERE current_custodian_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fm_assets_current_space
  ON fm_assets(current_space_id) WHERE current_space_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fm_assets_inventory_number
  ON fm_assets(org_id, inventory_number) WHERE inventory_number IS NOT NULL;

COMMENT ON COLUMN fm_assets.mobility IS
  'FIXED = permanent building equipment; MOBILE = movable, tracked via fm_asset_movements.';
COMMENT ON COLUMN fm_assets.current_custodian_id IS
  'Denormalized latest holder. Synced from fm_asset_movements by trigger — do not set directly.';
COMMENT ON COLUMN fm_assets.current_space_id IS
  'Denormalized latest location. Synced from fm_asset_movements by trigger — do not set directly.';
