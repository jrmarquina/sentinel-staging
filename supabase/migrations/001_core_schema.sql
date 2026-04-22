-- ============================================================
-- Migration 001: Core Schema
-- organizations → profiles → user_roles
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify PostGIS loaded correctly
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE EXCEPTION 'PostGIS extension is required but could not be loaded';
  END IF;
END $$;

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE app_role AS ENUM ('admin', 'supervisor', 'inspector', 'vendor', 'viewer');

-- ─── organizations ────────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Seed Guaynabo as org #1
INSERT INTO organizations (id, name, slug)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Municipality of Guaynabo',
  'guaynabo'
);

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- One row per auth.users row — created via trigger on signup/invite

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id),
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ─── user_roles ───────────────────────────────────────────────────────────────

CREATE TABLE user_roles (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES organizations(id),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        app_role NOT NULL DEFAULT 'viewer',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_roles_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Auto-create profile on new user ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _org_id UUID;
BEGIN
  -- Read org_id from user metadata (set during invite flow)
  _org_id := (NEW.raw_user_meta_data->>'org_id')::UUID;

  IF _org_id IS NULL THEN
    -- Default to Guaynabo for now — update when multi-tenant invite flow is built
    _org_id := '00000000-0000-0000-0000-000000000001';
  END IF;

  -- Schema-qualified to work regardless of search_path (auth runs with restricted path)
  INSERT INTO public.profiles (id, org_id, full_name)
  VALUES (
    NEW.id,
    _org_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
