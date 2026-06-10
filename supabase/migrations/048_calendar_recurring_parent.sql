-- Add parent_event_id to calendar_events for recurring series tracking.
-- Parent events: recurrence_rule IS NOT NULL, parent_event_id IS NULL
-- Instance events: parent_event_id points to the parent, recurrence_rule IS NULL

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS parent_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_calendar_events_parent ON calendar_events(parent_event_id)
  WHERE parent_event_id IS NOT NULL;
