-- ============================================================
-- Migration 009: Mock Data — Municipio de Guaynabo, PR
-- Run AFTER migrations 001–008 and after at least one user has
-- signed up (the script uses the first org + first profile).
-- To delete all mock data: run tools/clear_mock_data.sql
-- ============================================================

DO $$
DECLARE
  v_org_id   UUID;
  v_user_id  UUID;

  -- project IDs
  p1 UUID := gen_random_uuid(); -- PR-177 Resurfacing
  p2 UUID := gen_random_uuid(); -- Frailes Park
  p3 UUID := gen_random_uuid(); -- Pueblo Viejo Water Main
  p4 UUID := gen_random_uuid(); -- Santa Rosa ADA Sidewalk
  p5 UUID := gen_random_uuid(); -- Guaraguao School Zone
  p6 UUID := gen_random_uuid(); -- Mamey Sports Complex
  p7 UUID := gen_random_uuid(); -- Río Flooding Prevention
  p8 UUID := gen_random_uuid(); -- Hato Nuevo Road Widening
  p9 UUID := gen_random_uuid(); -- Camarones Drainage Upgrade
  p10 UUID := gen_random_uuid(); -- Sonadora Community Center

  -- work order IDs
  w1  UUID := gen_random_uuid();
  w2  UUID := gen_random_uuid();
  w3  UUID := gen_random_uuid();
  w4  UUID := gen_random_uuid();
  w5  UUID := gen_random_uuid();
  w6  UUID := gen_random_uuid();
  w7  UUID := gen_random_uuid();
  w8  UUID := gen_random_uuid();
  w9  UUID := gen_random_uuid();
  w10 UUID := gen_random_uuid();
  w11 UUID := gen_random_uuid();
  w12 UUID := gen_random_uuid();

  -- contract IDs
  c1  UUID := gen_random_uuid();
  c2  UUID := gen_random_uuid();
  c3  UUID := gen_random_uuid();
  c4  UUID := gen_random_uuid();
  c5  UUID := gen_random_uuid();
  c6  UUID := gen_random_uuid();
  c7  UUID := gen_random_uuid();
  c8  UUID := gen_random_uuid();

  -- pothole IDs
  ph1  UUID := gen_random_uuid();
  ph2  UUID := gen_random_uuid();
  ph3  UUID := gen_random_uuid();
  ph4  UUID := gen_random_uuid();
  ph5  UUID := gen_random_uuid();
  ph6  UUID := gen_random_uuid();
  ph7  UUID := gen_random_uuid();
  ph8  UUID := gen_random_uuid();
  ph9  UUID := gen_random_uuid();
  ph10 UUID := gen_random_uuid();
  ph11 UUID := gen_random_uuid();
  ph12 UUID := gen_random_uuid();
  ph13 UUID := gen_random_uuid();
  ph14 UUID := gen_random_uuid();
  ph15 UUID := gen_random_uuid();

  -- inspection IDs
  i1 UUID := gen_random_uuid();
  i2 UUID := gen_random_uuid();
  i3 UUID := gen_random_uuid();
  i4 UUID := gen_random_uuid();
  i5 UUID := gen_random_uuid();
  i6 UUID := gen_random_uuid();

