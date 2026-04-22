-- ============================================================
-- Migration 002: Foundation Tables
-- locations, attachments, calendar_events, notifications, audit_log
-- ============================================================

-- ─── event_type enum ──────────────────────────────────────────────────────────

CREATE TYPE event_type AS ENUM (
  'work_order',
  'inspection',
  'contract_milestone',
  'maintenance'
);

-- ─── locations ────────────────────────────────────────────────────────────────

CREATE TABLE locations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES organizations(id),
  name        TEXT,
  address     TEXT,
  geom        GEOGRAPHY(POINT, 4326),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_locations_org_id ON locations(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_locations_geom ON locations USING GIST(geom);

CREATE TRIGGER trg_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- PostGIS spatial helper function
CREATE OR REPLACE FUNCTION locations_within_radius(
  center_lat FLOAT,
  center_lng FLOAT,
  radius_meters INT
)
RETURNS SETOF locations AS $$
  SELECT * FROM locations
  WHERE ST_DWithin(
    geom::geography,
    ST_MakePoint(center_lng, center_lat)::geography,
    radius_meters
  )
  AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE;

-- ─── attachments ──────────────────────────────────────────────────────────────

CREATE TABLE attachments (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        UUID NOT NULL REFERENCES organizations(id),
  storage_path  TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_type     TEXT NOT NULL,
  file_size     BIGINT NOT NULL,
  related_id    UUID,
  related_table TEXT,
  uploaded_by   UUID NOT NULL REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_attachments_org_id ON attachments(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_attachments_related ON attachments(related_id, related_table) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_attachments_updated_at
  BEFORE UPDATE ON attachments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── calendar_events ──────────────────────────────────────────────────────────

CREATE TABLE calendar_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES organizations(id),
  title           TEXT NOT NULL,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ,
  event_type      event_type NOT NULL,
  related_id      UUID,
  related_table   TEXT,
  color           TEXT,
  all_day         BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule TEXT,   -- iCal RRULE string e.g. "FREQ=WEEKLY;BYDAY=MO"
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_calendar_events_org_id ON calendar_events(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_calendar_events_start_at ON calendar_events(start_at) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── notifications ────────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        UUID NOT NULL REFERENCES organizations(id),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT,
  read_at       TIMESTAMPTZ,
  related_id    UUID,
  related_table TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── audit_log ────────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES organizations(id),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,   -- 'INSERT', 'UPDATE', 'DELETE'
  table_name  TEXT NOT NULL,
  record_id   UUID NOT NULL,
  old_data    JSONB,
  new_data    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_audit_log_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_org_id ON audit_log(org_id, created_at DESC);

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION write_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  _org_id UUID;
  _record_id UUID;
  _old_data JSONB;
  _new_data JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _org_id := (OLD.org_id)::UUID;
    _record_id := (OLD.id)::UUID;
    _old_data := row_to_json(OLD)::JSONB;
    _new_data := NULL;
  ELSE
    _org_id := (NEW.org_id)::UUID;
    _record_id := (NEW.id)::UUID;
    _old_data := CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::JSONB ELSE NULL END;
    _new_data := row_to_json(NEW)::JSONB;
  END IF;

  INSERT INTO audit_log (org_id, user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    _org_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    _record_id,
    _old_data,
    _new_data
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
