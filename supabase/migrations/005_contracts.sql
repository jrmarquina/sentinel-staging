-- ============================================================
-- Migration 005: Contract Management
-- Lifecycle management + bid management (Guaynabo Phase 1)
-- ============================================================

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE contract_status AS ENUM (
  'draft',
  'pending_approval',
  'active',
  'completed',
  'terminated',
  'expired'
);

CREATE TYPE bid_type AS ENUM (
  'informal_quote',
  'sealed_bid'
);

CREATE TYPE bid_status AS ENUM (
  'pending',
  'under_review',
  'accepted',
  'rejected',
  'withdrawn'
);

-- ─── Auto-number sequence ─────────────────────────────────────────────────────

CREATE SEQUENCE contract_number_seq START 1;

-- ─── contracts ────────────────────────────────────────────────────────────────

CREATE TABLE contracts (
  id                   UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id               UUID          NOT NULL REFERENCES organizations(id),
  number               TEXT          NOT NULL UNIQUE,          -- CT-2026-0001
  title                TEXT          NOT NULL,
  description          TEXT,
  status               contract_status NOT NULL DEFAULT 'draft',
  vendor_name          TEXT,
  vendor_contact       TEXT,
  vendor_email         TEXT,
  contract_value       NUMERIC(14,2),
  start_date           DATE,
  end_date             DATE,
  signed_at            TIMESTAMPTZ,
  terminated_at        TIMESTAMPTZ,
  termination_reason   TEXT,
  notes                TEXT,
  created_by           UUID          NOT NULL REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_contracts_org_id  ON contracts(org_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_contracts_status  ON contracts(status)  WHERE deleted_at IS NULL;
CREATE INDEX idx_contracts_created ON contracts(created_at DESC) WHERE deleted_at IS NULL;

-- ─── Auto-generate contract number ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_contract_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.number := 'CT-' || to_char(NOW(), 'YYYY') || '-' ||
                LPAD(nextval('contract_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contract_number
  BEFORE INSERT ON contracts
  FOR EACH ROW
  WHEN (NEW.number IS NULL OR NEW.number = '')
  EXECUTE FUNCTION set_contract_number();

CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_contracts_audit
  AFTER INSERT OR UPDATE OR DELETE ON contracts
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

-- ─── contract_bids ────────────────────────────────────────────────────────────

CREATE TABLE contract_bids (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id         UUID        NOT NULL REFERENCES organizations(id),
  contract_id    UUID        NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  bid_type       bid_type    NOT NULL DEFAULT 'informal_quote',
  vendor_name    TEXT        NOT NULL,
  vendor_contact TEXT,
  vendor_email   TEXT,
  amount         NUMERIC(14,2),
  notes          TEXT,
  status         bid_status  NOT NULL DEFAULT 'pending',
  submitted_at   DATE,
  reviewed_at    TIMESTAMPTZ,
  reviewed_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by     UUID        NOT NULL REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

ALTER TABLE contract_bids ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_contract_bids_contract ON contract_bids(contract_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contract_bids_org_id   ON contract_bids(org_id)      WHERE deleted_at IS NULL;

CREATE TRIGGER trg_contract_bids_updated_at
  BEFORE UPDATE ON contract_bids
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_contract_bids_audit
  AFTER INSERT OR UPDATE OR DELETE ON contract_bids
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

-- ─── RLS — contracts ──────────────────────────────────────────────────────────

CREATE POLICY "contracts_select_org" ON contracts
  FOR SELECT USING (
    org_id = current_user_org() AND deleted_at IS NULL
  );

CREATE POLICY "contracts_insert_manage_roles" ON contracts
  FOR INSERT WITH CHECK (
    org_id = current_user_org()
    AND current_user_role() IN ('admin', 'supervisor')
  );

CREATE POLICY "contracts_update_manage_roles" ON contracts
  FOR UPDATE USING (
    org_id = current_user_org()
    AND current_user_role() IN ('admin', 'supervisor')
  );

CREATE POLICY "contracts_delete_admin" ON contracts
  FOR UPDATE USING (
    org_id = current_user_org()
    AND current_user_role() = 'admin'
  );

-- ─── RLS — contract_bids ──────────────────────────────────────────────────────

CREATE POLICY "contract_bids_select_org" ON contract_bids
  FOR SELECT USING (
    org_id = current_user_org() AND deleted_at IS NULL
  );

CREATE POLICY "contract_bids_insert_manage_roles" ON contract_bids
  FOR INSERT WITH CHECK (
    org_id = current_user_org()
    AND current_user_role() IN ('admin', 'supervisor')
  );

CREATE POLICY "contract_bids_update_manage_roles" ON contract_bids
  FOR UPDATE USING (
    org_id = current_user_org()
    AND current_user_role() IN ('admin', 'supervisor')
  );

CREATE POLICY "contract_bids_delete_admin" ON contract_bids
  FOR UPDATE USING (
    org_id = current_user_org()
    AND current_user_role() = 'admin'
  );