BEGIN
  -- ── Get org and user ─────────────────────────────────────────
  SELECT id INTO v_org_id  FROM organizations LIMIT 1;
  SELECT id INTO v_user_id FROM profiles      LIMIT 1;

  IF v_org_id IS NULL OR v_user_id IS NULL THEN
    RAISE NOTICE 'No organization or user found — skipping mock data. Sign up at the app, then re-run this script via Supabase Studio.';
    RETURN;
  END IF;

  -- ── Reset mock sequences — leave headroom above mock data ──────
  -- Potholes: mock uses PH-2026-0101…0113 and PH-2025-04xx, so start new at 201
  PERFORM setval('pothole_number_seq',    200);
  PERFORM setval('project_number_seq',    100);
  PERFORM setval('inspection_number_seq', 100);
  PERFORM setval('pothole_number_seq',    100);
  PERFORM setval('work_order_number_seq', 100);
  PERFORM setval('contract_number_seq',   100);

  -- ============================================================
  -- PROJECTS
  -- ============================================================
  INSERT INTO projects (id, org_id, number, name, code, description, status,
    address, latitude, longitude, cover_url,
    start_date, planned_end_date, end_date,
    budget, actual_cost, project_manager, created_by,
    blocked, blocked_by, blocked_by_reason, blocked_since,
    created_at, updated_at)
  VALUES

  -- P1: PR-177 Resurfacing — OVERDUE, blocked by DTOP
  (p1, v_org_id, 'PJ-2025-0101',
   'PR-177 / Ave. Las Cumbres Resurfacing',
   'RD-2025-01',
   'Full-depth mill and overlay of PR-177 from Ave. Las Cumbres to the PR-22 interchange. '
   'Includes ADA curb ramp upgrades at 14 intersections and updated pavement markings.',
   'active',
   'PR-177, Barrio Camarones, Guaynabo, PR 00966',
   18.3651, -66.1072,
   'https://picsum.photos/seed/asphalt-road-1/1200/600',
   '2025-07-01', '2026-03-15', NULL,
   2850000, 1420000, v_user_id, v_user_id,
   TRUE, 'DTOP — Departamento de Transportación y Obras Públicas',
   'Awaiting DTOP sign-off on traffic control plan amendment. Submitted 2025-11-12. No response received.',
   '2025-11-12',
   NOW() - INTERVAL '9 months', NOW()),

  -- P2: Frailes Park — AT RISK
  (p2, v_org_id, 'PJ-2025-0102',
   'Frailes Community Park Renovation',
   'PK-2025-01',
   'Rehabilitation of Parque Comunal de Frailes: new playground equipment, basketball courts, '
   'LED sports lighting, landscaping, and accessible pathways. Community-prioritized project.',
   'active',
   'Carr. 177 Ramal 830, Barrio Frailes, Guaynabo, PR 00969',
   18.3938, -66.1102,
   'https://picsum.photos/seed/park-playground-1/1200/600',
   '2025-10-01', '2026-04-30', NULL,
   680000, 215000, v_user_id, v_user_id,
   FALSE, NULL, NULL, NULL,
   NOW() - INTERVAL '6 months', NOW()),

  -- P3: Pueblo Viejo Water Main — ON TRACK
  (p3, v_org_id, 'PJ-2025-0103',
   'Pueblo Viejo Water Main Replacement',
   'WT-2025-01',
   'Replacement of 2.1 km of deteriorated 4-inch cast-iron water mains with 6-inch PVC. '
   'Includes service reconnections to 87 residential properties. Coordinated with AAA.',
   'active',
   'Barrio Pueblo Viejo, Guaynabo, PR 00966',
   18.4150, -66.1082,
   'https://picsum.photos/seed/water-pipe-infrastructure/1200/600',
   '2025-11-01', '2026-06-30', NULL,
   1200000, 280000, v_user_id, v_user_id,
   FALSE, NULL, NULL, NULL,
   NOW() - INTERVAL '5 months', NOW()),

  -- P4: Santa Rosa ADA Sidewalk — OVERDUE, blocked by AAA
  (p4, v_org_id, 'PJ-2025-0104',
   'Ave. San Miguel ADA Sidewalk Compliance',
   'SW-2025-01',
   'Installation of 3.8 km of accessible sidewalks along Ave. San Miguel from Santa Rosa '
   'to Barrio Pueblo. Includes 31 ADA-compliant curb cuts, tactile paving, and drainage. '
   'Required under federal ADA settlement agreement.',
   'active',
   'Ave. San Miguel, Barrio Santa Rosa, Guaynabo, PR 00966',
   18.3827, -66.1352,
   'https://picsum.photos/seed/sidewalk-construction-ada/1200/600',
   '2025-08-15', '2026-02-28', NULL,
   920000, 760000, v_user_id, v_user_id,
   TRUE, 'AAA — Autoridad de Acueductos y Alcantarillados',
   'Waiting for AAA to complete sewer line relocation before final sidewalk pour. '
   'Work order submitted to AAA on 2025-10-03. Last status: "scheduled for Q2 2026."',
   '2025-10-03',
   NOW() - INTERVAL '8 months', NOW()),

  -- P5: Guaraguao School Zone — AT RISK, blocked by Traffic Engineering
  (p5, v_org_id, 'PJ-2026-0101',
   'Guaraguao School Zone Safety Improvements',
   'SF-2026-01',
   'Installation of HAWK pedestrian signals, speed humps, flashing beacons, and school zone '
   'striping at Escuela Monserrate Feliciano. Includes crosswalk upgrades on PR-2 access road.',
   'active',
   'Barrio Guaraguao, near Carr. 2, Guaynabo, PR 00965',
   18.3480, -66.1482,
   'https://picsum.photos/seed/school-zone-safety/1200/600',
   '2026-01-15', '2026-04-15', NULL,
   340000, 45000, v_user_id, v_user_id,
   TRUE, 'Municipio — Traffic Engineering Dept.',
   'Awaiting approval of traffic signal warrant analysis. Study completed; pending review by director.',
   '2026-02-20',
   NOW() - INTERVAL '3 months', NOW()),

  -- P6: Mamey Sports Complex — PLANNING, ON TRACK
  (p6, v_org_id, 'PJ-2026-0102',
   'Mamey Multi-Use Sports Complex',
   'SP-2026-01',
   'New construction of a 4,200 sq.m multi-use sports complex in Barrio Mamey: '
   '2 full-size basketball courts, community meeting room, restrooms, and parking for 80 vehicles.',
   'planning',
   'Barrio Mamey, Guaynabo, PR 00970',
   18.3372, -66.1225,
   'https://picsum.photos/seed/sports-complex-construction/1200/600',
   '2026-06-01', '2026-12-31', NULL,
   3200000, 0, v_user_id, v_user_id,
   FALSE, NULL, NULL, NULL,
   NOW() - INTERVAL '1 month', NOW()),

  -- P7: Río Flooding — OVERDUE, blocked by Army Corps
  (p7, v_org_id, 'PJ-2025-0105',
   'Río Barrio Flooding Prevention — PR-167 Corridor',
   'FL-2025-01',
   'Channelization and bank stabilization of Quebrada Los Cedros along PR-167. '
   'Includes installation of 340m of concrete channel, debris detention structure, '
   'and early warning sensor network for flood-prone properties.',
   'active',
   'PR-167 Corridor, Barrio Río, Guaynabo, PR 00971',
   18.3450, -66.0782,
   'https://picsum.photos/seed/flood-channel-river/1200/600',
   '2025-04-01', '2026-01-31', NULL,
   4100000, 890000, v_user_id, v_user_id,
   TRUE, 'US Army Corps of Engineers',
   'Section 404 permit application submitted 2025-05-18. Corps requested additional '
   'hydrological study in August 2025. Supplemental study submitted Oct 2025. No decision.',
   '2025-05-18',
   NOW() - INTERVAL '12 months', NOW()),

  -- P8: Hato Nuevo Road Widening — ACTIVE, ON TRACK
  (p8, v_org_id, 'PJ-2026-0103',
   'Hato Nuevo PR-30 Access Road Widening',
   'RD-2026-01',
   'Widening of a 1.2 km municipal access road from 2 to 4 lanes including turn lanes, '
   'new drainage system, and LED streetlighting. Serves growing residential development area.',
   'active',
   'Barrio Hato Nuevo, Guaynabo, PR 00971',
   18.3252, -66.0908,
   'https://picsum.photos/seed/road-widening-construction/1200/600',
   '2026-02-01', '2026-07-31', NULL,
   1750000, 320000, v_user_id, v_user_id,
   FALSE, NULL, NULL, NULL,
   NOW() - INTERVAL '2 months', NOW()),

  -- P9: Camarones Drainage — ACTIVE, AT RISK
  (p9, v_org_id, 'PJ-2025-0106',
   'Camarones Stormwater System Upgrade',
   'DR-2025-01',
   'Replacement of 1.8 km of undersized 18-inch culverts with 36-inch reinforced concrete '
   'pipe in Barrio Camarones. Addresses chronic flooding affecting 200+ households during '
   'tropical events.',
   'active',
   'Carr. 165, Barrio Camarones, Guaynabo, PR 00966',
   18.3625, -66.1065,
   'https://picsum.photos/seed/stormwater-drainage-pipe/1200/600',
   '2025-09-01', '2026-04-20', NULL,
   1650000, 980000, v_user_id, v_user_id,
   FALSE, NULL, NULL, NULL,
   NOW() - INTERVAL '7 months', NOW()),

  -- P10: Sonadora Community Center — COMPLETED
  (p10, v_org_id, 'PJ-2025-0107',
   'Sonadora Community Center Rehabilitation',
   'BD-2025-01',
   'Renovation of existing 1,100 sq.m community center: roof replacement, electrical upgrade '
   'to 200A panel, HVAC installation, accessible restrooms, and exterior painting.',
   'completed',
   'Carr. 176, Barrio Sonadora, Guaynabo, PR 00970',
   18.3225, -66.1422,
   'https://picsum.photos/seed/community-center-building/1200/600',
   '2025-01-15', '2025-09-30', '2025-10-08',
   485000, 471000, v_user_id, v_user_id,
   FALSE, NULL, NULL, NULL,
   NOW() - INTERVAL '15 months', NOW());

  -- ============================================================
  -- CONTRACTS
  -- ============================================================
  INSERT INTO contracts (id, org_id, number, title, description, status,
    vendor_name, vendor_contact, vendor_email,
    contract_value, start_date, end_date, signed_at,
    notes, created_by, created_at, updated_at)
  VALUES

  (c1, v_org_id, 'CT-2025-0101',
   'Road Resurfacing — PR-177 Corridor (Phase 1)',
   'Mill and overlay of PR-177 from Ave. Las Cumbres to PR-22 interchange. Includes pavement markings and curb ramps.',
   'active',
   'Constructora Betancourt & Asociados', 'Ricardo Betancourt', 'rbetancourt@constructorab.com',
   2100000, '2025-07-15', '2026-05-30', '2025-07-01',
   'Fixed-price contract. Performance bond required. Liquidated damages clause: $2,500/day for delays.',
   v_user_id, NOW() - INTERVAL '9 months', NOW()),

  (c2, v_org_id, 'CT-2025-0102',
   'Engineering Services — Hydrological Studies',
   'On-call engineering consulting for hydrological and structural studies. Master Services Agreement.',
   'active',
   'López Ingeniería y Consultoría, PSC', 'Ing. Carmen López-Vega', 'clopez@lopezingenieria.com',
   180000, '2025-01-01', '2026-12-31', '2025-01-10',
   'Task order basis. Each task order not to exceed $25,000 without amendment.',
   v_user_id, NOW() - INTERVAL '15 months', NOW()),

  (c3, v_org_id, 'CT-2025-0103',
   'Park Equipment Supply & Installation — Frailes',
   'Supply and installation of playground equipment, fitness stations, benches, and picnic tables for Frailes Community Park.',
   'active',
   'PlayPR Equipment Solutions', 'José A. Torres', 'jtorres@playpr.com',
   285000, '2025-11-01', '2026-05-15', '2025-10-28',
   'Equipment must meet ASTM F1292 fall attenuation standards. 5-year warranty required.',
   v_user_id, NOW() - INTERVAL '5 months', NOW()),

  (c4, v_org_id, 'CT-2025-0104',
   'Flood Channel Construction — Barrio Río',
   'Concrete channelization of Quebrada Los Cedros: 340m reinforced channel, debris detention structure, grading.',
   'active',
   'Dragados Puerto Rico, LLC', 'Eduardo Ferrer', 'eferrer@dragadospr.com',
   3800000, '2025-05-01', '2026-04-30', '2025-04-20',
   'Contract suspended pending Army Corps Section 404 permit. Contractor notified. '
   'Demobilization costs to be negotiated if permit denied.',
   v_user_id, NOW() - INTERVAL '11 months', NOW()),

  (c5, v_org_id, 'CT-2026-0101',
   'ADA Sidewalk Construction — Ave. San Miguel',
   'Supply and installation of 3.8 km accessible sidewalk system per ADA/PROWAG standards.',
   'active',
   'Aceras Modernas del Caribe, Inc.', 'María Rodríguez-Cruz', 'mrodriguez@acerasmc.com',
   847000, '2025-09-01', '2026-06-30', '2025-08-25',
   'Work sequence adjusted due to AAA sewer conflict. Change order CO-001 issued for $14,500 '
   'standby costs. Additional change orders anticipated.',
   v_user_id, NOW() - INTERVAL '7 months', NOW()),

  (c6, v_org_id, 'CT-2026-0102',
   'Landscape Maintenance — Municipal Properties',
   'Annual landscape maintenance for 34 municipal properties including parks, plazas, and government buildings.',
   'active',
   'Verde Tropical Landscaping', 'Alexis Colón', 'acolon@verdetropical.com',
   96000, '2026-01-01', '2026-12-31', '2025-12-20',
   'Monthly performance inspections. Penalties for missed service windows.',
   v_user_id, NOW() - INTERVAL '3 months', NOW()),

  (c7, v_org_id, 'CT-2025-0105',
   'Community Center Renovation — Sonadora',
   'Full renovation of Sonadora Community Center: roof, electrical, HVAC, restrooms, painting.',
   'completed',
   'Renovaciones Del Valle, Corp.', 'Carlos Del Valle', 'cdelvalle@renovdelvalle.com',
   468000, '2025-02-01', '2025-10-15', '2025-01-28',
   'Project completed on time. Final inspection passed 2025-10-08. Retainage released.',
   v_user_id, NOW() - INTERVAL '14 months', NOW()),

  (c8, v_org_id, 'CT-2026-0103',
   'Traffic Signal Installation — Guaraguao School Zone',
   'Supply, installation, and programming of 2 HAWK pedestrian signals and 4 flashing school zone beacons.',
   'draft',
   'Señales y Sistemas de PR', 'Roberto Vega', 'rvega@senalespy.com',
   98500, NULL, NULL, NULL,
   'Pending traffic engineering approval before execution. IFB to be issued Q2 2026.',
   v_user_id, NOW() - INTERVAL '1 month', NOW());

  -- ============================================================
  -- WORK ORDERS
  -- ============================================================
  INSERT INTO work_orders (id, org_id, number, title, description, status, priority,
    severity, assigned_to, due_date, labor_hours, labor_cost, materials_cost,
    notes, created_by, blocked, blocked_by, blocked_by_reason, created_at, updated_at)
  VALUES

  -- W1: P1 Critical pothole — OVERDUE P1
  (w1, v_org_id, 'WO-2026-0101',
   'Emergency Pothole Repair — PR-177 at Camarones Intersection',
   'Deep pothole (approx 60cm x 45cm x 18cm depth) on PR-177 northbound at Camarones intersection. '
   'Traffic hazard. Multiple citizen complaints received.',
   'in_progress', 'P1', 'critical', v_user_id,
   CURRENT_DATE - INTERVAL '5 days',
   8, 480, 320,
   'HMA cold patch applied as temporary fix. Permanent repair pending asphalt plant availability.',
   v_user_id, FALSE, NULL, NULL,
   NOW() - INTERVAL '8 days', NOW()),

  -- W2: Street light — open, P2
  (w2, v_org_id, 'WO-2026-0102',
   'Street Light Outages — Urb. Santa Rosa (12 units)',
   '12 consecutive LED streetlights on Calle Flamboyan (Urb. Santa Rosa) are non-functional. '
   'Residents report feeling unsafe at night. AEE ticket filed.',
   'open', 'P2', 'high', NULL,
   CURRENT_DATE + INTERVAL '7 days',
   0, 0, 0,
   'Waiting for AEE contractor confirmation of transformer issue.',
   v_user_id, TRUE, 'AEE — Autoridad de Energía Eléctrica',
   'AEE must repair distribution transformer before municipality can re-energize fixtures.',
   NOW() - INTERVAL '12 days', NOW()),

  -- W3: Drainage cleaning, P3
  (w3, v_org_id, 'WO-2026-0103',
   'Storm Drain Cleaning — Barrio Camarones (24 inlets)',
   'Pre-hurricane season cleaning of 24 storm drain inlets in Barrio Camarones. '
   'Several inlets blocked by debris accumulation per field inspection.',
   'open', 'P3', 'medium', v_user_id,
   CURRENT_DATE + INTERVAL '14 days',
   0, 0, 0,
   NULL,
   v_user_id, FALSE, NULL, NULL,
   NOW() - INTERVAL '3 days', NOW()),

  -- W4: Sign replacement — P3
  (w4, v_org_id, 'WO-2026-0104',
   'Traffic Sign Replacement — PR-167 Sector Río',
   '8 traffic signs on PR-167 in Barrio Río are damaged or faded below retroreflectivity standards. '
   'Includes 3 STOP signs, 2 speed limit, and 3 directional signs.',
   'in_progress', 'P3', 'medium', v_user_id,
   CURRENT_DATE + INTERVAL '3 days',
   6, 360, 840,
   '5 of 8 signs replaced. Remaining 3 require post hole repair first.',
   v_user_id, FALSE, NULL, NULL,
   NOW() - INTERVAL '6 days', NOW()),

  -- W5: Bridge inspection — P2, OVERDUE
  (w5, v_org_id, 'WO-2025-0401',
   'Bridge Safety Inspection — Puente Quebrada Maracaibo (Mamey)',
   'Biennial structural inspection of 28m pedestrian/vehicle bridge over Quebrada Maracaibo. '
   'Last inspection 2023. Required by DTOP bridge program.',
   'open', 'P2', 'high', NULL,
   CURRENT_DATE - INTERVAL '45 days',
   0, 0, 0,
   'Inspector not yet assigned. Bridge safety rating unknown.',
   v_user_id, FALSE, NULL, NULL,
   NOW() - INTERVAL '2 months', NOW()),

  -- W6: Guaraguao pothole — P1
  (w6, v_org_id, 'WO-2026-0105',
   'Pothole Cluster Repair — Carr. 2 Service Road, Guaraguao',
   'Cluster of 6 potholes on PR-2 service road at Guaraguao school access. '
   'School buses affected. P1 due to school zone hazard.',
   'open', 'P1', 'critical', NULL,
   CURRENT_DATE + INTERVAL '1 day',
   0, 0, 0,
   'Notify principal of Escuela Monserrate Feliciano before closing road for repairs.',
   v_user_id, FALSE, NULL, NULL,
   NOW() - INTERVAL '2 days', NOW()),

  -- W7: Fence repair — P4
  (w7, v_org_id, 'WO-2026-0106',
   'Perimeter Fence Repair — Parque Pueblo Viejo',
   '35m of chain-link perimeter fence at Parque Pueblo Viejo is damaged. Posts leaning, '
   'fabric torn. Children accessing adjacent drainage ditch.',
   'open', 'P3', 'medium', NULL,
   CURRENT_DATE + INTERVAL '21 days',
   0, 0, 0,
   NULL,
   v_user_id, FALSE, NULL, NULL,
   NOW() - INTERVAL '4 days', NOW()),

  -- W8: ADA ramp — P2, OVERDUE
  (w8, v_org_id, 'WO-2025-0402',
   'ADA Curb Ramp Installation — Calle Carazo at Plaza Guaynabo',
   'Installation of 4 missing ADA curb ramps at corner of Calle Carazo and Calle Barbosa. '
   'Identified in ADA transition plan update. Court-mandated deadline.',
   'in_progress', 'P2', 'high', v_user_id,
   CURRENT_DATE - INTERVAL '30 days',
   12, 720, 1480,
   '2 of 4 ramps completed. Utility conflict at NW corner delayed final 2.',
   v_user_id, FALSE, NULL, NULL,
   NOW() - INTERVAL '3 months', NOW()),

  -- W9: Erosion stabilization — P2
  (w9, v_org_id, 'WO-2026-0107',
   'Slope Erosion Emergency Stabilization — Barrio Sonadora',
   'Active slope failure on municipal road in Barrio Sonadora following recent heavy rain. '
   'Approximately 15m of roadway undermined. Emergency geotextile and rip-rap placement needed.',
   'in_progress', 'P1', 'critical', v_user_id,
   CURRENT_DATE + INTERVAL '2 days',
   24, 1440, 3800,
   'Temporary road closure in place. Detour via Carr. 176 activated.',
   v_user_id, FALSE, NULL, NULL,
   NOW() - INTERVAL '1 day', NOW()),

  -- W10: Playground maintenance — P4
  (w10, v_org_id, 'WO-2026-0108',
   'Playground Equipment Repair — Parque Frailes',
   'Swing set chains broken (2 swings), slide handrail loose, rubber safety surface cracking '
   'in fall zone. Annual inspection revealed 3 deficiencies.',
   'open', 'P4', 'low', NULL,
   CURRENT_DATE + INTERVAL '30 days',
   0, 0, 0,
   NULL,
   v_user_id, FALSE, NULL, NULL,
   NOW() - INTERVAL '5 days', NOW()),

  -- W11: Graffiti removal — P4
  (w11, v_org_id, 'WO-2026-0109',
   'Graffiti Removal — Municipal Buildings (8 locations)',
   'Graffiti removal from 8 municipal building facades across Guaynabo. '
   'Pressure washing and anti-graffiti coating application.',
   'closed', 'P4', 'low', v_user_id,
   CURRENT_DATE - INTERVAL '10 days',
   16, 960, 380,
   'Completed 2026-03-18. Anti-graffiti coating applied.',
   v_user_id, FALSE, NULL, NULL,
   NOW() - INTERVAL '20 days', NOW()),

  -- W12: Hato Nuevo road — P2
  (w12, v_org_id, 'WO-2026-0110',
   'Pavement Marking Restoration — Hato Nuevo Access Road',
   'Reapplication of centerline, edge lines, and crosswalk markings on 1.2 km access road '
   'section in Hato Nuevo. Part of road widening project pre-work.',
   'open', 'P2', 'high', NULL,
   CURRENT_DATE + INTERVAL '10 days',
   0, 0, 0,
   'Coordinate with road widening project team before applying permanent markings.',
   v_user_id, FALSE, NULL, NULL,
   NOW() - INTERVAL '2 days', NOW());

  -- ============================================================
  -- POTHOLE REPORTS
  -- ============================================================
  INSERT INTO pothole_reports (id, org_id, number, title, description, defect_type,
    status, severity, pci_score, address, latitude, longitude,
    assigned_to, reported_by, is_recurring, recurrence_count,
    repair_cost, created_at, updated_at)
  VALUES

  (ph1, v_org_id, 'PH-2026-0101',
   'Deep pothole — PR-177 NB at Camarones (km 1.2)',
   'Large pothole, approximately 60cm x 45cm x 18cm. Rattle reported by bus drivers.',
   'pothole', 'assigned', 'critical', 28,
   'PR-177 Northbound, km 1.2, Barrio Camarones, Guaynabo',
   18.3651, -66.1069, v_user_id, v_user_id,
   TRUE, 3, 0, NOW() - INTERVAL '8 days', NOW()),

  (ph2, v_org_id, 'PH-2026-0102',
   'Pothole cluster — Calle Carazo at Barbosa intersection',
   'Three potholes within 10m radius at busy pedestrian crossing. Pedestrian tripped.',
   'pothole', 'verified', 'high', 42,
   'Calle Carazo at Calle Barbosa, Barrio Pueblo, Guaynabo',
   18.3722, -66.1105, NULL, v_user_id,
   TRUE, 2, 0, NOW() - INTERVAL '15 days', NOW()),

  (ph3, v_org_id, 'PH-2026-0103',
   'Alligator cracking — Ave. Las Cumbres (residential)',
   'Extensive alligator cracking over 25m section. Pavement structurally compromised.',
   'alligator_crack', 'verified', 'high', 35,
   'Ave. Las Cumbres km 0.8, Santa Rosa, Guaynabo',
   18.3819, -66.1301, NULL, v_user_id,
   FALSE, 0, 0, NOW() - INTERVAL '20 days', NOW()),

  (ph4, v_org_id, 'PH-2026-0104',
   'Pothole — PR-167 at Río barrio entrance',
   'Medium pothole at PR-167 / Calle Las Flores intersection. Drainage issue contributing.',
   'pothole', 'reported', 'medium', 55,
   'PR-167 at Calle Las Flores, Barrio Río, Guaynabo',
   18.3442, -66.0801, NULL, v_user_id,
   FALSE, 0, 0, NOW() - INTERVAL '3 days', NOW()),

  (ph5, v_org_id, 'PH-2026-0105',
   'Edge failure — Guaraguao school access road',
   'Right edge of pavement crumbling for 12m stretch. Narrow road; vehicles forced toward center.',
   'edge_failure', 'assigned', 'critical', 22,
   'Acceso Escuela, Barrio Guaraguao, Guaynabo',
   18.3478, -66.1502, v_user_id, v_user_id,
   TRUE, 4, 0, NOW() - INTERVAL '5 days', NOW()),

  (ph6, v_org_id, 'PH-2026-0106',
   'Subsidence — Calle Flamboyan, Mamey sector',
   'Road surface subsided approximately 8cm over 6m x 3m area. Likely broken sewer line below.',
   'subsidence', 'verified', 'critical', 18,
   'Calle Flamboyan, Barrio Mamey, Guaynabo',
   18.3368, -66.1195, NULL, v_user_id,
   FALSE, 0, 0, NOW() - INTERVAL '6 days', NOW()),

  (ph7, v_org_id, 'PH-2026-0107',
   'Multiple potholes — Barrio Sonadora access road',
   '7 potholes on 200m stretch of access road in Sonadora. Chronic issue after each rain event.',
   'pothole', 'recurring', 'high', 31,
   'Acceso Barrio Sonadora, Carr. 176, Guaynabo',
   18.3228, -66.1418, v_user_id, v_user_id,
   TRUE, 6, 0, NOW() - INTERVAL '14 days', NOW()),

  (ph8, v_org_id, 'PH-2025-0401',
   'Repaired — Pothole on Carr. 830 (Frailes)',
   'Pothole on Carr. 830 at Frailes entrance. Repaired as part of Q4 2025 maintenance cycle.',
   'pothole', 'repaired', 'medium', 72,
   'Carr. 830, Barrio Frailes, Guaynabo',
   18.3927, -66.1087, v_user_id, v_user_id,
   FALSE, 0, 1200, NOW() - INTERVAL '90 days', NOW()),

  (ph9, v_org_id, 'PH-2026-0108',
   'Linear crack — Hato Nuevo main road',
   'Longitudinal crack 18m long on centerline. No immediate structural hazard but requires sealing.',
   'linear_crack', 'reported', 'medium', 61,
   'Calle Principal, Barrio Hato Nuevo, Guaynabo',
   18.3252, -66.0912, NULL, v_user_id,
   FALSE, 0, 0, NOW() - INTERVAL '4 days', NOW()),

  (ph10, v_org_id, 'PH-2026-0109',
   'Pothole — Ave. Los Prados (near school)',
   'School zone pothole. Vehicle damage reported by parent. P1 due to location.',
   'pothole', 'assigned', 'critical', 25,
   'Ave. Los Prados near Escuela, Barrio Camarones, Guaynabo',
   18.3612, -66.1048, v_user_id, v_user_id,
   TRUE, 2, 0, NOW() - INTERVAL '2 days', NOW()),

  (ph11, v_org_id, 'PH-2026-0110',
   'Rutting — Pueblo Viejo connector road',
   'Wheel track rutting of 3–5cm depth over 40m section. Heavy truck traffic suspected cause.',
   'rutting', 'verified', 'medium', 48,
   'Carr. 21, Barrio Pueblo Viejo, Guaynabo',
   18.4128, -66.1075, NULL, v_user_id,
   FALSE, 0, 0, NOW() - INTERVAL '10 days', NOW()),

  (ph12, v_org_id, 'PH-2026-0111',
   'Pothole — Santa Rosa residential street',
   'Residential street pothole near drainage inlet. Water pooling makes it invisible during rain.',
   'pothole', 'reported', 'low', 63,
   'Urb. Santa Rosa, Calle 5, Guaynabo',
   18.3835, -66.1388, NULL, v_user_id,
   FALSE, 0, 0, NOW() - INTERVAL '1 day', NOW()),

  (ph13, v_org_id, 'PH-2025-0402',
   'Repaired — Major pothole cluster, Barrio Río',
   'Emergency repair of 4-pothole cluster on PR-167. Completed Oct 2025.',
   'pothole', 'closed', 'high', 78,
   'PR-167, Barrio Río, Guaynabo',
   18.3455, -66.0775, v_user_id, v_user_id,
   TRUE, 3, 3400, NOW() - INTERVAL '6 months', NOW()),

  (ph14, v_org_id, 'PH-2026-0112',
   'Surface deterioration — Carr. 177 service road (Frailes)',
   'General surface oxidation and raveling over 80m section. Aggregate loss noted.',
   'surface_deterioration', 'reported', 'medium', 52,
   'Carr. 177 service road, Frailes sector, Guaynabo',
   18.3958, -66.1118, NULL, v_user_id,
   FALSE, 0, 0, NOW() - INTERVAL '7 days', NOW()),

  (ph15, v_org_id, 'PH-2026-0113',
   'Deep pothole — Barrio Guaraguao near PR-2',
   'Utility cut poorly restored. Pothole above previous repair. Third occurrence.',
   'pothole', 'recurring', 'high', 30,
   'Calle acceso, Barrio Guaraguao near PR-2, Guaynabo',
   18.3495, -66.1455, v_user_id, v_user_id,
   TRUE, 5, 0, NOW() - INTERVAL '9 days', NOW());

  -- ============================================================
  -- INSPECTIONS
  -- ============================================================
  INSERT INTO inspections (id, org_id, number, title, project_id, work_order_id,
    status, inspector_id, score, scheduled_at, started_at, completed_at,
    latitude, longitude, address, notes, created_by, created_at, updated_at)
  VALUES

  (i1, v_org_id, 'IN-2026-0101',
   'PR-177 Resurfacing — Phase 1 Progress Inspection',
   p1, NULL, 'completed', v_user_id, 72,
   NOW() - INTERVAL '20 days',
   NOW() - INTERVAL '20 days',
   NOW() - INTERVAL '20 days',
   18.3651, -66.1072,
   'PR-177 km 0.5 to km 1.8, Barrio Camarones',
   'Phase 1 milling complete. Tack coat applied. Base course compaction density tests: 93% (AASHTO T-99). '
   'Surface course delayed by rain events. Recommend monitoring compaction at station 12+50.',
   v_user_id, NOW() - INTERVAL '20 days', NOW()),

  (i2, v_org_id, 'IN-2026-0102',
   'ADA Sidewalk — Sector A Progress Inspection',
   p4, w8, 'completed', v_user_id, 85,
   NOW() - INTERVAL '45 days',
   NOW() - INTERVAL '45 days',
   NOW() - INTERVAL '45 days',
   18.3827, -66.1352,
   'Ave. San Miguel, Sector A (km 0.0–1.2)',
   'Sector A construction substantially complete. 3 minor deficiencies: (1) detectable warning '
   'surface color insufficient contrast at Sta. 4+20; (2) running slope exceeds 5% at Sta. 7+15; '
   '(3) landing at mailbox cluster non-compliant. Contractor notified for correction.',
   v_user_id, NOW() - INTERVAL '45 days', NOW()),

  (i3, v_org_id, 'IN-2026-0103',
   'Camarones Stormwater — Pipe Installation QC',
   p9, NULL, 'completed', v_user_id, 91,
   NOW() - INTERVAL '30 days',
   NOW() - INTERVAL '30 days',
   NOW() - INTERVAL '30 days',
   18.3625, -66.1065,
   'Carr. 165, Barrio Camarones (Stations 0+00 to 12+40)',
   'Pipe bedding and haunching per SSPWC specs. Joint deflection within limits. '
   'Mandrel test passed on all installed sections. Trench backfill compaction: 95% max density.',
   v_user_id, NOW() - INTERVAL '30 days', NOW()),

  (i4, v_org_id, 'IN-2026-0104',
   'Frailes Park — Playground Equipment Installation Inspection',
   p2, NULL, 'in_progress', v_user_id, NULL,
   CURRENT_DATE + INTERVAL '3 days',
   NULL, NULL,
   18.3938, -66.1102,
   'Parque Comunal de Frailes',
   'Scheduled for equipment acceptance inspection. ASTM F1292 impact attenuation test pending.',
   v_user_id, NOW() - INTERVAL '2 days', NOW()),

  (i5, v_org_id, 'IN-2026-0105',
   'Sonadora Community Center — Final Acceptance',
   p10, NULL, 'approved', v_user_id, 96,
   NOW() - INTERVAL '80 days',
   NOW() - INTERVAL '80 days',
   NOW() - INTERVAL '78 days',
   18.3225, -66.1422,
   'Carr. 176, Barrio Sonadora',
   'Final walk-through. All punch list items resolved. Building systems functional. '
   'Roof membrane water test passed. CO issued 2025-10-08. Excellent contractor performance.',
   v_user_id, NOW() - INTERVAL '80 days', NOW()),

  (i6, v_org_id, 'IN-2026-0106',
   'Bridge Safety Inspection — Puente Quebrada Maracaibo',
   NULL, w5, 'draft', NULL, NULL,
   CURRENT_DATE + INTERVAL '14 days',
   NULL, NULL,
   18.3372, -66.1225,
   'Puente Quebrada Maracaibo, Barrio Mamey',
   'DTOP biennial bridge inspection. Assign licensed bridge inspector. '
   'Last inspection rating: 42.1 (sufficiency rating). Expected to require load posting.',
   v_user_id, NOW() - INTERVAL '3 days', NOW());

  -- ============================================================
  -- INSPECTION CHECKLIST ITEMS (for completed inspections)
  -- ============================================================

  -- Checklist for i1 (PR-177 Progress — score 72)
  INSERT INTO inspection_checklist_items
    (id, inspection_id, org_id, item_number, category, description, result, severity, notes)
  VALUES
  (gen_random_uuid(), i1, v_org_id, 1, 'Pavement', 'Milling depth verification (design: 50mm)', 'pass', 'major', NULL),
  (gen_random_uuid(), i1, v_org_id, 2, 'Pavement', 'Base course compaction density ≥ 92%', 'pass', 'major', '93% achieved'),
  (gen_random_uuid(), i1, v_org_id, 3, 'Pavement', 'Tack coat application rate (0.09–0.14 L/m²)', 'pass', 'minor', NULL),
  (gen_random_uuid(), i1, v_org_id, 4, 'Pavement', 'Surface course smoothness (IRI ≤ 2.5 m/km)', 'fail', 'major', 'Surface course not yet placed — delayed by rain'),
  (gen_random_uuid(), i1, v_org_id, 5, 'Drainage', 'Inlet grades maintained during construction', 'pass', 'minor', NULL),
  (gen_random_uuid(), i1, v_org_id, 6, 'Safety', 'Traffic control plan in effect per MUTCD', 'pass', 'critical', NULL),
  (gen_random_uuid(), i1, v_org_id, 7, 'Safety', 'Construction zone signage adequate', 'pass', 'major', NULL),
  (gen_random_uuid(), i1, v_org_id, 8, 'ADA', 'Curb ramp forms and rebar placed correctly', 'fail', 'major', '2 ramps at Sta. 8+40 need rebar adjustment'),
  (gen_random_uuid(), i1, v_org_id, 9, 'Materials', 'Asphalt mix design approved (JMF on file)', 'pass', 'major', NULL),
  (gen_random_uuid(), i1, v_org_id, 10, 'Documentation', 'Daily inspector reports current', 'pass', 'minor', NULL);

  -- Checklist for i5 (Sonadora Final — score 96)
  INSERT INTO inspection_checklist_items
    (id, inspection_id, org_id, item_number, category, description, result, severity, notes)
  VALUES
  (gen_random_uuid(), i5, v_org_id, 1, 'Structural', 'Roof membrane integrity (water test)', 'pass', 'critical', 'Passed 24hr flood test'),
  (gen_random_uuid(), i5, v_org_id, 2, 'Electrical', '200A panel installation per NEC', 'pass', 'critical', NULL),
  (gen_random_uuid(), i5, v_org_id, 3, 'Mechanical', 'HVAC system functional and balanced', 'pass', 'major', NULL),
  (gen_random_uuid(), i5, v_org_id, 4, 'Plumbing', 'ADA restroom fixtures and clearances', 'pass', 'major', NULL),
  (gen_random_uuid(), i5, v_org_id, 5, 'Finishes', 'Exterior painting complete and uniform', 'pass', 'minor', NULL),
  (gen_random_uuid(), i5, v_org_id, 6, 'ADA', 'Accessible parking spaces and signage', 'pass', 'major', NULL),
  (gen_random_uuid(), i5, v_org_id, 7, 'Safety', 'Fire extinguisher placement and access', 'pass', 'critical', NULL),
  (gen_random_uuid(), i5, v_org_id, 8, 'Punch List', 'All punch list items from prior inspection resolved', 'pass', 'major', NULL),
  (gen_random_uuid(), i5, v_org_id, 9, 'Documentation', 'As-built drawings submitted', 'fail', 'minor', 'As-builts received but not yet stamped by EOR'),
  (gen_random_uuid(), i5, v_org_id, 10, 'Documentation', 'O&M manuals delivered', 'pass', 'minor', NULL);

  RAISE NOTICE 'Mock data inserted successfully for org_id = %', v_org_id;

END $$;
