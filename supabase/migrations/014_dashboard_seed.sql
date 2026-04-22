-- ============================================================
-- Migration 014: Dashboard Seed Data
-- Adds team members, work orders, pothole reports, inspections
-- to populate all CA dashboard widgets under realistic load.
-- ============================================================

DO $$
DECLARE
  v_org_id   UUID;
  v_user_id  UUID;

  u_carlos  UUID := gen_random_uuid();
  u_mayra   UUID := gen_random_uuid();
  u_roberto UUID := gen_random_uuid();
  u_diana   UUID := gen_random_uuid();
  u_luis    UUID := gen_random_uuid();

  w_new1  UUID := gen_random_uuid(); w_new2  UUID := gen_random_uuid();
  w_new3  UUID := gen_random_uuid(); w_new4  UUID := gen_random_uuid();
  w_new5  UUID := gen_random_uuid(); w_new6  UUID := gen_random_uuid();
  w_new7  UUID := gen_random_uuid(); w_new8  UUID := gen_random_uuid();
  w_new9  UUID := gen_random_uuid(); w_new10 UUID := gen_random_uuid();
  w_new11 UUID := gen_random_uuid(); w_new12 UUID := gen_random_uuid();

  ph1  UUID := gen_random_uuid(); ph2  UUID := gen_random_uuid();
  ph3  UUID := gen_random_uuid(); ph4  UUID := gen_random_uuid();
  ph5  UUID := gen_random_uuid(); ph6  UUID := gen_random_uuid();
  ph7  UUID := gen_random_uuid(); ph8  UUID := gen_random_uuid();
  ph9  UUID := gen_random_uuid(); ph10 UUID := gen_random_uuid();

  ins1 UUID := gen_random_uuid(); ins2 UUID := gen_random_uuid();
  ins3 UUID := gen_random_uuid(); ins4 UUID := gen_random_uuid();
  ins5 UUID := gen_random_uuid();

  v_p1  UUID; v_p2  UUID; v_p3  UUID; v_p4  UUID; v_p5  UUID;
  v_p6  UUID; v_p7  UUID; v_p8  UUID; v_p9  UUID; v_p10 UUID;

