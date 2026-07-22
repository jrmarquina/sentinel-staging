-- =============================================================
-- Migration 052: Audit triggers + RLS for mobile-asset tables
--
-- · Attaches the shared write_audit_log() trigger to fm_assets
--   (previously unaudited), fm_custodians, fm_spaces, and the
--   movements ledger — giving every object a low-level row-change
--   trail underneath the human-readable custody history.
-- · Adds capability-based RLS (per migration 026 conventions):
--     _manage  → org_admin / fm_manager  (the property supervisor)
--     _read    → any FM capability
--   The movements ledger is append-only at the RLS layer: INSERT +
--   SELECT only, no UPDATE/DELETE, so custody history cannot be
--   quietly rewritten. Writing a movement is restricted to
--   fm_manager+ (the client's single property supervisor).
-- =============================================================

-- ── 1. Audit triggers ────────────────────────────────────────
-- fm_assets was never wired to the audit trigger — do it now.
DROP TRIGGER IF EXISTS trg_fm_assets_audit ON fm_assets;
CREATE TRIGGER trg_fm_assets_audit
  AFTER INSERT OR UPDATE OR DELETE ON fm_assets
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

DROP TRIGGER IF EXISTS trg_fm_custodians_audit ON fm_custodians;
CREATE TRIGGER trg_fm_custodians_audit
  AFTER INSERT OR UPDATE OR DELETE ON fm_custodians
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

DROP TRIGGER IF EXISTS trg_fm_spaces_audit ON fm_spaces;
CREATE TRIGGER trg_fm_spaces_audit
  AFTER INSERT OR UPDATE OR DELETE ON fm_spaces
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

DROP TRIGGER IF EXISTS trg_fm_movements_audit ON fm_asset_movements;
CREATE TRIGGER trg_fm_movements_audit
  AFTER INSERT OR UPDATE OR DELETE ON fm_asset_movements
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();


-- ── 2. RLS: fm_custodians ────────────────────────────────────
CREATE POLICY "fm_custodians_manage" ON fm_custodians
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_custodians_read" ON fm_custodians
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );


-- ── 3. RLS: fm_spaces ────────────────────────────────────────
CREATE POLICY "fm_spaces_manage" ON fm_spaces
  FOR ALL USING (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_spaces_read" ON fm_spaces
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );


-- ── 4. RLS: fm_asset_movements (append-only) ─────────────────
-- Only the property supervisor (fm_manager) or an org_admin may
-- record a movement. Everyone with FM access can read the ledger.
-- No UPDATE/DELETE policy exists → the ledger is immutable except
-- via the service role.
CREATE POLICY "fm_movements_insert" ON fm_asset_movements
  FOR INSERT WITH CHECK (
    org_id = current_org_id()
    AND current_fm_capability() IN ('org_admin', 'fm_manager')
  );

CREATE POLICY "fm_movements_read" ON fm_asset_movements
  FOR SELECT USING (
    org_id = current_org_id()
    AND current_fm_capability() IS NOT NULL
  );
