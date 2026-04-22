-- Migration 013: Add project_id to work_orders, enrich mock data
-- 1. Add project_id column
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS work_orders_project_id_idx ON work_orders(project_id);

-- 2. Link existing work orders to projects
-- We need the actual UUIDs — do it by number cross-reference
UPDATE work_orders wo
SET project_id = p.id
FROM projects p
WHERE p.number = 'PJ-2025-0101'
  AND wo.number IN ('WO-2026-0101');

UPDATE work_orders wo
SET project_id = p.id
FROM projects p
WHERE p.number = 'PJ-2025-0102'
  AND wo.number IN ('WO-2026-0108');

UPDATE work_orders wo
SET project_id = p.id
FROM projects p
WHERE p.number = 'PJ-2025-0103'
  AND wo.number IN ('WO-2026-0106');

UPDATE work_orders wo
SET project_id = p.id
FROM projects p
WHERE p.number = 'PJ-2025-0104'
  AND wo.number IN ('WO-2025-0402');

UPDATE work_orders wo
SET project_id = p.id
FROM projects p
WHERE p.number = 'PJ-2025-0105'
  AND wo.number IN ('WO-2025-0401', 'WO-2026-0104');

UPDATE work_orders wo
SET project_id = p.id
FROM projects p
WHERE p.number = 'PJ-2025-0106'
  AND wo.number IN ('WO-2026-0103');

UPDATE work_orders wo
SET project_id = p.id
FROM projects p
WHERE p.number = 'PJ-2025-0107'
  AND wo.number IN ('WO-2026-0107');

UPDATE work_orders wo
SET project_id = p.id
FROM projects p
WHERE p.number = 'PJ-2026-0101'
  AND wo.number IN ('WO-2026-0105');

UPDATE work_orders wo
SET project_id = p.id
FROM projects p
WHERE p.number = 'PJ-2026-0103'
  AND wo.number IN ('WO-2026-0110');

