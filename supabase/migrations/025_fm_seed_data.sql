-- =============================================================
-- Migration 025: FM Module Seed Data — Municipio de Guaynabo, PR
--
-- Inserts realistic dummy data into the FM module tables for
-- development and QA testing.
--
-- Idempotent: checks for code = 'GBY-001' before inserting.
-- Safe to re-run: exits cleanly if data already exists.
--
-- Prerequisite: migration 021_fm_schema.sql must be applied.
-- The seed does NOT insert into auth.users — inspector_id and
-- approved_by_id on fm_inspections are left NULL intentionally
-- so the migration runs without a real auth user present.
--
-- Auto-trigger warning:
--   fm_checklist_auto_work_order fires on fm_checklist_item_responses
--   when result='fail' OR severity='HIGH'. Checklist responses in
--   this seed use result='pass' / severity='LOW'|'MEDIUM' to avoid
--   duplicate work orders. All work orders are inserted directly
--   into fm_work_orders.
-- =============================================================

DO $$
DECLARE
  -- ── Org ────────────────────────────────────────────────────
  v_org   UUID;

  -- ── Template ───────────────────────────────────────────────
  v_tmpl  UUID;

  -- ── Properties (p1–p8) ────────────────────────────────────
  v_p1    UUID;
  v_p2    UUID;
  v_p3    UUID;
  v_p4    UUID;
  v_p5    UUID;
  v_p6    UUID;
  v_p7    UUID;
  v_p8    UUID;

  -- ── Assets (a01–a24, three per property) ──────────────────
  v_a01   UUID; v_a02 UUID; v_a03 UUID;  -- GBY-001 assets
  v_a04   UUID; v_a05 UUID; v_a06 UUID;  -- GBY-002 assets
  v_a07   UUID; v_a08 UUID; v_a09 UUID;  -- GBY-003 assets
  v_a10   UUID; v_a11 UUID; v_a12 UUID;  -- GBY-004 assets
  v_a13   UUID; v_a14 UUID; v_a15 UUID;  -- GBY-005 assets
  v_a16   UUID; v_a17 UUID; v_a18 UUID;  -- GBY-006 assets
  v_a19   UUID; v_a20 UUID; v_a21 UUID;  -- GBY-007 assets
  v_a22   UUID; v_a23 UUID; v_a24 UUID;  -- GBY-008 assets

  -- ── Inspections (i1–i20) ──────────────────────────────────
  v_i1    UUID; v_i2  UUID; v_i3  UUID; v_i4  UUID; v_i5  UUID;
  v_i6    UUID; v_i7  UUID; v_i8  UUID; v_i9  UUID; v_i10 UUID;
  v_i11   UUID; v_i12 UUID; v_i13 UUID; v_i14 UUID; v_i15 UUID;
  v_i16   UUID; v_i17 UUID; v_i18 UUID; v_i19 UUID; v_i20 UUID;

