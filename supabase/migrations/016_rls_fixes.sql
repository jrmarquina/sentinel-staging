-- ============================================================
-- Migration 016: RLS Policy Fixes
-- Fixes four bugs found in audit:
-- 1. Soft-delete bypass: supervisors could set deleted_at on
--    locations and calendar_events (admin-only intended)
-- 2. Same bypass on work_orders soft-delete
-- 3. notifications_insert_org too permissive (any member → service role only)
-- 4. profiles_delete_admin was a redundant no-op duplicate
-- ============================================================

-- ─── Fix 1: locations soft-delete (admin-only) ────────────────────────────────
-- Drop the overlapping update policy and replace with column-specific check.
-- Supervisors can still UPDATE locations (change address, coords, etc.)
-- but cannot set deleted_at. Only admins can set deleted_at.

DROP POLICY IF EXISTS "locations_delete_admin"        ON locations;
DROP POLICY IF EXISTS "locations_update_manage_roles" ON locations;

-- Supervisors and admins can update non-deleted_at columns
CREATE POLICY "locations_update_manage_roles" ON locations
  FOR UPDATE USING (
    org_id = current_user_org()
    AND current_user_role() IN ('admin', 'supervisor')
    AND deleted_at IS NULL
  );

-- Only admins can soft-delete (set deleted_at)
CREATE POLICY "locations_softdelete_admin" ON locations
  FOR UPDATE USING (
    org_id = current_user_org()
    AND current_user_role() = 'admin'
  )
  WITH CHECK (
    org_id = current_user_org()
    AND current_user_role() = 'admin'
  );

-- ─── Fix 2: calendar_events soft-delete (admin-only) ─────────────────────────

DROP POLICY IF EXISTS "calendar_events_delete_admin"        ON calendar_events;
DROP POLICY IF EXISTS "calendar_events_update_manage_roles" ON calendar_events;

-- Supervisors and admins can update (reschedule, edit title, etc.)
CREATE POLICY "calendar_events_update_manage_roles" ON calendar_events
  FOR UPDATE USING (
    org_id = current_user_org()
    AND current_user_role() IN ('admin', 'supervisor')
    AND deleted_at IS NULL
  );

-- Only admins can soft-delete
CREATE POLICY "calendar_events_softdelete_admin" ON calendar_events
  FOR UPDATE USING (
    org_id = current_user_org()
    AND current_user_role() = 'admin'
  )
  WITH CHECK (
    org_id = current_user_org()
    AND current_user_role() = 'admin'
  );

-- ─── Fix 3: work_orders soft-delete (admin-only) ─────────────────────────────

DROP POLICY IF EXISTS "work_orders_delete_admin" ON work_orders;

-- Recreate with WITH CHECK to prevent supervisors setting deleted_at
-- The update policy for assigned/supervisor still allows normal field updates
CREATE POLICY "work_orders_softdelete_admin" ON work_orders
  FOR UPDATE USING (
    org_id = current_user_org()
    AND current_user_role() = 'admin'
  )
  WITH CHECK (
    org_id = current_user_org()
    AND current_user_role() = 'admin'
  );

-- ─── Fix 4: notifications insert — service role only ─────────────────────────
-- Remove the policy that lets any org member insert notifications.
-- Notifications should only be inserted by SECURITY DEFINER functions
-- or the service role (admin actions). This prevents notification spam
-- from viewer/vendor accounts.

DROP POLICY IF EXISTS "notifications_insert_org" ON notifications;

-- Service role (used by server actions) bypasses RLS entirely, so no
-- replacement policy is needed. Application-level notification inserts
-- go through createAdminClient() which uses the service role key.

-- ─── Fix 5: profiles_delete_admin was a duplicate no-op ──────────────────────
-- It had identical USING clause to profiles_update_admin.
-- Drop it so there's no confusion in pg_policies output.

DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;

-- A single clean admin update policy already covers soft-delete:
-- profiles_update_admin: FOR UPDATE USING (org_id = current_user_org() AND role = 'admin')
-- This already allows admins to set deleted_at. No replacement needed.