-- 3. Add additional work orders to make projects richer
-- First get the org_id and a user id for created_by
DO $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_pj0101 uuid;
  v_pj0102 uuid;
  v_pj0103 uuid;
  v_pj0104 uuid;
  v_pj0105 uuid;
  v_pj0106 uuid;
  v_pj0107 uuid;
  v_pj0201 uuid;
  v_pj0202 uuid;
  v_pj0203 uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM user_roles LIMIT 1;
  SELECT user_id INTO v_user_id FROM user_roles WHERE role = 'admin' LIMIT 1;

  SELECT id INTO v_pj0101 FROM projects WHERE number = 'PJ-2025-0101';
  SELECT id INTO v_pj0102 FROM projects WHERE number = 'PJ-2025-0102';
  SELECT id INTO v_pj0103 FROM projects WHERE number = 'PJ-2025-0103';
  SELECT id INTO v_pj0104 FROM projects WHERE number = 'PJ-2025-0104';
  SELECT id INTO v_pj0105 FROM projects WHERE number = 'PJ-2025-0105';
  SELECT id INTO v_pj0106 FROM projects WHERE number = 'PJ-2025-0106';
  SELECT id INTO v_pj0107 FROM projects WHERE number = 'PJ-2025-0107';
  SELECT id INTO v_pj0201 FROM projects WHERE number = 'PJ-2026-0101';
  SELECT id INTO v_pj0202 FROM projects WHERE number = 'PJ-2026-0102';
  SELECT id INTO v_pj0203 FROM projects WHERE number = 'PJ-2026-0103';

  -- PJ-2025-0101 PR-177 Resurfacing — add 3 more WOs
  INSERT INTO work_orders (org_id, number, title, description, status, priority, project_id, due_date, labor_hours, labor_cost, materials_cost, total_cost, latitude, longitude, created_by)
  VALUES
    (v_org_id, 'WO-2026-0111', 'Milling & Base Course Prep — PR-177 Km 3.2–5.8',
      'Remove existing asphalt and prepare granular base course for resurfacing. Includes crack sealing of adjacent lanes.',
      'in_progress', 'P2', v_pj0101, '2026-05-15', 48, 7200.00, 18500.00, 25700.00,
      18.3888, -66.1103, v_user_id),
    (v_org_id, 'WO-2026-0112', 'Thermoplastic Lane Marking — PR-177 Km 3.2–5.8',
      'Apply new thermoplastic pavement markings after resurfacing: center lines, edge lines, turn arrows, and pedestrian crossings.',
      'open', 'P3', v_pj0101, '2026-06-10', 16, 2400.00, 4100.00, 6500.00,
      18.3892, -66.1095, v_user_id),
    (v_org_id, 'WO-2026-0113', 'Guardrail Inspection & Repair — PR-177 Hillside Section',
      'Inspect all W-beam guardrail segments. Replace damaged end terminals and re-anchor any loose posts.',
      'open', 'P3', v_pj0101, '2026-05-30', 12, 1800.00, 3200.00, 5000.00,
      18.3901, -66.1078, v_user_id)
  ON CONFLICT (number) DO NOTHING;

  -- PJ-2025-0102 Frailes Community Park — add 2 more WOs
  INSERT INTO work_orders (org_id, number, title, description, status, priority, project_id, due_date, labor_hours, labor_cost, materials_cost, total_cost, latitude, longitude, created_by)
  VALUES
    (v_org_id, 'WO-2026-0114', 'Basketball Court Resurfacing — Parque Frailes',
      'Apply acrylic sport coating to basketball courts, repaint lines and three-point arcs.',
      'open', 'P3', v_pj0102, '2026-06-01', 20, 3000.00, 5500.00, 8500.00,
      18.3752, -66.1158, v_user_id),
    (v_org_id, 'WO-2026-0115', 'Irrigation System Installation — Parque Frailes',
      'Install automated drip irrigation for new landscaping areas. Includes water meter tap and controller programming.',
      'in_progress', 'P2', v_pj0102, '2026-05-20', 30, 4500.00, 8900.00, 13400.00,
      18.3748, -66.1162, v_user_id)
  ON CONFLICT (number) DO NOTHING;

  -- PJ-2025-0103 Pueblo Viejo Water Main — add 2 more WOs
  INSERT INTO work_orders (org_id, number, title, description, status, priority, project_id, due_date, labor_hours, labor_cost, materials_cost, total_cost, latitude, longitude, created_by, blocked, blocked_by, blocked_by_reason, blocked_since)
  VALUES
    (v_org_id, 'WO-2026-0116', 'Trench Excavation — Pueblo Viejo Main (Phase 2)',
      'Excavate 650 LF of trench along Calle Pueblo Viejo for 8" ductile iron water main replacement.',
      'on_hold', 'P1', v_pj0103, '2026-05-01', 0, 0, 0, 0,
      18.3712, -66.1040, v_user_id, true, 'PRASA',
      'PRASA coordination required before excavation permit can be issued — water service transfer pending',
      '2026-03-12'),
    (v_org_id, 'WO-2026-0117', 'Valve Replacement — Pueblo Viejo Distribution Nodes',
      'Replace 6 gate valves and 2 butterfly valves throughout the Pueblo Viejo distribution loop.',
      'open', 'P2', v_pj0103, '2026-06-15', 24, 3600.00, 12400.00, 16000.00,
      18.3705, -66.1048, v_user_id, false, null, null, null)
  ON CONFLICT (number) DO NOTHING;

  -- PJ-2025-0104 ADA Sidewalk — add 2 more WOs
  INSERT INTO work_orders (org_id, number, title, description, status, priority, project_id, due_date, labor_hours, labor_cost, materials_cost, total_cost, latitude, longitude, created_by)
  VALUES
    (v_org_id, 'WO-2026-0118', 'Sidewalk Panel Replacement — Ave. San Miguel Sector A',
      'Remove and replace 42 non-compliant concrete sidewalk panels. New panels to meet PROWAG cross-slope ≤2% requirement.',
      'in_progress', 'P2', v_pj0104, '2026-05-28', 56, 8400.00, 11200.00, 19600.00,
      18.3834, -66.1181, v_user_id),
    (v_org_id, 'WO-2026-0119', 'Detectable Warning Surface Installation — Ave. San Miguel',
      'Install federal yellow truncated dome tactile strips at 18 curb ramp locations along Ave. San Miguel corridor.',
      'open', 'P3', v_pj0104, '2026-06-20', 18, 2700.00, 3600.00, 6300.00,
      18.3841, -66.1177, v_user_id)
  ON CONFLICT (number) DO NOTHING;

  -- PJ-2025-0105 PR-167 Flooding — add 2 more WOs
  INSERT INTO work_orders (org_id, number, title, description, status, priority, project_id, due_date, labor_hours, labor_cost, materials_cost, total_cost, latitude, longitude, created_by)
  VALUES
    (v_org_id, 'WO-2026-0120', 'Culvert Extension — PR-167 Km 1.4 Creek Crossing',
      'Extend existing 36" RCP culvert by 15 LF to handle 25-year storm flow. Install concrete headwalls and endwalls.',
      'in_progress', 'P1', v_pj0105, '2026-04-30', 40, 6000.00, 22000.00, 28000.00,
      18.3668, -66.0921, v_user_id),
    (v_org_id, 'WO-2026-0121', 'Riprap Erosion Protection — PR-167 Outfall Zones',
      'Place Class B riprap at 4 outfall locations to prevent channel scour and embankment erosion.',
      'open', 'P2', v_pj0105, '2026-05-25', 28, 4200.00, 9800.00, 14000.00,
      18.3660, -66.0915, v_user_id)
  ON CONFLICT (number) DO NOTHING;

  -- PJ-2025-0106 Camarones Stormwater — add 2 more WOs
  INSERT INTO work_orders (org_id, number, title, description, status, priority, project_id, due_date, labor_hours, labor_cost, materials_cost, total_cost, latitude, longitude, created_by)
  VALUES
    (v_org_id, 'WO-2026-0122', 'Inlet Grate Replacement — Camarones Storm System',
      'Replace 18 corroded and damaged storm drain inlet grates. Install bicycle-safe parallel-bar grates per AASHTO.',
      'in_progress', 'P2', v_pj0106, '2026-05-10', 22, 3300.00, 7200.00, 10500.00,
      18.4001, -66.1055, v_user_id),
    (v_org_id, 'WO-2026-0123', 'Detention Pond Dredging — Camarones Retention Basin',
      'Remove 380 CY of accumulated sediment from retention basin. Dispose at approved landfill. Restore design capacity.',
      'open', 'P1', v_pj0106, '2026-06-30', 60, 9000.00, 14500.00, 23500.00,
      18.4010, -66.1048, v_user_id)
  ON CONFLICT (number) DO NOTHING;

  -- PJ-2025-0107 Sonadora Community Center — add 2 more WOs
  INSERT INTO work_orders (org_id, number, title, description, status, priority, project_id, due_date, labor_hours, labor_cost, materials_cost, total_cost, latitude, longitude, created_by)
  VALUES
    (v_org_id, 'WO-2026-0124', 'Roof Membrane Replacement — Sonadora Community Center',
      'Remove and replace 4,200 SF of failed TPO roofing membrane. Install new 60-mil reinforced membrane with 20-year warranty.',
      'in_progress', 'P1', v_pj0107, '2026-05-05', 80, 12000.00, 34000.00, 46000.00,
      18.3578, -66.0842, v_user_id),
    (v_org_id, 'WO-2026-0125', 'HVAC Replacement — Sonadora Community Center',
      'Replace 3 aging split systems (5-ton, 3-ton, 2-ton). Install new inverter-type units with programmable thermostats.',
      'open', 'P2', v_pj0107, '2026-06-01', 32, 4800.00, 18700.00, 23500.00,
      18.3582, -66.0839, v_user_id)
  ON CONFLICT (number) DO NOTHING;

  -- PJ-2026-0101 Guaraguao School Zone — add 2 more WOs
  INSERT INTO work_orders (org_id, number, title, description, status, priority, project_id, due_date, labor_hours, labor_cost, materials_cost, total_cost, latitude, longitude, created_by)
  VALUES
    (v_org_id, 'WO-2026-0126', 'RRFB Pedestrian Beacon Installation — Guaraguao School',
      'Install 2 Rectangular Rapid Flash Beacon assemblies at main school entrance crosswalks. Includes solar power and sign posts.',
      'open', 'P2', v_pj0201, '2026-05-15', 16, 2400.00, 14600.00, 17000.00,
      18.3891, -66.0988, v_user_id),
    (v_org_id, 'WO-2026-0127', 'Speed Table Installation — Guaraguao School Zone',
      'Construct 2 raised speed tables at school zone entrances. Asphalt construction with thermoplastic markings.',
      'open', 'P3', v_pj0201, '2026-06-15', 24, 3600.00, 8200.00, 11800.00,
      18.3886, -66.0994, v_user_id)
  ON CONFLICT (number) DO NOTHING;

  -- PJ-2026-0202 Mamey Sports Complex — add 3 new WOs
  INSERT INTO work_orders (org_id, number, title, description, status, priority, project_id, due_date, labor_hours, labor_cost, materials_cost, total_cost, latitude, longitude, created_by)
  VALUES
    (v_org_id, 'WO-2026-0128', 'Site Grading & Drainage — Mamey Sports Complex',
      'Mass earthwork: cut/fill 2,800 CY to achieve design grades. Install perimeter drainage swales and outlet structures.',
      'in_progress', 'P1', v_pj0202, '2026-07-01', 120, 18000.00, 32000.00, 50000.00,
      18.4088, -66.0894, v_user_id),
    (v_org_id, 'WO-2026-0129', 'Synthetic Turf Field Installation — Mamey Sports Complex',
      'Install 80,000 SF of FIFA-quality synthetic turf on main multi-use field. Includes shock pad and crumb rubber infill.',
      'open', 'P1', v_pj0202, '2026-08-15', 0, 0, 0, 0,
      18.4092, -66.0891, v_user_id),
    (v_org_id, 'WO-2026-0130', 'Perimeter Fencing & Lighting — Mamey Sports Complex',
      'Install 650 LF of 8-ft chain link perimeter fence and 8 sports lighting poles (1500W LED each).',
      'open', 'P2', v_pj0202, '2026-08-30', 0, 0, 0, 0,
      18.4085, -66.0899, v_user_id)
  ON CONFLICT (number) DO NOTHING;

  -- PJ-2026-0203 Hato Nuevo Road Widening — add 2 new WOs
  INSERT INTO work_orders (org_id, number, title, description, status, priority, project_id, due_date, labor_hours, labor_cost, materials_cost, total_cost, latitude, longitude, created_by)
  VALUES
    (v_org_id, 'WO-2026-0131', 'Right-of-Way Clearing — Hato Nuevo PR-30 Access Road',
      'Clear and grub 1.2 acres of vegetation within proposed ROW. Remove 14 trees ≥6" DBH, stump grind, and haul debris.',
      'completed', 'P2', v_pj0203, '2026-03-15', 40, 6000.00, 3500.00, 9500.00,
      18.3629, -66.1208, v_user_id),
    (v_org_id, 'WO-2026-0132', 'Subbase Construction — Hato Nuevo Road Widening',
      'Place and compact 6" crushed stone subbase for 1,800 LF of road widening. Density testing every 500 LF.',
      'in_progress', 'P1', v_pj0203, '2026-05-01', 64, 9600.00, 24500.00, 34100.00,
      18.3635, -66.1202, v_user_id)
  ON CONFLICT (number) DO NOTHING;