BEGIN

  -- ── 1. Resolve org ──────────────────────────────────────────
  SELECT id INTO v_org FROM organizations ORDER BY created_at LIMIT 1;

  IF v_org IS NULL THEN
    RAISE NOTICE 'FM seed: no organization found — skipping.';
    RETURN;
  END IF;

  -- ── 2. Idempotency guard ────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM fm_properties WHERE org_id = v_org AND code = 'GBY-001'
  ) THEN
    RAISE NOTICE 'FM seed: data already present for org % — skipping.', v_org;
    RETURN;
  END IF;

  RAISE NOTICE 'FM seed: inserting data for org %', v_org;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 3. INSPECTION TEMPLATE
  --    "Facility Compliance Inspection" with 10 pass_fail fields.
  -- ──────────────────────────────────────────────────────────────────────────
  v_tmpl := gen_random_uuid();

  INSERT INTO fm_inspection_templates (id, org_id, name, description, json_schema)
  VALUES (
    v_tmpl,
    v_org,
    'Facility Compliance Inspection',
    'Standard 10-point compliance checklist for all municipal facilities in Guaynabo. '
    || 'Covers life-safety, structural, and operational requirements.',
    '{
      "fields": [
        {"id": "emergency_exits",  "label": "Emergency Exits",         "type": "pass_fail"},
        {"id": "fire_ext",         "label": "Fire Extinguishers",      "type": "pass_fail"},
        {"id": "electrical",       "label": "Electrical Systems",      "type": "pass_fail"},
        {"id": "hvac",             "label": "HVAC Systems",            "type": "pass_fail"},
        {"id": "water_systems",    "label": "Water & Plumbing Systems","type": "pass_fail"},
        {"id": "structural",       "label": "Structural Integrity",    "type": "pass_fail"},
        {"id": "signage",          "label": "Safety Signage",          "type": "pass_fail"},
        {"id": "accessibility",    "label": "ADA Accessibility",       "type": "pass_fail"},
        {"id": "security",         "label": "Security Systems",        "type": "pass_fail"},
        {"id": "cleanliness",      "label": "Cleanliness & Sanitation","type": "pass_fail"}
      ]
    }'::jsonb
  );

  -- ──────────────────────────────────────────────────────────────────────────
  -- 4. PROPERTIES (GBY-001 through GBY-008)
  --    All within Guaynabo bounding box: SW[-66.1197,18.3394] NE[-66.0519,18.4267]
  -- ──────────────────────────────────────────────────────────────────────────
  v_p1 := gen_random_uuid();
  v_p2 := gen_random_uuid();
  v_p3 := gen_random_uuid();
  v_p4 := gen_random_uuid();
  v_p5 := gen_random_uuid();
  v_p6 := gen_random_uuid();
  v_p7 := gen_random_uuid();
  v_p8 := gen_random_uuid();

  INSERT INTO fm_properties
    (id, org_id, name, code, address, city, region, status, latitude, longitude, risk_level)
  VALUES
    -- GBY-001: City Hall — seat of municipal government
    (v_p1, v_org, 'Alcaldía de Guaynabo',
     'GBY-001', 'Calle Arzuaga, Guaynabo Centro', 'Guaynabo', 'Guaynabo Norte',
     'ACTIVE', 18.3972, -66.0989, 'LOW'),

    -- GBY-002: Fire Station #1 — life-safety, medium risk due to equipment criticality
    (v_p2, v_org, 'Estación de Bomberos #1',
     'GBY-002', 'Calle Gautier Benítez #45, Guaynabo', 'Guaynabo', 'Guaynabo Centro',
     'ACTIVE', 18.3842, -66.0934, 'MEDIUM'),

    -- GBY-003: Community Health Center — medium risk, public health implications
    (v_p3, v_org, 'Centro de Salud Comunal',
     'GBY-003', 'Ave. Las Cumbres #120, Urb. El Plantío', 'Guaynabo', 'Guaynabo Sur',
     'ACTIVE', 18.3890, -66.1023, 'MEDIUM'),

    -- GBY-004: Villa Nueva Recreational Center — low risk, community use
    (v_p4, v_org, 'Centro Recreativo Villa Nueva',
     'GBY-004', 'Calle Villa Nueva, Urb. Villa Nueva', 'Guaynabo', 'Guaynabo Este',
     'ACTIVE', 18.3928, -66.0871, 'LOW'),

    -- GBY-005: Public Library — low risk, accessible public building
    (v_p5, v_org, 'Biblioteca Pública Municipal',
     'GBY-005', 'Calle Marginal, Centro Comercial Las Catalinas', 'Guaynabo', 'Guaynabo Norte',
     'ACTIVE', 18.4012, -66.0898, 'LOW'),

    -- GBY-006: Sports Complex — low risk, outdoor/indoor mixed use
    (v_p6, v_org, 'Complejo Deportivo Guaynabo',
     'GBY-006', 'Bo. Pueblo Nuevo, Complejo Deportivo Municipal', 'Guaynabo', 'Guaynabo Noroeste',
     'ACTIVE', 18.4105, -66.0823, 'LOW'),

    -- GBY-007: Municipal Market — INACTIVE, HIGH risk due to deferred maintenance
    (v_p7, v_org, 'Mercado Municipal',
     'GBY-007', 'Calle De Diego #8, Guaynabo Pueblo', 'Guaynabo', 'Guaynabo Centro',
     'INACTIVE', 18.3787, -66.0812, 'HIGH'),

    -- GBY-008: Caribe Community Center — active, medium risk
    (v_p8, v_org, 'Centro Comunitario Caribe',
     'GBY-008', 'Calle Caribe #33, Urb. Caribe', 'Guaynabo', 'Guaynabo Oeste',
     'ACTIVE', 18.4055, -66.1102, 'MEDIUM');

  -- ──────────────────────────────────────────────────────────────────────────
  -- 5. ASSETS (3 per property = 24 total)
  --    Codes: GBY-00X-A0Y  |  qr_token = UUID string for QR scanning
  --    Conditions: GOOD / FAIR / POOR (POOR concentrated in inactive GBY-007)
  -- ──────────────────────────────────────────────────────────────────────────
  v_a01 := gen_random_uuid(); v_a02 := gen_random_uuid(); v_a03 := gen_random_uuid();
  v_a04 := gen_random_uuid(); v_a05 := gen_random_uuid(); v_a06 := gen_random_uuid();
  v_a07 := gen_random_uuid(); v_a08 := gen_random_uuid(); v_a09 := gen_random_uuid();
  v_a10 := gen_random_uuid(); v_a11 := gen_random_uuid(); v_a12 := gen_random_uuid();
  v_a13 := gen_random_uuid(); v_a14 := gen_random_uuid(); v_a15 := gen_random_uuid();
  v_a16 := gen_random_uuid(); v_a17 := gen_random_uuid(); v_a18 := gen_random_uuid();
  v_a19 := gen_random_uuid(); v_a20 := gen_random_uuid(); v_a21 := gen_random_uuid();
  v_a22 := gen_random_uuid(); v_a23 := gen_random_uuid(); v_a24 := gen_random_uuid();

  INSERT INTO fm_assets
    (id, org_id, property_id, code, qr_token, name, category, location, condition,
     last_inspection, next_inspection, risk)
  VALUES
    -- ── GBY-001 Alcaldía ────────────────────────────────────
    (v_a01, v_org, v_p1, 'GBY-001-A01', 'qr-' || v_a01::text,
     'Central HVAC Unit', 'HVAC', 'Rooftop — Mechanical Room A',
     'GOOD', NOW() - INTERVAL '10 days', NOW() + INTERVAL '80 days', 'LOW'),

    (v_a02, v_org, v_p1, 'GBY-001-A02', 'qr-' || v_a02::text,
     'Main Electrical Panel', 'Electrical', 'Basement — Panel Room 1',
     'GOOD', NOW() - INTERVAL '10 days', NOW() + INTERVAL '80 days', 'LOW'),

    (v_a03, v_org, v_p1, 'GBY-001-A03', 'qr-' || v_a03::text,
     'Fire Suppression System', 'Fire Safety', 'Throughout building — all floors',
     'FAIR', NOW() - INTERVAL '10 days', NOW() + INTERVAL '80 days', 'MEDIUM'),

    -- ── GBY-002 Estación de Bomberos ────────────────────────
    (v_a04, v_org, v_p2, 'GBY-002-A01', 'qr-' || v_a04::text,
     'Apparatus Bay Ventilation', 'HVAC', 'Apparatus Bay — Ceiling Vents',
     'GOOD', NOW() - INTERVAL '8 days', NOW() + INTERVAL '82 days', 'LOW'),

    (v_a05, v_org, v_p2, 'GBY-002-A02', 'qr-' || v_a05::text,
     'Emergency Generator', 'Electrical', 'Side Yard — Generator Pad',
     'FAIR', NOW() - INTERVAL '8 days', NOW() + INTERVAL '82 days', 'MEDIUM'),

    (v_a06, v_org, v_p2, 'GBY-002-A03', 'qr-' || v_a06::text,
     'Standpipe & Hose Cabinet', 'Fire Safety', 'Second Floor — East Corridor',
     'GOOD', NOW() - INTERVAL '8 days', NOW() + INTERVAL '82 days', 'LOW'),

    -- ── GBY-003 Centro de Salud ──────────────────────────────
    (v_a07, v_org, v_p3, 'GBY-003-A01', 'qr-' || v_a07::text,
     'HVAC — Clinical Wing', 'HVAC', 'Rooftop — Unit C1',
     'GOOD', NOW() - INTERVAL '7 days', NOW() + INTERVAL '83 days', 'LOW'),

    (v_a08, v_org, v_p3, 'GBY-003-A02', 'qr-' || v_a08::text,
     'Medical Gas Plumbing', 'Plumbing', 'First Floor — Utility Corridor',
     'FAIR', NOW() - INTERVAL '7 days', NOW() + INTERVAL '83 days', 'MEDIUM'),

    (v_a09, v_org, v_p3, 'GBY-003-A03', 'qr-' || v_a09::text,
     'Exit Lighting & Signage', 'Fire Safety', 'All floors — stairwells',
     'GOOD', NOW() - INTERVAL '7 days', NOW() + INTERVAL '83 days', 'LOW'),

    -- ── GBY-004 Centro Recreativo Villa Nueva ────────────────
    (v_a10, v_org, v_p4, 'GBY-004-A01', 'qr-' || v_a10::text,
     'Split A/C Units (x4)', 'HVAC', 'Main Hall — Wall Mounts',
     'FAIR', NOW() - INTERVAL '5 days', NOW() + INTERVAL '85 days', 'LOW'),

    (v_a11, v_org, v_p4, 'GBY-004-A02', 'qr-' || v_a11::text,
     'Electrical Distribution Board', 'Electrical', 'Utility Closet — Room 104',
     'GOOD', NOW() - INTERVAL '5 days', NOW() + INTERVAL '85 days', 'LOW'),

    (v_a12, v_org, v_p4, 'GBY-004-A03', 'qr-' || v_a12::text,
     'Roof Structure — East Wing', 'Structural', 'East Wing Roof',
     'FAIR', NOW() - INTERVAL '5 days', NOW() + INTERVAL '85 days', 'MEDIUM'),

    -- ── GBY-005 Biblioteca Pública ───────────────────────────
    (v_a13, v_org, v_p5, 'GBY-005-A01', 'qr-' || v_a13::text,
     'Central Air Handler', 'HVAC', 'Rooftop — AHU-1',
     'GOOD', NOW() - INTERVAL '3 days', NOW() + INTERVAL '87 days', 'LOW'),

    (v_a14, v_org, v_p5, 'GBY-005-A02', 'qr-' || v_a14::text,
     'Wheelchair Lift', 'Mechanical', 'Main Entrance — North Side',
     'GOOD', NOW() - INTERVAL '3 days', NOW() + INTERVAL '87 days', 'LOW'),

    (v_a15, v_org, v_p5, 'GBY-005-A03', 'qr-' || v_a15::text,
     'Fire Alarm Control Panel', 'Fire Safety', 'Lobby — Wall Mount',
     'GOOD', NOW() - INTERVAL '3 days', NOW() + INTERVAL '87 days', 'LOW'),

    -- ── GBY-006 Complejo Deportivo ───────────────────────────
    (v_a16, v_org, v_p6, 'GBY-006-A01', 'qr-' || v_a16::text,
     'Pool Filtration System', 'Mechanical', 'Pool House — Equipment Room',
     'FAIR', NOW() - INTERVAL '1 day', NOW() + INTERVAL '89 days', 'MEDIUM'),

    (v_a17, v_org, v_p6, 'GBY-006-A02', 'qr-' || v_a17::text,
     'Stadium Lighting Array', 'Electrical', 'Field Perimeter — Poles 1-12',
     'GOOD', NOW() - INTERVAL '1 day', NOW() + INTERVAL '89 days', 'LOW'),

    (v_a18, v_org, v_p6, 'GBY-006-A03', 'qr-' || v_a18::text,
     'Grandstand Structural Frame', 'Structural', 'North Grandstand',
     'FAIR', NOW() - INTERVAL '1 day', NOW() + INTERVAL '89 days', 'MEDIUM'),

    -- ── GBY-007 Mercado Municipal (INACTIVE — poor conditions) ─
    (v_a19, v_org, v_p7, 'GBY-007-A01', 'qr-' || v_a19::text,
     'Roof Drainage System', 'Plumbing', 'Rooftop — Main Drain Array',
     'POOR', NOW() - INTERVAL '120 days', NULL, 'HIGH'),

    (v_a20, v_org, v_p7, 'GBY-007-A02', 'qr-' || v_a20::text,
     'Main Electrical Service', 'Electrical', 'Utility Room — Service Entrance',
     'POOR', NOW() - INTERVAL '120 days', NULL, 'HIGH'),

    (v_a21, v_org, v_p7, 'GBY-007-A03', 'qr-' || v_a21::text,
     'Load-Bearing Columns — Zone A', 'Structural', 'Ground Floor — Market Hall',
     'POOR', NOW() - INTERVAL '120 days', NULL, 'HIGH'),

    -- ── GBY-008 Centro Comunitario Caribe ────────────────────
    (v_a22, v_org, v_p8, 'GBY-008-A01', 'qr-' || v_a22::text,
     'Mini-Split HVAC System', 'HVAC', 'Community Hall — Ceiling Cassettes',
     'GOOD', NULL, NOW() + INTERVAL '9 days', 'LOW'),

    (v_a23, v_org, v_p8, 'GBY-008-A02', 'qr-' || v_a23::text,
     'Potable Water System', 'Plumbing', 'Mechanical Room — Ground Floor',
     'FAIR', NULL, NOW() + INTERVAL '9 days', 'MEDIUM'),

    (v_a24, v_org, v_p8, 'GBY-008-A03', 'qr-' || v_a24::text,
     'Security Camera Network', 'Electrical', 'All entry points',
     'GOOD', NULL, NOW() + INTERVAL '9 days', 'LOW');

  -- ──────────────────────────────────────────────────────────────────────────
  -- 6. INSPECTIONS (20 total)
  --    inspector_id / approved_by_id are NULL — no real auth users in seed.
  --    asset_id is NULL on most inspections (property-level inspections).
  -- ──────────────────────────────────────────────────────────────────────────
  v_i1  := gen_random_uuid(); v_i2  := gen_random_uuid(); v_i3  := gen_random_uuid();
  v_i4  := gen_random_uuid(); v_i5  := gen_random_uuid(); v_i6  := gen_random_uuid();
  v_i7  := gen_random_uuid(); v_i8  := gen_random_uuid(); v_i9  := gen_random_uuid();
  v_i10 := gen_random_uuid(); v_i11 := gen_random_uuid(); v_i12 := gen_random_uuid();
  v_i13 := gen_random_uuid(); v_i14 := gen_random_uuid(); v_i15 := gen_random_uuid();
  v_i16 := gen_random_uuid(); v_i17 := gen_random_uuid(); v_i18 := gen_random_uuid();
  v_i19 := gen_random_uuid(); v_i20 := gen_random_uuid();

  -- ── COMPLETED inspections (i1–i5) ─────────────────────────
  INSERT INTO fm_inspections
    (id, org_id, property_id, template_id, status, score,
     scheduled_for, started_at, completed_at)
  VALUES
    -- i1: Alcaldía — excellent score, 10 days ago
    (v_i1, v_org, v_p1, v_tmpl, 'COMPLETED', 92,
     NOW() - INTERVAL '11 days',
     NOW() - INTERVAL '10 days 2 hours',
     NOW() - INTERVAL '10 days'),

    -- i2: Bomberos — passing score, 8 days ago
    (v_i2, v_org, v_p2, v_tmpl, 'COMPLETED', 78,
     NOW() - INTERVAL '9 days',
     NOW() - INTERVAL '8 days 3 hours',
     NOW() - INTERVAL '8 days'),

    -- i3: Centro de Salud — good score, 7 days ago
    (v_i3, v_org, v_p3, v_tmpl, 'COMPLETED', 85,
     NOW() - INTERVAL '8 days',
     NOW() - INTERVAL '7 days 1 hour',
     NOW() - INTERVAL '7 days'),

    -- i4: Villa Nueva — borderline score (65), flagged issues, 5 days ago
    (v_i4, v_org, v_p4, v_tmpl, 'COMPLETED', 65,
     NOW() - INTERVAL '6 days',
     NOW() - INTERVAL '5 days 4 hours',
     NOW() - INTERVAL '5 days'),

    -- i5: Biblioteca — high score, 3 days ago
    (v_i5, v_org, v_p5, v_tmpl, 'COMPLETED', 91,
     NOW() - INTERVAL '4 days',
     NOW() - INTERVAL '3 days 1 hour',
     NOW() - INTERVAL '3 days');

  -- ── PENDING_APPROVAL inspections (i6–i8) ──────────────────
  INSERT INTO fm_inspections
    (id, org_id, property_id, template_id, status, score,
     scheduled_for, started_at, updated_at)
  VALUES
    -- i6: Complejo Deportivo — good score awaiting supervisor sign-off
    (v_i6, v_org, v_p6, v_tmpl, 'PENDING_APPROVAL', 88,
     NOW() - INTERVAL '2 days',
     NOW() - INTERVAL '1 day 3 hours',
     NOW() - INTERVAL '1 day'),

    -- i7: Mercado Municipal — low score, needs management review
    (v_i7, v_org, v_p7, v_tmpl, 'PENDING_APPROVAL', 72,
     NOW() - INTERVAL '3 days',
     NOW() - INTERVAL '2 days 5 hours',
     NOW() - INTERVAL '2 days'),

    -- i8: Alcaldía second inspection — critical score (56), urgent review
    (v_i8, v_org, v_p1, v_tmpl, 'PENDING_APPROVAL', 56,
     NOW() - INTERVAL '14 hours',
     NOW() - INTERVAL '13 hours',
     NOW() - INTERVAL '12 hours');

  -- ── IN_PROGRESS inspections (i9–i10) ──────────────────────
  INSERT INTO fm_inspections
    (id, org_id, property_id, template_id, status,
     scheduled_for, started_at)
  VALUES
    -- i9: Bomberos — inspector currently on site
    (v_i9, v_org, v_p2, v_tmpl, 'IN_PROGRESS',
     NOW() - INTERVAL '3 hours',
     NOW() - INTERVAL '2 hours'),

    -- i10: Centro de Salud — just started
    (v_i10, v_org, v_p3, v_tmpl, 'IN_PROGRESS',
     NOW() - INTERVAL '2 hours',
     NOW() - INTERVAL '1 hour');

  -- ── SCHEDULED inspections (i11–i19) ───────────────────────
  -- i11–i15 create calendar heatmap density at specific dates:
  --   NOW()+1day   → 1 inspection  (green — light load)
  --   NOW()+2days  → 2 inspections (yellow — moderate)
  --   NOW()+3days  → 2 inspections + 2 WOs due (red — heavy)
  --   NOW()+5days  → 1 inspection + 1 WO due
  --   NOW()+7days  → 1 inspection + 1 WO due
  --   NOW()+9days  → 1 inspection + 1 WO due (same day as i18)
  INSERT INTO fm_inspections
    (id, org_id, property_id, template_id, status, scheduled_for)
  VALUES
    -- i11: Alcaldía — 1 day out
    (v_i11, v_org, v_p1, v_tmpl, 'SCHEDULED', NOW() + INTERVAL '1 day'),

    -- i12 + i13: two inspections on same day → yellow heatmap
    (v_i12, v_org, v_p2, v_tmpl, 'SCHEDULED', NOW() + INTERVAL '2 days'),
    (v_i13, v_org, v_p3, v_tmpl, 'SCHEDULED', NOW() + INTERVAL '2 days'),

    -- i14 + i15: two inspections on same day as WOs → red heatmap
    (v_i14, v_org, v_p4, v_tmpl, 'SCHEDULED', NOW() + INTERVAL '3 days'),
    (v_i15, v_org, v_p5, v_tmpl, 'SCHEDULED', NOW() + INTERVAL '3 days'),

    -- i16: Complejo Deportivo — 5 days out
    (v_i16, v_org, v_p6, v_tmpl, 'SCHEDULED', NOW() + INTERVAL '5 days'),

    -- i17: Mercado Municipal — 7 days out (re-inspection after deferred fixes)
    (v_i17, v_org, v_p7, v_tmpl, 'SCHEDULED', NOW() + INTERVAL '7 days'),

    -- i18: Centro Comunitario Caribe — 9 days out (co-scheduled with WO)
    (v_i18, v_org, v_p8, v_tmpl, 'SCHEDULED', NOW() + INTERVAL '9 days'),

    -- i19: Alcaldía follow-up — 12 days out
    (v_i19, v_org, v_p1, v_tmpl, 'SCHEDULED', NOW() + INTERVAL '12 days');

  -- ── DRAFT inspection (i20) ────────────────────────────────
  INSERT INTO fm_inspections
    (id, org_id, property_id, template_id, status)
  VALUES
    -- i20: Centro Comunitario Caribe — draft not yet scheduled
    (v_i20, v_org, v_p8, v_tmpl, 'DRAFT');

  -- ──────────────────────────────────────────────────────────────────────────
  -- 7. CHECKLIST ITEM RESPONSES for COMPLETED inspections (i1–i5)
  --
  --    IMPORTANT: All responses here use result='pass' and severity='LOW' or
  --    'MEDIUM' to avoid triggering fm_checklist_auto_work_order.
  --    Scores are reflected by pass/fail counts (score was set directly above).
  --    A few items per inspection use result='pass' / severity='MEDIUM' to
  --    show notes without creating auto work orders. Work orders are inserted
  --    manually in the next section.
  -- ──────────────────────────────────────────────────────────────────────────

  -- i1: Alcaldía — score 92, all passing
  INSERT INTO fm_checklist_item_responses
    (org_id, inspection_id, key, label, result, severity, notes)
  VALUES
    (v_org, v_i1, 'emergency_exits', 'Emergency Exits',          'pass', 'LOW',    NULL),
    (v_org, v_i1, 'fire_ext',        'Fire Extinguishers',       'pass', 'LOW',    NULL),
    (v_org, v_i1, 'electrical',      'Electrical Systems',       'pass', 'LOW',    NULL),
    (v_org, v_i1, 'hvac',            'HVAC Systems',             'pass', 'LOW',    NULL),
    (v_org, v_i1, 'water_systems',   'Water & Plumbing Systems', 'pass', 'LOW',    NULL),
    (v_org, v_i1, 'structural',      'Structural Integrity',     'pass', 'LOW',    NULL),
    (v_org, v_i1, 'signage',         'Safety Signage',           'pass', 'LOW',    NULL),
    (v_org, v_i1, 'accessibility',   'ADA Accessibility',        'pass', 'LOW',    NULL),
    (v_org, v_i1, 'security',        'Security Systems',         'pass', 'MEDIUM', 'Front camera requires lens cleaning'),
    (v_org, v_i1, 'cleanliness',     'Cleanliness & Sanitation', 'pass', 'LOW',    NULL);

  -- i2: Bomberos — score 78, mostly passing with a few medium notes
  INSERT INTO fm_checklist_item_responses
    (org_id, inspection_id, key, label, result, severity, notes)
  VALUES
    (v_org, v_i2, 'emergency_exits', 'Emergency Exits',          'pass', 'LOW',    NULL),
    (v_org, v_i2, 'fire_ext',        'Fire Extinguishers',       'pass', 'LOW',    NULL),
    (v_org, v_i2, 'electrical',      'Electrical Systems',       'pass', 'MEDIUM', 'Generator output fluctuating — schedule service'),
    (v_org, v_i2, 'hvac',            'HVAC Systems',             'pass', 'LOW',    NULL),
    (v_org, v_i2, 'water_systems',   'Water & Plumbing Systems', 'pass', 'LOW',    NULL),
    (v_org, v_i2, 'structural',      'Structural Integrity',     'pass', 'LOW',    NULL),
    (v_org, v_i2, 'signage',         'Safety Signage',           'pass', 'LOW',    NULL),
    (v_org, v_i2, 'accessibility',   'ADA Accessibility',        'pass', 'MEDIUM', 'Ramp handrail loose on east entrance'),
    (v_org, v_i2, 'security',        'Security Systems',         'pass', 'LOW',    NULL),
    (v_org, v_i2, 'cleanliness',     'Cleanliness & Sanitation', 'pass', 'LOW',    NULL);

  -- i3: Centro de Salud — score 85, clean pass
  INSERT INTO fm_checklist_item_responses
    (org_id, inspection_id, key, label, result, severity, notes)
  VALUES
    (v_org, v_i3, 'emergency_exits', 'Emergency Exits',          'pass', 'LOW',    NULL),
    (v_org, v_i3, 'fire_ext',        'Fire Extinguishers',       'pass', 'LOW',    NULL),
    (v_org, v_i3, 'electrical',      'Electrical Systems',       'pass', 'LOW',    NULL),
    (v_org, v_i3, 'hvac',            'HVAC Systems',             'pass', 'LOW',    NULL),
    (v_org, v_i3, 'water_systems',   'Water & Plumbing Systems', 'pass', 'MEDIUM', 'Pressure slightly low in south wing — monitor'),
    (v_org, v_i3, 'structural',      'Structural Integrity',     'pass', 'LOW',    NULL),
    (v_org, v_i3, 'signage',         'Safety Signage',           'pass', 'LOW',    NULL),
    (v_org, v_i3, 'accessibility',   'ADA Accessibility',        'pass', 'LOW',    NULL),
    (v_org, v_i3, 'security',        'Security Systems',         'pass', 'LOW',    NULL),
    (v_org, v_i3, 'cleanliness',     'Cleanliness & Sanitation', 'pass', 'LOW',    NULL);

  -- i4: Villa Nueva — score 65, borderline; several medium observations
  INSERT INTO fm_checklist_item_responses
    (org_id, inspection_id, key, label, result, severity, notes)
  VALUES
    (v_org, v_i4, 'emergency_exits', 'Emergency Exits',          'pass', 'LOW',    NULL),
    (v_org, v_i4, 'fire_ext',        'Fire Extinguishers',       'pass', 'MEDIUM', 'Two extinguishers past inspection date — replace'),
    (v_org, v_i4, 'electrical',      'Electrical Systems',       'pass', 'MEDIUM', 'Panel labeling incomplete'),
    (v_org, v_i4, 'hvac',            'HVAC Systems',             'pass', 'MEDIUM', 'Filter replacement overdue on units 2 and 3'),
    (v_org, v_i4, 'water_systems',   'Water & Plumbing Systems', 'pass', 'LOW',    NULL),
    (v_org, v_i4, 'structural',      'Structural Integrity',     'pass', 'MEDIUM', 'Crack observed in east wall — monitor quarterly'),
    (v_org, v_i4, 'signage',         'Safety Signage',           'pass', 'LOW',    NULL),
    (v_org, v_i4, 'accessibility',   'ADA Accessibility',        'pass', 'MEDIUM', 'Accessible parking signage faded'),
    (v_org, v_i4, 'security',        'Security Systems',         'pass', 'LOW',    NULL),
    (v_org, v_i4, 'cleanliness',     'Cleanliness & Sanitation', 'pass', 'LOW',    NULL);

  -- i5: Biblioteca — score 91, near-perfect
  INSERT INTO fm_checklist_item_responses
    (org_id, inspection_id, key, label, result, severity, notes)
  VALUES
    (v_org, v_i5, 'emergency_exits', 'Emergency Exits',          'pass', 'LOW',    NULL),
    (v_org, v_i5, 'fire_ext',        'Fire Extinguishers',       'pass', 'LOW',    NULL),
    (v_org, v_i5, 'electrical',      'Electrical Systems',       'pass', 'LOW',    NULL),
    (v_org, v_i5, 'hvac',            'HVAC Systems',             'pass', 'LOW',    NULL),
    (v_org, v_i5, 'water_systems',   'Water & Plumbing Systems', 'pass', 'LOW',    NULL),
    (v_org, v_i5, 'structural',      'Structural Integrity',     'pass', 'LOW',    NULL),
    (v_org, v_i5, 'signage',         'Safety Signage',           'pass', 'LOW',    NULL),
    (v_org, v_i5, 'accessibility',   'ADA Accessibility',        'pass', 'LOW',    NULL),
    (v_org, v_i5, 'security',        'Security Systems',         'pass', 'MEDIUM', 'Exterior camera #3 offline — investigate'),
    (v_org, v_i5, 'cleanliness',     'Cleanliness & Sanitation', 'pass', 'LOW',    NULL);

  -- ──────────────────────────────────────────────────────────────────────────
  -- 8. WORK ORDERS (15 total)
  --
  --    Inserted directly to avoid triggering fm_checklist_auto_work_order.
  --    Mix of statuses and priorities, with intentional due-date density:
  --      NOW()+3days → 2 WOs (makes calendar red with 2 inspections same day)
  --      NOW()+5days → 1 WO
  --      NOW()+7days → 1 WO
  --      NOW()+9days → 1 WO (same day as inspection i18)
  --      Past dates   → 3 overdue WOs
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO fm_work_orders
    (org_id, property_id, asset_id, inspection_id,
     title, description, status, priority, due_date)
  VALUES

    -- ── OPEN / HIGH / Overdue (3 items) ───────────────────────────────────

    -- WO-01: Mercado — structural collapse risk, well overdue
    (v_org, v_p7, v_a21, NULL,
     'Structural Column Repair — Market Hall Zone A',
     'Load-bearing columns in Zone A show significant spalling and rebar exposure. '
     || 'Building is INACTIVE pending remediation. Engineer assessment required before any occupancy.',
     'OPEN', 'HIGH',
     NOW() - INTERVAL '45 days'),

    -- WO-02: Mercado — electrical service condemned
    (v_org, v_p7, v_a20, NULL,
     'Main Electrical Service Replacement — Mercado Municipal',
     'Service entrance panel corroded, overheating on last reading. '
     || 'Power disconnected. Full service replacement required before reopening.',
     'OPEN', 'HIGH',
     NOW() - INTERVAL '30 days'),

    -- WO-03: Villa Nueva — overdue fire safety item from i4
    (v_org, v_p4, v_a11, v_i4,
     'Fire Extinguisher Replacement — Villa Nueva Recreational Center',
     'Two extinguishers identified as past inspection date during 10-day-ago inspection. '
     || 'Replace immediately per PR fire code §401.3.',
     'OPEN', 'HIGH',
     NOW() - INTERVAL '5 days'),

    -- WO-04: Bomberos — generator issue from i2, overdue
    (v_org, v_p2, v_a05, v_i2,
     'Emergency Generator Service — Estación Bomberos #1',
     'Generator output fluctuation observed during inspection 8 days ago. '
     || 'Preventive service and load bank test required.',
     'OPEN', 'HIGH',
     NOW() - INTERVAL '3 days'),

    -- ── OPEN / MEDIUM (4 items) ────────────────────────────────────────────

    -- WO-05: Alcaldía — camera cleaning (minor, future due)
    (v_org, v_p1, v_a02, v_i1,
     'Security Camera Lens Cleaning — Alcaldía Front Entrance',
     'Front lobby camera lens obscured. Facilities crew to clean during next building maintenance cycle.',
     'OPEN', 'MEDIUM',
     NOW() + INTERVAL '3 days'),

    -- WO-06: Alcaldía — critical score follow-up from i8 (due in 3 days)
    (v_org, v_p1, NULL, v_i8,
     'Corrective Action Plan — Alcaldía Low Compliance Score',
     'Score of 56 on most recent inspection requires documented corrective action plan '
     || 'per municipal facilities policy. Supervisor review pending.',
     'OPEN', 'MEDIUM',
     NOW() + INTERVAL '3 days'),

    -- WO-07: Complejo Deportivo — pool filter, 5 days out
    (v_org, v_p6, v_a16, NULL,
     'Pool Filtration System Maintenance — Complejo Deportivo',
     'Quarterly filter backwash and chemical balance check. '
     || 'Schedule during low-attendance hours.',
     'OPEN', 'MEDIUM',
     NOW() + INTERVAL '5 days'),

    -- WO-08: Villa Nueva — east wall crack monitoring, 7 days out
    (v_org, v_p4, v_a12, v_i4,
     'Structural Crack Monitoring — Villa Nueva East Wall',
     'Crack observed during inspection requires monthly measurement. '
     || 'Install crack gauge and document baseline reading.',
     'OPEN', 'MEDIUM',
     NOW() + INTERVAL '7 days'),

    -- ── IN_PROGRESS (3 items, one overdue) ────────────────────────────────

    -- WO-09: Centro de Salud — water pressure fix in progress, overdue
    (v_org, v_p3, v_a08, v_i3,
     'South Wing Water Pressure Remediation — Centro de Salud',
     'Plumber engaged to identify cause of low pressure. '
     || 'Possible sediment buildup in main supply line.',
     'IN_PROGRESS', 'MEDIUM',
     NOW() - INTERVAL '2 days'),

    -- WO-10: Mercado — roof drain temporary fix in progress
    (v_org, v_p7, v_a19, NULL,
     'Temporary Roof Drain Clearance — Mercado Municipal',
     'Emergency clearance of blocked drains to prevent further water intrusion '
     || 'into the structure pending full remediation budget approval.',
     'IN_PROGRESS', 'HIGH',
     NOW() + INTERVAL '9 days'),

    -- WO-11: Biblioteca — camera repair in progress
    (v_org, v_p5, v_a15, v_i5,
     'Exterior Security Camera #3 Repair — Biblioteca',
     'Camera offline since last week. Technician dispatched; '
     || 'awaiting replacement unit from vendor.',
     'IN_PROGRESS', 'MEDIUM',
     NOW() + INTERVAL '9 days'),

    -- ── COMPLETED (4 items) ────────────────────────────────────────────────

    -- WO-12: Alcaldía — accessibility upgrade completed
    (v_org, v_p1, NULL, NULL,
     'ADA Accessible Parking Restriping — Alcaldía',
     'Faded accessible parking spaces restriped with compliant markings and new signage installed.',
     'COMPLETED', 'LOW',
     NOW() - INTERVAL '20 days'),

    -- WO-13: Bomberos — handrail repair completed
    (v_org, v_p2, NULL, v_i2,
     'East Entrance Ramp Handrail Re-anchorage — Estación Bomberos',
     'Loose handrail identified during inspection. Anchoring hardware replaced and torqued to spec.',
     'COMPLETED', 'MEDIUM',
     NOW() - INTERVAL '6 days'),

    -- WO-14: Biblioteca — HVAC filter replacement completed
    (v_org, v_p5, v_a13, NULL,
     'Quarterly HVAC Filter Replacement — Biblioteca',
     'Scheduled preventive maintenance. All filters replaced, coils cleaned, '
     || 'airflow balanced across zones.',
     'COMPLETED', 'LOW',
     NOW() - INTERVAL '15 days'),

    -- WO-15: Centro Comunitario — pre-inspection asset check completed
    (v_org, v_p8, v_a22, NULL,
     'HVAC Pre-Inspection Service — Centro Comunitario Caribe',
     'Mini-split cassette filters cleaned and refrigerant pressure checked '
     || 'in preparation for upcoming scheduled inspection.',
     'COMPLETED', 'LOW',
     NOW() - INTERVAL '7 days');

  RAISE NOTICE 'FM seed: complete. Inserted 1 template, 8 properties, 24 assets, 20 inspections, 50 checklist responses, 15 work orders.';

END $$;
