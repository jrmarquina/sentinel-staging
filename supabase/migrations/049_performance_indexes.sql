-- 049_performance_indexes.sql
-- Indexes for foreign-key columns on hot query paths that had none.
-- Found during 2026-06-11 staging performance audit: every RLS policy resolves
-- org/capability through user_roles(user_id), and several FM/PW joins scan
-- unindexed FK columns. All IF NOT EXISTS — safe to re-run.

-- RLS hot path: current_org_id() / get_capability() filter user_roles by user_id
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_definition_id ON user_roles(role_definition_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_department_id ON user_roles(department_id);

-- Org-scoped lookups
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org_id ON notifications(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);

-- FM joins (inspection detail, portfolio analytics, deficiency → WO lookups)
CREATE INDEX IF NOT EXISTS idx_fm_inspections_template_id ON fm_inspections(template_id);
CREATE INDEX IF NOT EXISTS idx_fm_inspections_asset_id ON fm_inspections(asset_id);
CREATE INDEX IF NOT EXISTS idx_fm_work_orders_inspection_id ON fm_work_orders(inspection_id);
CREATE INDEX IF NOT EXISTS idx_fm_work_orders_asset_id ON fm_work_orders(asset_id);
CREATE INDEX IF NOT EXISTS idx_fm_work_orders_checklist_item_id ON fm_work_orders(checklist_item_id);
CREATE INDEX IF NOT EXISTS idx_fm_schedules_template_id ON fm_schedules(template_id);

-- PW joins
CREATE INDEX IF NOT EXISTS idx_inspections_pothole_id ON inspections(pothole_id);
CREATE INDEX IF NOT EXISTS idx_pothole_reports_work_order_id ON pothole_reports(work_order_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project_id ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_inspection_checklist_items_org_id ON inspection_checklist_items(org_id);