END $$;

-- 4. Enrich existing project descriptions and actual_cost
UPDATE projects SET
  description = 'Full-depth reclamation and asphalt overlay of PR-177 from the Guaynabo municipal boundary to the Las Cumbres interchange, approximately 4.2 km. Scope includes milling, base repair, 2-inch overlay, new guardrails, drainage improvements, and thermoplastic pavement markings.',
  actual_cost = 287500.00,
  budget = 380000.00
WHERE number = 'PJ-2025-0101';

UPDATE projects SET
  description = 'Complete renovation of the Frailes neighborhood park including new playground equipment (ADA-compliant), basketball court resurfacing, irrigation system, landscaping, perimeter lighting, and a covered picnic pavilion.',
  actual_cost = 156800.00,
  budget = 195000.00
WHERE number = 'PJ-2025-0102';

UPDATE projects SET
  description = 'Replacement of 1,200 LF of aging asbestos-cement water main with 8" ductile iron pipe in the Pueblo Viejo sector. Includes 12 service lateral reconnections, valve replacements, and full trench restoration. Coordination with PRASA required.',
  actual_cost = 198400.00,
  budget = 245000.00
WHERE number = 'PJ-2025-0103';

UPDATE projects SET
  description = 'ADA Title II compliance improvements along a 1.8 km stretch of Ave. San Miguel. Scope includes 42 sidewalk panel replacements, 18 curb ramp reconstructions, detectable warning surfaces, and accessible pedestrian signal upgrades at 4 intersections.',
  actual_cost = 89200.00,
  budget = 128000.00
