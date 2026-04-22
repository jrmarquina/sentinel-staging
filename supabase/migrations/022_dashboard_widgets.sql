-- =============================================================
-- Migration 022: Dashboard Widget Layout System
--
-- Implements per-user, per-module dashboard widget configuration.
-- Widgets can be shown/hidden, repositioned, and resized.
-- Configuration is stored as JSONB so new widgets can be added
-- without schema changes.
--
-- Design goals:
--   · Each user has one layout per module (pw / fm / shared)
--   · Layout is a JSONB array of widget descriptor objects
--   · Unauthenticated fallback: default layouts are defined in
--     application code; this table only stores user overrides
--   · Role-aware defaults are enforced at the API layer, not here
--
-- Widget descriptor shape (stored inside the widgets JSONB array):
--   {
--     "id":       "work_order_feed",   -- unique widget identifier
--     "visible":  true,
--     "col":      0,                   -- grid column (0-based)
--     "row":      0,                   -- grid row    (0-based)
--     "col_span": 2,                   -- column span (default 1)
--     "row_span": 1                    -- row span    (default 1)
--   }
--
-- Known widget IDs (extend as modules are built):
--   PW module:  map_overview, work_order_feed, pothole_stats,
--               incident_summary, calendar_preview, team_status
--   FM module:  fm_portfolio_map, fm_work_order_feed,
--               fm_inspection_stats, fm_asset_health,
--               fm_compliance_rate, fm_recent_reports
--   Shared:     notification_bell_summary, quick_actions,
--               weather_widget (future), analytics_snapshot
-- =============================================================


-- ── 1. DASHBOARD_LAYOUTS TABLE ───────────────────────────────
CREATE TABLE dashboard_layouts (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id     UUID        NOT NULL REFERENCES organizations(id),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module     TEXT        NOT NULL CHECK (module IN ('pw', 'fm', 'shared')),
  -- Array of widget descriptor objects (see shape above)
  widgets    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- One layout row per (user, module) pair
  UNIQUE (user_id, module)
);

ALTER TABLE dashboard_layouts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_dashboard_layouts_updated_at
  BEFORE UPDATE ON dashboard_layouts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Indexes
CREATE INDEX idx_dashboard_layouts_org_id  ON dashboard_layouts(org_id);
CREATE INDEX idx_dashboard_layouts_user_id ON dashboard_layouts(user_id);

-- ── RLS Policies ─────────────────────────────────────────────
-- Users can only read and write their own layout rows.
-- Admins can read all layouts within their org (for support/audit).

-- Users: read own layout
CREATE POLICY "users_read_own_layout"
  ON dashboard_layouts FOR SELECT
  USING (user_id = auth.uid());

-- Users: insert own layout
CREATE POLICY "users_insert_own_layout"
  ON dashboard_layouts FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

-- Users: update own layout
CREATE POLICY "users_update_own_layout"
  ON dashboard_layouts FOR UPDATE
  USING (user_id = auth.uid());

-- Users: delete own layout (reset to default)
CREATE POLICY "users_delete_own_layout"
  ON dashboard_layouts FOR DELETE
  USING (user_id = auth.uid());

-- Admins: read all layouts in org (for support tooling)
CREATE POLICY "admin_read_org_layouts"
  ON dashboard_layouts FOR SELECT
  USING (
    org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin'
  );


-- ── 2. WIDGET_DEFINITIONS TABLE ──────────────────────────────
-- Registry of all known widgets. Used by the UI to render the
-- "Customize Dashboard" panel and validate widget IDs in JSONB.
-- Seeded below; add rows as new widgets are built.

