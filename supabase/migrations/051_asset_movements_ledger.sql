-- =============================================================
-- Migration 051: Asset movements ledger + state-sync triggers
--
-- fm_asset_movements is the append-only chain-of-custody ledger.
-- Every check-out / check-in / transfer / relocate / retire is a
-- new immutable row — nothing is overwritten. The denormalized
-- fm_assets.current_* pointers are kept in sync from the latest
-- movement by an AFTER INSERT trigger, so list/detail reads never
-- have to scan the ledger.
--
-- Also: every building gets a system STORAGE custodian ("held by
-- storage, no specific person"), auto-created on property insert
-- and backfilled for existing properties.
-- =============================================================

-- ── 1. fm_asset_movements (the ledger) ───────────────────────
-- event_type:
--   ACQUISITION — asset first entered inventory
--   CHECKOUT    — handed to a person (STORAGE/none → person)
--   CHECKIN     — returned (person → STORAGE/none)
--   TRANSFER    — person → person directly
--   RELOCATE    — moved between spaces/buildings, custody unchanged
--   RETIRE      — decommissioned (the "Decomiso" sheets)
--
-- from_* columns capture the prior state (redundant with the
-- previous row, stored for a self-contained, human-readable row).
-- to_* columns are the new state the asset lands in.
CREATE TABLE fm_asset_movements (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id             UUID        NOT NULL REFERENCES organizations(id),
  asset_id           UUID        NOT NULL REFERENCES fm_assets(id) ON DELETE CASCADE,
  event_type         TEXT        NOT NULL CHECK (event_type IN
                                   ('ACQUISITION','CHECKOUT','CHECKIN',
                                    'TRANSFER','RELOCATE','RETIRE')),
  from_custodian_id  UUID        REFERENCES fm_custodians(id),
  to_custodian_id    UUID        REFERENCES fm_custodians(id),
  from_space_id      UUID        REFERENCES fm_spaces(id),
  to_space_id        UUID        REFERENCES fm_spaces(id),
  from_property_id   UUID        REFERENCES fm_properties(id),
  to_property_id     UUID        REFERENCES fm_properties(id),
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The supervisor who logged the movement (writes are gated to
  -- org_manager+ in migration 052).
  recorded_by        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  condition_at_event TEXT        CHECK (condition_at_event IN ('GOOD','FAIR','POOR')
                                        OR condition_at_event IS NULL),
  note               TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fm_asset_movements ENABLE ROW LEVEL SECURITY;

-- Indexes powering the three custody-search lenses:
--   by object   → (asset_id, occurred_at)
--   by person   → (to/from_custodian_id, occurred_at)
--   by location → (to_space_id, occurred_at)
CREATE INDEX idx_fm_movements_org_id     ON fm_asset_movements(org_id);
CREATE INDEX idx_fm_movements_asset      ON fm_asset_movements(asset_id, occurred_at DESC);
CREATE INDEX idx_fm_movements_to_cust    ON fm_asset_movements(to_custodian_id, occurred_at DESC)
  WHERE to_custodian_id IS NOT NULL;
CREATE INDEX idx_fm_movements_from_cust  ON fm_asset_movements(from_custodian_id, occurred_at DESC)
  WHERE from_custodian_id IS NOT NULL;
CREATE INDEX idx_fm_movements_to_space   ON fm_asset_movements(to_space_id, occurred_at DESC)
  WHERE to_space_id IS NOT NULL;
CREATE INDEX idx_fm_movements_occurred   ON fm_asset_movements(org_id, occurred_at DESC);


-- ── 2. Sync fm_assets.current_* from the latest movement ─────
-- Fires AFTER INSERT of a movement. Resolves the effective landing
-- building (space's property → explicit to_property_id → custodian's
-- home) and updates the asset's denormalized pointers + status.
CREATE OR REPLACE FUNCTION fm_sync_asset_from_movement()
RETURNS TRIGGER AS $$
DECLARE
  _to_property   UUID;
  _to_cust_type  TEXT;
BEGIN
  -- Effective destination building.
  _to_property := NULL;
  IF NEW.to_space_id IS NOT NULL THEN
    SELECT property_id INTO _to_property FROM fm_spaces WHERE id = NEW.to_space_id;
  END IF;
  IF _to_property IS NULL THEN
    _to_property := NEW.to_property_id;
  END IF;
  IF _to_property IS NULL AND NEW.to_custodian_id IS NOT NULL THEN
    SELECT property_id INTO _to_property FROM fm_custodians WHERE id = NEW.to_custodian_id;
  END IF;

  SELECT custodian_type INTO _to_cust_type
    FROM fm_custodians WHERE id = NEW.to_custodian_id;

  UPDATE fm_assets a
  SET
    current_custodian_id = NEW.to_custodian_id,
    current_space_id     = NEW.to_space_id,
    property_id          = COALESCE(_to_property, a.property_id),
    status = CASE
      WHEN NEW.event_type = 'RETIRE' THEN 'RETIRED'
      WHEN NEW.event_type IN ('CHECKIN','RELOCATE')
           AND _to_cust_type = 'STORAGE' THEN 'IN_STORAGE'
      WHEN NEW.event_type IN ('CHECKOUT','TRANSFER') THEN 'IN_SERVICE'
      ELSE a.status
    END
  WHERE a.id = NEW.asset_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_fm_movement_sync_asset
  AFTER INSERT ON fm_asset_movements
  FOR EACH ROW EXECUTE FUNCTION fm_sync_asset_from_movement();


-- ── 3. Per-building STORAGE custodian ────────────────────────
-- Guarantees each property has exactly one STORAGE custodian, the
-- default landing bucket for assets in storage / unassigned.
CREATE OR REPLACE FUNCTION fm_ensure_storage_custodian()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO fm_custodians (org_id, property_id, full_name, custodian_type)
  SELECT NEW.org_id, NEW.id, NEW.name || ' — Storage', 'STORAGE'
  WHERE NOT EXISTS (
    SELECT 1 FROM fm_custodians
    WHERE property_id = NEW.id
      AND custodian_type = 'STORAGE'
      AND deleted_at IS NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_fm_property_storage_custodian
  AFTER INSERT ON fm_properties
  FOR EACH ROW EXECUTE FUNCTION fm_ensure_storage_custodian();

-- Backfill existing properties.
INSERT INTO fm_custodians (org_id, property_id, full_name, custodian_type)
SELECT p.org_id, p.id, p.name || ' — Storage', 'STORAGE'
FROM fm_properties p
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM fm_custodians c
    WHERE c.property_id = p.id
      AND c.custodian_type = 'STORAGE'
      AND c.deleted_at IS NULL
  );