BEGIN
  SELECT id INTO v_org_id  FROM (SELECT id FROM organizations ORDER BY created_at LIMIT 1) _o;
  SELECT id INTO v_user_id FROM (SELECT id FROM profiles      ORDER BY created_at LIMIT 1) _p;

  IF v_org_id IS NULL OR v_user_id IS NULL THEN
    RAISE NOTICE 'No org or user found — skipping seed.';
    RETURN;
  END IF;

  -- ── Fetch existing project IDs ────────────────────────────────────────────
  SELECT id INTO v_p1  FROM projects WHERE number = 'PJ-2025-0101' AND deleted_at IS NULL;
  SELECT id INTO v_p2  FROM projects WHERE number = 'PJ-2025-0102' AND deleted_at IS NULL;
  SELECT id INTO v_p3  FROM projects WHERE number = 'PJ-2025-0103' AND deleted_at IS NULL;
  SELECT id INTO v_p4  FROM projects WHERE number = 'PJ-2025-0104' AND deleted_at IS NULL;
  SELECT id INTO v_p5  FROM projects WHERE number = 'PJ-2026-0101' AND deleted_at IS NULL;
  SELECT id INTO v_p6  FROM projects WHERE number = 'PJ-2026-0102' AND deleted_at IS NULL;
  SELECT id INTO v_p7  FROM projects WHERE number = 'PJ-2025-0105' AND deleted_at IS NULL;
  SELECT id INTO v_p8  FROM projects WHERE number = 'PJ-2026-0103' AND deleted_at IS NULL;
  SELECT id INTO v_p9  FROM projects WHERE number = 'PJ-2026-0104' AND deleted_at IS NULL;
  SELECT id INTO v_p10 FROM projects WHERE number = 'PJ-2026-0105' AND deleted_at IS NULL;

  -- ── Auth stub users ───────────────────────────────────────────────────────
  INSERT INTO auth.users
    (id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
     raw_app_meta_data, raw_user_meta_data, aud, role)
  VALUES
    (u_carlos,  'carlos.velez@guaynabo.pr.gov',   '', NOW(), NOW(), NOW(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Carlos Vélez"}',   'authenticated', 'authenticated'),
    (u_mayra,   'mayra.colon@guaynabo.pr.gov',    '', NOW(), NOW(), NOW(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Mayra Colón"}',    'authenticated', 'authenticated'),
    (u_roberto, 'roberto.nieves@guaynabo.pr.gov', '', NOW(), NOW(), NOW(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Roberto Nieves"}', 'authenticated', 'authenticated'),
    (u_diana,   'diana.ramos@guaynabo.pr.gov',    '', NOW(), NOW(), NOW(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Diana Ramos"}',    'authenticated', 'authenticated'),
    (u_luis,    'luis.ortiz@guaynabo.pr.gov',     '', NOW(), NOW(), NOW(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"Luis Ortiz"}',     'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  -- ── Profiles ──────────────────────────────────────────────────────────────
  INSERT INTO profiles (id, org_id, full_name) VALUES
    (u_carlos,  v_org_id, 'Carlos Vélez'),
    (u_mayra,   v_org_id, 'Mayra Colón'),
    (u_roberto, v_org_id, 'Roberto Nieves'),
    (u_diana,   v_org_id, 'Diana Ramos'),
    (u_luis,    v_org_id, 'Luis Ortiz')
  ON CONFLICT (id) DO NOTHING;

  -- ── Work orders (P1=critical, P2=high, P3=medium, P4=low) ────────────────
  INSERT INTO work_orders
    (id, org_id, number, title, description, status, priority,
     assigned_to, created_by, due_date, labor_hours, labor_cost, materials_cost, project_id)
  VALUES
    (w_new1,  v_org_id, 'WO-2026-0201', 'Pothole patching — Calle Marginal km 3.1',
     'Multiple surface depressions 10–25 cm diameter in the right lane. Apply cold-mix patch, compact, seal edges.',
     'in_progress', 'P2', u_carlos, v_user_id, CURRENT_DATE + 3,  6, 540.00,  210.00, v_p1),

    (w_new2,  v_org_id, 'WO-2026-0202', 'Install pedestrian crossing signage at Ave. Las Cumbres',
     'New ADA-compliant signage package: 3 warning signs, 2 yield-to-pedestrian, tactile surface markers.',
     'open',        'P3', u_carlos, v_user_id, CURRENT_DATE + 6,  4, 360.00,  850.00, v_p4),

    (w_new3,  v_org_id, 'WO-2026-0203', 'Guardrail replacement — PR-177 curve sector 7',
     'Damaged W-beam guardrail 40 m section after vehicle impact. Remove debris, set new posts, install new beam.',
     'open',        'P1', u_carlos, v_user_id, CURRENT_DATE + 1,  8, 720.00, 3200.00, v_p1),

    (w_new4,  v_org_id, 'WO-2026-0204', 'Catch basin cleaning — Urb. Extensión Villa Rica',
     'Quarterly sediment removal from 12 catch basins. Vacuum truck scheduled.',
     'in_progress', 'P4', u_carlos, v_user_id, CURRENT_DATE + 12, 5, 450.00,  120.00, v_p9),

    (w_new5,  v_org_id, 'WO-2026-0205', 'Sports court resurfacing — Frailes Park',
     'Apply two coats of acrylic resurfacer and repaint boundary lines on basketball and tennis courts.',
     'in_progress', 'P3', u_mayra,  v_user_id, CURRENT_DATE + 8, 12, 1080.00, 4200.00, v_p2),

    (w_new6,  v_org_id, 'WO-2026-0206', 'Broken curb repair — PR-833 bus stop zone',
     'Sections of curb have settled and cracked. Saw-cut 6 m section, pour new concrete, cure 48 h.',
     'open',        'P3', u_mayra,  v_user_id, CURRENT_DATE + 5,  6, 540.00,  680.00, v_p3),

    (w_new7,  v_org_id, 'WO-2026-0207', 'Hydrant pressure test — Sector Mamey Norte',
     'Annual fire-hydrant flow test for 8 hydrants. Record static/residual pressure and flow rate.',
     'open',        'P4', u_mayra,  v_user_id, CURRENT_DATE + 14, 4, 360.00,    0.00, v_p6),

    (w_new8,  v_org_id, 'WO-2026-0208', 'Emergency slope stabilization — Río Bayamón embankment',
     'Heavy rain exposed unstable bank at sta. 12+40. Install erosion blanket, place riprap toe protection, seed.',
     'in_progress', 'P1', u_roberto, v_user_id, CURRENT_DATE + 2, 16, 1440.00, 8500.00, v_p7),

    (w_new9,  v_org_id, 'WO-2026-0209', 'Street light replacement — Calle Betances 10 units',
     'Replace 10 failed 150W HPS fixtures with 80W LED. Includes wiring audit and photocell replacement.',
     'open',        'P3', u_roberto, v_user_id, CURRENT_DATE + 10, 8, 720.00, 5400.00, v_p8),

    (w_new10, v_org_id, 'WO-2026-0210', 'Manhole frame leveling — Ave. Gautier Benítez',
     'Six manhole frames 3–5 cm above road surface creating ride hazard. Mill surround, reset frames, patch.',
     'on_hold',     'P2', u_diana,   v_user_id, CURRENT_DATE - 5,  6, 540.00,  420.00, v_p3),

    (w_new11, v_org_id, 'WO-2026-0211', 'Community center roof drainage inspection',
     'Standing water observed on flat roof. Inspect drains, downspouts, and membrane seams. Report findings.',
     'open',        'P3', u_diana,   v_user_id, CURRENT_DATE + 4,  3, 270.00,    0.00, v_p10),

    (w_new12, v_org_id, 'WO-2026-0212', 'Pavement marking refresh — school zone Guaraguao',
     'Re-stripe crosswalks, stop bars, and school zone legends. Apply thermoplastic for durability.',
     'open',        'P2', u_luis,    v_user_id, CURRENT_DATE + 7,  8, 720.00, 1800.00, v_p5);

  -- Mark w_new10 blocked (Diana's on-hold WO)
  UPDATE work_orders SET
    blocked = true,
    blocked_by = 'PRASA permit',
    blocked_by_reason = 'PRASA has a pending water main repair at the same road segment. Cannot proceed until utility work is complete.',
    blocked_since = CURRENT_DATE - 5
  WHERE id = w_new10;

  -- Mark one existing overdue WO blocked for dept overview richness
  UPDATE work_orders SET
    blocked = true,
    blocked_by = 'Procurement',
    blocked_by_reason = 'Materials backordered — supplier lead time 3 weeks.',
    blocked_since = CURRENT_DATE - 12
  WHERE id = (
    SELECT id FROM work_orders
    WHERE org_id = v_org_id AND blocked = false
      AND status IN ('open', 'in_progress')
      AND due_date < CURRENT_DATE
      AND deleted_at IS NULL
    ORDER BY due_date
    LIMIT 1
  );

  -- ── Pothole reports ───────────────────────────────────────────────────────
  INSERT INTO pothole_reports
    (id, org_id, number, title, defect_type, status, severity,
     latitude, longitude, address, description, reported_by, assigned_to)
  VALUES
    (ph1,  v_org_id, 'PH-2026-0201', 'Pothole Ave. Las Cumbres #450',
     'pothole', 'reported', 'high',
     18.3720, -66.1015, 'Ave. Las Cumbres frente al #450',
     'Large pothole ~40×30 cm, 8 cm deep. Water pooling.', v_user_id, NULL),

    (ph2,  v_org_id, 'PH-2026-0202', 'Alligator cracking Calle Betances',
     'alligator_crack', 'verified', 'medium',
     18.3654, -66.0998, 'Calle Betances esq. Calle 2, Urb. Santa Rosa',
     'Alligator cracking in right turn lane. Pothole forming.', v_user_id, u_carlos),

    (ph3,  v_org_id, 'PH-2026-0203', 'Deep pothole PR-177 km 2.8',
     'pothole', 'in_repair', 'critical',
     18.3598, -66.1102, 'PR-177 km 2.8 sentido norte',
     'Deep pothole 60 cm diameter in travel lane. Temp patch placed.', v_user_id, u_carlos),

    (ph4,  v_org_id, 'PH-2026-0204', 'Potholes Calle Marginal Mansiones',
     'pothole', 'assigned', 'medium',
     18.3801, -66.0876, 'Calle Marginal, Urb. Mansiones de Guaynabo',
     'Multiple small potholes near storm drain.', v_user_id, u_mayra),

    (ph5,  v_org_id, 'PH-2026-0205', 'Pothole Ave. Gautier Benítez CC',
     'pothole', 'repaired', 'low',
     18.3742, -66.1234, 'Ave. Gautier Benítez frente al CC',
     'Pothole repaired with hot-mix asphalt. Compacted and sealed.', v_user_id, u_roberto),

    (ph6,  v_org_id, 'PH-2026-0206', 'Pothole Calle Sonadora frente escuela',
     'pothole', 'repaired', 'medium',
     18.3610, -66.0945, 'Calle Sonadora #12 frente a la escuela',
     'Repair completed. Monitoring for recurrence.', v_user_id, u_roberto),

    (ph7,  v_org_id, 'PH-2026-0207', 'Pothole Urb. Extensión Camarones',
     'pothole', 'closed', 'low',
     18.3688, -66.1180, 'Urb. Extensión Camarones, Calle Principal',
     'Verified repair holding. Closed after 30-day observation.', v_user_id, u_diana),

    (ph8,  v_org_id, 'PH-2026-0208', 'Pothole PR-833 parada de guagua',
     'pothole', 'reported', 'high',
     18.3755, -66.0820, 'PR-833 km 1.2 frente a la parada de guagua',
     'Pothole causing vehicles to swerve. Near bus stop.', v_user_id, NULL),

    (ph9,  v_org_id, 'PH-2026-0209', 'Pothole Calle Hato Nuevo',
     'pothole', 'closed', 'medium',
     18.3840, -66.1050, 'Calle Hato Nuevo, sector residencial',
     'Repaired and sealed. Inspection passed.', v_user_id, u_luis),

    (ph10, v_org_id, 'PH-2026-0210', 'Pothole Ave. Arterial Hostos acceso norte',
     'pothole', 'in_repair', 'high',
     18.3530, -66.0980, 'Ave. Arterial Hostos acceso norte',
     'Active repair in progress. Lane closure in effect.', v_user_id, u_carlos);

  -- ── Inspections ───────────────────────────────────────────────────────────
  INSERT INTO inspections
    (id, org_id, number, title, status, project_id, inspector_id,
     scheduled_at, notes, created_by)
  VALUES
    (ins1, v_org_id, 'INSP-2026-0101', 'PR-177 Pavement Core Sampling',
     'in_progress', v_p1, u_carlos,
     NOW() + INTERVAL '2 days',
     'Core samples to verify base compaction before final lift.',
     v_user_id),

    (ins2, v_org_id, 'INSP-2026-0102', 'Frailes Park Structural Review',
     'draft', v_p2, u_diana,
     NOW() + INTERVAL '5 days',
     'Pre-construction structural review of existing pavilion footings.',
     v_user_id),

    (ins3, v_org_id, 'INSP-2026-0103', 'Flood Retention Basin Capacity Check',
     'in_progress', v_p7, u_roberto,
     NOW() + INTERVAL '1 day',
     'Post-rain inspection of retention basin fill levels and outlet condition.',
     v_user_id),

    (ins4, v_org_id, 'INSP-2026-0104', 'ADA Sidewalk Compliance Walk-Through',
     'completed', v_p4, u_mayra,
     NOW() - INTERVAL '8 days',
     'All ramps meet ADA slope requirements. Detectable warning surfaces installed correctly.',
     v_user_id),

    (ins5, v_org_id, 'INSP-2026-0105', 'School Zone Marking Pre-Work Survey',
     'draft', v_p5, u_luis,
     NOW() + INTERVAL '3 days',
     'Verify existing marking conditions before thermoplastic application.',
     v_user_id);

  -- Set completed_at for the completed inspection
  UPDATE inspections SET completed_at = NOW() - INTERVAL '7 days', score = 92
  WHERE id = ins4;

  -- ── Refresh project actual_cost ───────────────────────────────────────────
  UPDATE projects p
  SET actual_cost = (
    SELECT COALESCE(SUM(labor_cost + materials_cost), 0)
    FROM work_orders w
    WHERE w.project_id = p.id AND w.deleted_at IS NULL
  )
  WHERE p.org_id = v_org_id AND p.deleted_at IS NULL;

  RAISE NOTICE 'Migration 014 complete: 5 profiles, 12 WOs, 10 potholes, 5 inspections seeded.';
END;
$$;
