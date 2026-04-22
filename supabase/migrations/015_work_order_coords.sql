-- ============================================================
-- Migration 015: Add lat/lng to work orders missing coordinates
-- Derives from project location with small offsets so pins
-- don't stack exactly on top of each other on the map.
-- ============================================================

-- WOs that have a project with coords: inherit project coords + offset
-- Use a CTE to compute row numbers (window functions can't be in SET directly)
WITH ranked AS (
  SELECT
    w.id,
    p.latitude  AS proj_lat,
    p.longitude AS proj_lng,
    (row_number() OVER (PARTITION BY w.project_id ORDER BY w.number))::int % 5 AS rn
  FROM work_orders w
  JOIN projects p ON p.id = w.project_id
  WHERE w.latitude  IS NULL
    AND p.latitude  IS NOT NULL
    AND w.deleted_at IS NULL
)
UPDATE work_orders w
SET
  latitude  = r.proj_lat  + CASE r.rn
    WHEN 0 THEN  0.0008 WHEN 1 THEN -0.0005 WHEN 2 THEN  0.0003
    WHEN 3 THEN -0.0009 ELSE 0.0006 END,
  longitude = r.proj_lng + CASE r.rn
    WHEN 0 THEN  0.0009 WHEN 1 THEN -0.0006 WHEN 2 THEN  0.0004
    WHEN 3 THEN  0.0011 ELSE -0.0007 END
FROM ranked r
WHERE w.id = r.id;

-- WOs with no project or project without coords: explicit coords
UPDATE work_orders SET latitude = 18.3748, longitude = -66.1138
WHERE number = 'WO-2026-0109' AND deleted_at IS NULL;  -- Graffiti, municipal buildings (town center)

UPDATE work_orders SET latitude = 18.3582, longitude = -66.1010
WHERE number = 'WO-2026-0204' AND deleted_at IS NULL;  -- Catch basin, Camarones drainage area

UPDATE work_orders SET latitude = 18.3198, longitude = -66.1455
WHERE number = 'WO-2026-0211' AND deleted_at IS NULL;  -- Community center, Sonadora area
