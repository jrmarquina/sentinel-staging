-- ============================================================
-- Migration 010: Add lat/lng directly to work_orders
-- Stores the precise field pin independently of the locations FK.
-- ============================================================

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);

-- Spatial index for future proximity queries
CREATE INDEX IF NOT EXISTS work_orders_latlon_idx
  ON work_orders (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
