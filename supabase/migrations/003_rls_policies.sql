-- ============================================================
-- Migration 003: Row Level Security Policies
-- Five-role pattern applied to all tables
-- ============================================================

-- ─── Helper: get current user's role in their org ─────────────────────────────

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS app_role AS $$
  SELECT role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_org()
RETURNS UUID AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── organizations ────────────────────────────────────────────────────────────

CREATE POLICY "org_select_own" ON organizations
  FOR SELECT USING (
    id = current_user_org()
  );

CREATE POLICY "org_update_admin" ON organizations
  FOR UPDATE USING (
    id = current_user_org() AND current_user_role() = 'admin'
  );

-- ─── profiles ─────────────────────────────────────────────────────────────────

-- Everyone can view profiles in their org
CREATE POLICY "profiles_select_org" ON profiles
  FOR SELECT USING (
    org_id = current_user_org() AND deleted_at IS NULL
  );

-- Users can update their own profile
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Admins can update any profile in their org
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (
    org_id = current_user_org() AND current_user_role() = 'admin'
  );

-- Admins can soft-delete profiles
CREATE POLICY "profiles_delete_admin" ON profiles
  FOR UPDATE USING (
    org_id = current_user_org() AND current_user_role() = 'admin'
  );

-- ─── user_roles ───────────────────────────────────────────────────────────────

-- Admins can manage roles
CREATE POLICY "user_roles_select_org" ON user_roles
  FOR SELECT USING (org_id = current_user_org());

CREATE POLICY "user_roles_insert_admin" ON user_roles
  FOR INSERT WITH CHECK (
    org_id = current_user_org() AND current_user_role() = 'admin'
  );

CREATE POLICY "user_roles_update_admin" ON user_roles
  FOR UPDATE USING (
    org_id = current_user_org() AND current_user_role() = 'admin'
  );

CREATE POLICY "user_roles_delete_admin" ON user_roles
  FOR DELETE USING (
    org_id = current_user_org() AND current_user_role() = 'admin'
  );

-- ─── locations ────────────────────────────────────────────────────────────────

-- Everyone in org can read locations
CREATE POLICY "locations_select_org" ON locations
  FOR SELECT USING (
    org_id = current_user_org() AND deleted_at IS NULL
  );

-- Inspectors, supervisors, admins can insert
CREATE POLICY "locations_insert_write_roles" ON locations
  FOR INSERT WITH CHECK (
    org_id = current_user_org()
    AND current_user_role() IN ('admin', 'supervisor', 'inspector')
  );

-- Supervisors and admins can update
CREATE POLICY "locations_update_manage_roles" ON locations
  FOR UPDATE USING (
    org_id = current_user_org()
    AND current_user_role() IN ('admin', 'supervisor')
  );

-- Only admins can soft-delete
CREATE POLICY "locations_delete_admin" ON locations
  FOR UPDATE USING (
    org_id = current_user_org() AND current_user_role() = 'admin'
  );

-- ─── attachments ──────────────────────────────────────────────────────────────

CREATE POLICY "attachments_select_org" ON attachments
  FOR SELECT USING (
    org_id = current_user_org() AND deleted_at IS NULL
  );

CREATE POLICY "attachments_insert_write_roles" ON attachments
  FOR INSERT WITH CHECK (
    org_id = current_user_org()
    AND current_user_role() IN ('admin', 'supervisor', 'inspector')
  );

CREATE POLICY "attachments_delete_own_or_admin" ON attachments
  FOR UPDATE USING (
    org_id = current_user_org()
    AND (uploaded_by = auth.uid() OR current_user_role() = 'admin')
  );

-- ─── calendar_events ──────────────────────────────────────────────────────────

CREATE POLICY "calendar_events_select_org" ON calendar_events
  FOR SELECT USING (
    org_id = current_user_org() AND deleted_at IS NULL
  );

CREATE POLICY "calendar_events_insert_write_roles" ON calendar_events
  FOR INSERT WITH CHECK (
    org_id = current_user_org()
    AND current_user_role() IN ('admin', 'supervisor', 'inspector')
  );

-- Only supervisors and admins can reschedule (drag-to-reschedule)
CREATE POLICY "calendar_events_update_manage_roles" ON calendar_events
  FOR UPDATE USING (
    org_id = current_user_org()
    AND current_user_role() IN ('admin', 'supervisor')
  );

CREATE POLICY "calendar_events_delete_admin" ON calendar_events
  FOR UPDATE USING (
    org_id = current_user_org() AND current_user_role() = 'admin'
  );

-- ─── notifications ────────────────────────────────────────────────────────────

-- Users see only their own notifications
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (user_id = auth.uid());

-- Mark as read (own only)
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Admins and system (service role) can insert for any user in org
CREATE POLICY "notifications_insert_org" ON notifications
  FOR INSERT WITH CHECK (org_id = current_user_org());

-- ─── audit_log ────────────────────────────────────────────────────────────────

-- Admins can read audit log for their org
CREATE POLICY "audit_log_select_admin" ON audit_log
  FOR SELECT USING (
    org_id = current_user_org() AND current_user_role() = 'admin'
  );

-- Only system triggers insert (via SECURITY DEFINER function)
-- No direct INSERT policy — inserts go through write_audit_log() trigger
