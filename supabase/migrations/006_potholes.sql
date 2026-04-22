-- ============================================================
-- Migration 006: Pothole & Road Damage Tracking
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE pothole_status AS ENUM (
  'reported',
  'verified',
  'assigned',
  'in_repair',
  'repaired',
  'closed',
  'recurring'
);

CREATE TYPE surface_defect_type AS ENUM (
  'pothole',
  'alligator_crack',
  'linear_crack',
  'edge_failure',
  'subsidence',
  'rutting',
  'surface_deterioration'
);

-- ── Number sequence ───────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS pothole_number_seq
  START 1
  INCREMENT 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

-- ── pothole_reports table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS pothole_reports (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number            TEXT        NOT NULL,

  -- Description
  title             TEXT        NOT NULL,
  description       TEXT,
  defect_type       surface_defect_type NOT NULL DEFAULT 'pothole',
  status            pothole_status NOT NULL DEFAULT 'reported',
  severity          work_order_severity NOT NULL DEFAULT 'medium',

  -- PCI: Pavement Condition Index 0 (failed) – 100 (perfect)
  pci_score         SMALLINT    CHECK (pci_score BETWEEN 0 AND 100),

  -- Location
  address           TEXT,
  latitude          NUMERIC(10, 7),
  longitude         NUMERIC(10, 7),

  -- Assignment
  assigned_to       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Linked work order (repair job)
  work_order_id     UUID        REFERENCES work_orders(id) ON DELETE SET NULL,

  -- Photos stored in attachments table; these point to the canonical before/after
  before_photo_id   UUID        REFERENCES attachments(id) ON DELETE SET NULL,
  after_photo_id    UUID        REFERENCES attachments(id) ON DELETE SET NULL,

  -- Recurrence tracking
  is_recurring      BOOLEAN     NOT NULL DEFAULT FALSE,
  recurrence_count  SMALLINT    NOT NULL DEFAULT 0,

  -- Cost
  repair_cost       NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- Timestamps
  repaired_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- Unique number per org
CREATE UNIQUE INDEX pothole_reports_org_number_idx
  ON pothole_reports (org_id, number)
  WHERE deleted_at IS NULL;

-- Geo lookup index
CREATE INDEX pothole_reports_latlon_idx
  ON pothole_reports (org_id, latitude, longitude)
  WHERE deleted_at IS NULL;

-- Recurring flag index for priority queue
CREATE INDEX pothole_reports_recurring_idx
  ON pothole_reports (org_id, is_recurring, pci_score)
  WHERE deleted_at IS NULL;

-- ── Auto-number trigger ───────────────────────────────────────

CREATE OR REPLACE FUNCTION set_pothole_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.number := 'PH-' || to_char(NOW(), 'YYYY') || '-' ||
                LPAD(nextval('pothole_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pothole_number
  BEFORE INSERT ON pothole_reports
  FOR EACH ROW
  WHEN (NEW.number IS NULL OR NEW.number = '')
  EXECUTE FUNCTION set_pothole_number();

-- ── updated_at trigger ────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_pothole_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pothole_updated_at
  BEFORE UPDATE ON pothole_reports
  FOR EACH ROW
  EXECUTE FUNCTION touch_pothole_updated_at();

-- ── Recurring-location detection function ────────────────────
-- Call after a repair is closed. If another report exists within
-- ~50m radius for this org within the past 2 years, flag both as recurring.

CREATE OR REPLACE FUNCTION flag_recurring_potholes(
  p_id   UUID,
  p_lat  NUMERIC,
  p_lon  NUMERIC,
  p_org  UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  nearby_count INT;
BEGIN
  -- Count nearby reports (within ~50m, last 2 years, same org, not this record)
  SELECT COUNT(*) INTO nearby_count
  FROM pothole_reports
  WHERE org_id        = p_org
    AND id           != p_id
    AND deleted_at   IS NULL
    AND created_at   >= NOW() - INTERVAL '2 years'
    AND latitude  BETWEEN p_lat - 0.0005 AND p_lat + 0.0005
    AND longitude BETWEEN p_lon - 0.0005 AND p_lon + 0.0005;

  IF nearby_count > 0 THEN
    -- Mark this report and nearby ones as recurring
    UPDATE pothole_reports
    SET    is_recurring     = TRUE,
           recurrence_count = recurrence_count + 1
    WHERE  org_id   = p_org
      AND  deleted_at IS NULL
      AND  (id = p_id OR (
             latitude  BETWEEN p_lat - 0.0005 AND p_lat + 0.0005
         AND longitude BETWEEN p_lon - 0.0005 AND p_lon + 0.0005
         AND created_at >= NOW() - INTERVAL '2 years'
      ));
  END IF;
END;
$$;

-- ── Resurfacing priority view ────────────────────────────────
-- Score = (100 - pci_score) + severity_weight + (recurrence_count * 10)
-- Higher score = higher priority for resurfacing

CREATE OR REPLACE VIEW pothole_resurfacing_queue AS
SELECT
  p.*,
  (
    COALESCE(100 - p.pci_score, 50)          -- PCI component (default 50 if unscored)
    + CASE p.severity
        WHEN 'critical' THEN 40
        WHEN 'high'     THEN 25
        WHEN 'medium'   THEN 10
        WHEN 'low'      THEN 0
        ELSE 0
      END
    + (p.recurrence_count * 10)              -- Recurrence penalty
    + CASE WHEN p.status = 'recurring' THEN 20 ELSE 0 END
  ) AS priority_score
FROM pothole_reports p
WHERE p.deleted_at IS NULL
  AND p.status NOT IN ('closed', 'repaired')
ORDER BY priority_score DESC;

-- ── Row-Level Security ────────────────────────────────────────

ALTER TABLE pothole_reports ENABLE ROW LEVEL SECURITY;

-- Select: org members
CREATE POLICY "pothole_reports_select" ON pothole_reports
  FOR SELECT USING (
    org_id = (
      SELECT org_id FROM user_roles
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- Insert: inspector, supervisor, admin (field staff can report)
CREATE POLICY "pothole_reports_insert" ON pothole_reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND org_id  = pothole_reports.org_id
        AND role IN ('admin', 'supervisor', 'inspector')
    )
  );

-- Update: assigned user OR supervisor/admin
CREATE POLICY "pothole_reports_update" ON pothole_reports
  FOR UPDATE USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND org_id  = pothole_reports.org_id
        AND role IN ('admin', 'supervisor')
    )
  );