CREATE TABLE widget_definitions (
  id            TEXT        PRIMARY KEY,           -- e.g. "work_order_feed"
  module        TEXT        NOT NULL CHECK (module IN ('pw', 'fm', 'shared')),
  label         TEXT        NOT NULL,              -- Display name
  description   TEXT,                              -- Short helper text
  default_col   INT         NOT NULL DEFAULT 0,
  default_row   INT         NOT NULL DEFAULT 0,
  default_col_span INT      NOT NULL DEFAULT 1,
  default_row_span INT      NOT NULL DEFAULT 1,
  min_role      TEXT        NOT NULL DEFAULT 'viewer'
                            CHECK (min_role IN ('admin','supervisor','inspector','vendor','viewer')),
  -- Whether this widget is visible by default for new users
  default_visible BOOLEAN   NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- widget_definitions is a read-only reference table; no RLS needed.
-- All authenticated users in any org may read it.
ALTER TABLE widget_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_widget_definitions"
  ON widget_definitions FOR SELECT
  TO authenticated
  USING (true);


-- ── 3. SEED WIDGET_DEFINITIONS ───────────────────────────────

-- PW (Public Works) widgets
INSERT INTO widget_definitions
  (id, module, label, description, default_col, default_row, default_col_span, default_row_span, min_role, default_visible)
VALUES
  ('map_overview',      'pw', 'Map Overview',
   'Full portfolio map showing all active work sites',
   0, 0, 2, 2, 'viewer', true),

  ('work_order_feed',   'pw', 'Work Order Feed',
   'Live feed of open and overdue work orders',
   2, 0, 2, 1, 'viewer', true),

  ('pothole_stats',     'pw', 'Pothole & Road Damage',
   'Count and status of reported road damage incidents',
   2, 1, 1, 1, 'viewer', true),

  ('incident_summary',  'pw', 'Incident Summary',
   'Recent municipal property damage incidents',
   3, 1, 1, 1, 'viewer', true),

  ('calendar_preview',  'pw', 'Upcoming Events',
   'Next 7 days from the shared calendar',
   0, 2, 2, 1, 'viewer', true),

  ('team_status',       'pw', 'Team Status',
   'Active inspectors and supervisors (admin/supervisor only)',
   2, 2, 2, 1, 'supervisor', false);

-- FM (Facilities Management) widgets
INSERT INTO widget_definitions
  (id, module, label, description, default_col, default_row, default_col_span, default_row_span, min_role, default_visible)
VALUES
  ('fm_portfolio_map',    'fm', 'Portfolio Map',
   'All managed properties plotted on the map',
   0, 0, 2, 2, 'viewer', true),

  ('fm_work_order_feed',  'fm', 'FM Work Order Feed',
   'Open and overdue FM maintenance work orders',
   2, 0, 2, 1, 'viewer', true),

  ('fm_inspection_stats', 'fm', 'Inspection Stats',
   'Completion rate and upcoming inspections',
   2, 1, 1, 1, 'viewer', true),

  ('fm_asset_health',     'fm', 'Asset Health',
   'GOOD / FAIR / POOR breakdown across portfolio',
   3, 1, 1, 1, 'viewer', true),

  ('fm_compliance_rate',  'fm', 'Compliance Rate',
   'Average inspection score (0-100) across all properties',
   0, 2, 1, 1, 'viewer', true),

  ('fm_recent_reports',   'fm', 'Recent Reports',
   'Last 5 generated PDF inspection reports',
   1, 2, 3, 1, 'inspector', true);

-- Shared widgets (appear on both PW and FM dashboards)
INSERT INTO widget_definitions
  (id, module, label, description, default_col, default_row, default_col_span, default_row_span, min_role, default_visible)
VALUES
  ('quick_actions',          'shared', 'Quick Actions',
   'Shortcuts: new work order, start inspection, upload photo',
   0, 3, 2, 1, 'inspector', true),

  ('analytics_snapshot',     'shared', 'Analytics Snapshot',
   'Key KPIs for the current month',
   2, 3, 2, 1, 'supervisor', false),

  ('notification_summary',   'shared', 'Notification Summary',
   'Unread notifications and recent alerts',
   0, 4, 4, 1, 'viewer', true);


-- ── 4. HELPER RPC: upsert_dashboard_layout ───────────────────
-- Called from the frontend to save a user's full widget layout
-- for a given module in a single round trip.
-- Usage: SELECT upsert_dashboard_layout('fm', '[{...}]'::jsonb);

CREATE OR REPLACE FUNCTION upsert_dashboard_layout(
  p_module  TEXT,
  p_widgets JSONB
)
RETURNS dashboard_layouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id  UUID;
  v_row     dashboard_layouts;
BEGIN
  -- Validate module
  IF p_module NOT IN ('pw', 'fm', 'shared') THEN
    RAISE EXCEPTION 'Invalid module: %', p_module;
  END IF;

  -- Resolve caller's org
  SELECT org_id INTO v_org_id FROM profiles WHERE id = v_user_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No profile found for authenticated user';
  END IF;

  INSERT INTO dashboard_layouts (user_id, org_id, module, widgets)
  VALUES (v_user_id, v_org_id, p_module, p_widgets)
  ON CONFLICT (user_id, module) DO UPDATE
    SET widgets    = EXCLUDED.widgets,
        updated_at = NOW()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION upsert_dashboard_layout(TEXT, JSONB) TO authenticated;


-- ── 5. HELPER RPC: get_default_layout ────────────────────────
-- Returns the default widget list for a module, respecting the
-- caller's role (hides widgets above their min_role threshold).
-- The frontend calls this when a user has no saved layout yet.

CREATE OR REPLACE FUNCTION get_default_layout(p_module TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH role_order(role, rank) AS (
    VALUES
      ('viewer',     1),
      ('vendor',     2),
      ('inspector',  3),
      ('supervisor', 4),
      ('admin',      5)
  ),
  caller_role AS (
    SELECT COALESCE(ur.role::TEXT, 'viewer') AS role
    FROM auth.users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = auth.uid()
    LIMIT 1
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',        wd.id,
      'visible',   wd.default_visible,
      'col',       wd.default_col,
      'row',       wd.default_row,
      'col_span',  wd.default_col_span,
      'row_span',  wd.default_row_span
    )
    ORDER BY wd.default_row, wd.default_col
  )
  FROM widget_definitions wd
  JOIN role_order wr ON wr.role = wd.min_role
  JOIN role_order cr ON cr.role = (SELECT role FROM caller_role)
  WHERE (wd.module = p_module OR wd.module = 'shared')
    AND cr.rank >= wr.rank;
$$;

GRANT EXECUTE ON FUNCTION get_default_layout(TEXT) TO authenticated;