WHERE number = 'PJ-2025-0104';

UPDATE projects SET
  description = 'Flood mitigation improvements along the PR-167 corridor through Barrio Río. Includes culvert upsizing at 2 creek crossings, detention basin grading, riprap erosion protection, and emergency warning signage. Project is response to 2024 flood event that damaged 8 residential properties.',
  actual_cost = 312000.00,
  budget = 340000.00
WHERE number = 'PJ-2025-0105';

UPDATE projects SET
  description = 'Upgrade of the Camarones sector storm drainage network. Phase 1 covers inlet grate replacement, catch basin rehabilitation, and detention pond dredging. Phase 2 (future) will install a 36" trunk main to bypass the existing undersized system.',
  actual_cost = 134500.00,
  budget = 180000.00
WHERE number = 'PJ-2025-0106';

UPDATE projects SET
  description = 'Rehabilitation of the Sonadora Community Center, a 12,000 SF municipal facility serving 3,200 residents. Priority improvements: roof replacement, HVAC modernization, electrical panel upgrade, and interior renovation of two multi-purpose rooms.',
  actual_cost = 267000.00,
  budget = 320000.00
WHERE number = 'PJ-2025-0107';

UPDATE projects SET
  description = 'Pedestrian safety improvements in the school zone serving 1,400 students at Escuela Guaraguao. Includes RRFB beacons at crosswalks, raised speed tables, LED school zone flashers, and enhanced pavement markings.',
  actual_cost = 45800.00,
  budget = 98000.00
WHERE number = 'PJ-2026-0101';

UPDATE projects SET
  description = 'New multi-use sports complex in Barrio Mamey serving youth and adult recreation. Phase 1 includes one synthetic turf field, one basketball court, and perimeter fencing and lighting. Future phases add a baseball diamond and covered bleachers.',
  actual_cost = 0,
  budget = 1250000.00
WHERE number = 'PJ-2026-0102';

UPDATE projects SET
  description = 'Widening and safety improvements to the Hato Nuevo access road connecting PR-30 to the industrial sector. Adds a third lane for turn movements, improves sight distance at the main intersection, and installs a raised median.',
  actual_cost = 89600.00,
  budget = 520000.00
WHERE number = 'PJ-2026-0103';
