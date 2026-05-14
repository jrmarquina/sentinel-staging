-- =============================================================
-- Migration 040: Facility Condition Assessment (FCA) template seed
-- =============================================================
-- Template ID : 20000000-0000-0000-0000-000000000001
-- Org ID      : 00000000-0000-0000-0000-000000000001 (Guaynabo)
--
-- Section breakdown and field count
-- ----------------------------------------------------------
-- A. General Building Information      gi_01–gi_06          6 fields  (all unconditional)
-- B. Site and Grounds                  si_01–si_12         12 fields  (3 components × 4)
-- C. Building Envelope                 be_01–be_20         20 fields  (5 components × 4)
-- D. Structural Systems                st_01–st_16         16 fields  (4 components × 4)
-- E. Mechanical — HVAC                 hv_i1, hv_01–hv_16  17 fields  (1 unconditional + 4 components × 4)
-- F. Plumbing                          pl_01–pl_16         16 fields  (4 components × 4)
-- G. Electrical                        el_01–el_16         16 fields  (4 components × 4)
-- H. Life Safety Systems               ls_01–ls_20         20 fields  (5 components × 4)
-- I. Interior Finishes                 in_01–in_20         20 fields  (5 components × 4)
-- J. ADA / Accessibility               ad_01–ad_16         16 fields  (4 components × 4)
-- K. Overall Assessment                oa_01–oa_04          4 fields  (all unconditional)
-- ----------------------------------------------------------
-- Total                                                    163 fields
-- =============================================================

INSERT INTO fm_inspection_templates (id, org_id, name, description, json_schema)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Facility Condition Assessment (FCA)',
  'Comprehensive assessment of facility condition across site, envelope, structural, mechanical, plumbing, electrical, life safety, interior finishes, and accessibility systems. Produces a deferred maintenance estimate and priority recommendations.',
  '{
    "fields": [

      {
        "id": "gi_01",
        "label": "Facility name and address",
        "type": "TEXT"
      },
      {
        "id": "gi_02",
        "label": "Year of original construction",
        "type": "NUMBER"
      },
      {
        "id": "gi_03",
        "label": "Building use and occupancy type",
        "type": "TEXT"
      },
      {
        "id": "gi_04",
        "label": "Gross floor area (sq ft)",
        "type": "NUMBER"
      },
      {
        "id": "gi_05",
        "label": "Number of stories",
        "type": "NUMBER"
      },
      {
        "id": "gi_06",
        "label": "Construction type (e.g. masonry, wood frame, steel)",
        "type": "TEXT"
      },

      {
        "id": "si_01c",
        "label": "Paving and parking areas are in acceptable condition",
        "type": "PASS_FAIL"
      },
      {
        "id": "si_01d",
        "label": "Describe the paving or parking deficiency",
        "type": "TEXT",
        "show_if": { "field": "si_01c", "answer": "FAIL" }
      },
      {
        "id": "si_01u",
        "label": "Paving repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "si_01c", "answer": "FAIL" }
      },
      {
        "id": "si_01e",
        "label": "Estimated paving repair or replacement cost",
        "type": "TEXT",
        "show_if": { "field": "si_01c", "answer": "FAIL" }
      },

      {
        "id": "si_02c",
        "label": "Site drainage is functioning acceptably with no ponding or erosion",
        "type": "PASS_FAIL"
      },
      {
        "id": "si_02d",
        "label": "Describe the site drainage deficiency",
        "type": "TEXT",
        "show_if": { "field": "si_02c", "answer": "FAIL" }
      },
      {
        "id": "si_02u",
        "label": "Site drainage repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "si_02c", "answer": "FAIL" }
      },
      {
        "id": "si_02e",
        "label": "Estimated site drainage repair cost",
        "type": "TEXT",
        "show_if": { "field": "si_02c", "answer": "FAIL" }
      },

      {
        "id": "si_03c",
        "label": "Perimeter fencing and security elements are in acceptable condition",
        "type": "PASS_FAIL"
      },
      {
        "id": "si_03d",
        "label": "Describe the fencing or security deficiency",
        "type": "TEXT",
        "show_if": { "field": "si_03c", "answer": "FAIL" }
      },
      {
        "id": "si_03u",
        "label": "Fencing or security repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "si_03c", "answer": "FAIL" }
      },
      {
        "id": "si_03e",
        "label": "Estimated fencing or security repair cost",
        "type": "TEXT",
        "show_if": { "field": "si_03c", "answer": "FAIL" }
      },

      {
        "id": "be_01c",
        "label": "Roof system is in acceptable condition with no active leaks or significant deterioration",
        "type": "PASS_FAIL"
      },
      {
        "id": "be_01d",
        "label": "Describe the roof system deficiency",
        "type": "TEXT",
        "show_if": { "field": "be_01c", "answer": "FAIL" }
      },
      {
        "id": "be_01u",
        "label": "Roof system repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "be_01c", "answer": "FAIL" }
      },
      {
        "id": "be_01e",
        "label": "Estimated roof repair or replacement cost",
        "type": "TEXT",
        "show_if": { "field": "be_01c", "answer": "FAIL" }
      },

      {
        "id": "be_02c",
        "label": "Exterior walls are in acceptable condition with no significant cracking, spalling, or water infiltration",
        "type": "PASS_FAIL"
      },
      {
        "id": "be_02d",
        "label": "Describe the exterior wall deficiency",
        "type": "TEXT",
        "show_if": { "field": "be_02c", "answer": "FAIL" }
      },
      {
        "id": "be_02u",
        "label": "Exterior wall repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "be_02c", "answer": "FAIL" }
      },
      {
        "id": "be_02e",
        "label": "Estimated exterior wall repair cost",
        "type": "TEXT",
        "show_if": { "field": "be_02c", "answer": "FAIL" }
      },

      {
        "id": "be_03c",
        "label": "Windows and glazing are in acceptable condition with no broken panes, failed seals, or operation problems",
        "type": "PASS_FAIL"
      },
      {
        "id": "be_03d",
        "label": "Describe the window or glazing deficiency",
        "type": "TEXT",
        "show_if": { "field": "be_03c", "answer": "FAIL" }
      },
      {
        "id": "be_03u",
        "label": "Window or glazing repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "be_03c", "answer": "FAIL" }
      },
      {
        "id": "be_03e",
        "label": "Estimated window or glazing repair cost",
        "type": "TEXT",
        "show_if": { "field": "be_03c", "answer": "FAIL" }
      },

      {
        "id": "be_04c",
        "label": "Exterior doors and entrances are in acceptable condition and operate properly",
        "type": "PASS_FAIL"
      },
      {
        "id": "be_04d",
        "label": "Describe the exterior door or entrance deficiency",
        "type": "TEXT",
        "show_if": { "field": "be_04c", "answer": "FAIL" }
      },
      {
        "id": "be_04u",
        "label": "Exterior door or entrance repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "be_04c", "answer": "FAIL" }
      },
      {
        "id": "be_04e",
        "label": "Estimated exterior door or entrance repair cost",
        "type": "TEXT",
        "show_if": { "field": "be_04c", "answer": "FAIL" }
      },

      {
        "id": "be_05c",
        "label": "Weather sealing and caulking are in acceptable condition with no gaps, cracks, or missing material",
        "type": "PASS_FAIL"
      },
      {
        "id": "be_05d",
        "label": "Describe the weather sealing or caulking deficiency",
        "type": "TEXT",
        "show_if": { "field": "be_05c", "answer": "FAIL" }
      },
      {
        "id": "be_05u",
        "label": "Weather sealing repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "be_05c", "answer": "FAIL" }
      },
      {
        "id": "be_05e",
        "label": "Estimated weather sealing repair cost",
        "type": "TEXT",
        "show_if": { "field": "be_05c", "answer": "FAIL" }
      },

      {
        "id": "st_01c",
        "label": "Foundation is in acceptable condition with no evidence of settlement, heaving, or water intrusion",
        "type": "PASS_FAIL"
      },
      {
        "id": "st_01d",
        "label": "Describe the foundation deficiency",
        "type": "TEXT",
        "show_if": { "field": "st_01c", "answer": "FAIL" }
      },
      {
        "id": "st_01u",
        "label": "Foundation repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "st_01c", "answer": "FAIL" }
      },
      {
        "id": "st_01e",
        "label": "Estimated foundation repair cost",
        "type": "TEXT",
        "show_if": { "field": "st_01c", "answer": "FAIL" }
      },

      {
        "id": "st_02c",
        "label": "Floor structure is in acceptable condition with no deflection, soft spots, or visible damage",
        "type": "PASS_FAIL"
      },
      {
        "id": "st_02d",
        "label": "Describe the floor structure deficiency",
        "type": "TEXT",
        "show_if": { "field": "st_02c", "answer": "FAIL" }
      },
      {
        "id": "st_02u",
        "label": "Floor structure repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "st_02c", "answer": "FAIL" }
      },
      {
        "id": "st_02e",
        "label": "Estimated floor structure repair cost",
        "type": "TEXT",
        "show_if": { "field": "st_02c", "answer": "FAIL" }
      },

      {
        "id": "st_03c",
        "label": "Roof framing and structure are in acceptable condition with no sagging, broken members, or corrosion",
        "type": "PASS_FAIL"
      },
      {
        "id": "st_03d",
        "label": "Describe the roof framing or structural deficiency",
        "type": "TEXT",
        "show_if": { "field": "st_03c", "answer": "FAIL" }
      },
      {
        "id": "st_03u",
        "label": "Roof framing repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "st_03c", "answer": "FAIL" }
      },
      {
        "id": "st_03e",
        "label": "Estimated roof framing repair cost",
        "type": "TEXT",
        "show_if": { "field": "st_03c", "answer": "FAIL" }
      },

      {
        "id": "st_04c",
        "label": "No significant structural cracking or distress is observed in walls, columns, or beams",
        "type": "PASS_FAIL"
      },
      {
        "id": "st_04d",
        "label": "Describe the cracking or structural distress observed",
        "type": "TEXT",
        "show_if": { "field": "st_04c", "answer": "FAIL" }
      },
      {
        "id": "st_04u",
        "label": "Structural distress repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "st_04c", "answer": "FAIL" }
      },
      {
        "id": "st_04e",
        "label": "Estimated structural repair cost",
        "type": "TEXT",
        "show_if": { "field": "st_04c", "answer": "FAIL" }
      },

      {
        "id": "hv_i1",
        "label": "HVAC system type and approximate age",
        "type": "TEXT"
      },

      {
        "id": "hv_01c",
        "label": "Cooling equipment is in acceptable condition and operating properly",
        "type": "PASS_FAIL"
      },
      {
        "id": "hv_01d",
        "label": "Describe the cooling equipment deficiency",
        "type": "TEXT",
        "show_if": { "field": "hv_01c", "answer": "FAIL" }
      },
      {
        "id": "hv_01u",
        "label": "Cooling equipment repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "hv_01c", "answer": "FAIL" }
      },
      {
        "id": "hv_01e",
        "label": "Estimated cooling equipment repair or replacement cost",
        "type": "TEXT",
        "show_if": { "field": "hv_01c", "answer": "FAIL" }
      },

      {
        "id": "hv_02c",
        "label": "Heating equipment is in acceptable condition and operating properly",
        "type": "PASS_FAIL"
      },
      {
        "id": "hv_02d",
        "label": "Describe the heating equipment deficiency",
        "type": "TEXT",
        "show_if": { "field": "hv_02c", "answer": "FAIL" }
      },
      {
        "id": "hv_02u",
        "label": "Heating equipment repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "hv_02c", "answer": "FAIL" }
      },
      {
        "id": "hv_02e",
        "label": "Estimated heating equipment repair or replacement cost",
        "type": "TEXT",
        "show_if": { "field": "hv_02c", "answer": "FAIL" }
      },

      {
        "id": "hv_03c",
        "label": "Air distribution and ductwork are in acceptable condition with no significant leakage, blockage, or damage",
        "type": "PASS_FAIL"
      },
      {
        "id": "hv_03d",
        "label": "Describe the air distribution or ductwork deficiency",
        "type": "TEXT",
        "show_if": { "field": "hv_03c", "answer": "FAIL" }
      },
      {
        "id": "hv_03u",
        "label": "Ductwork repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "hv_03c", "answer": "FAIL" }
      },
      {
        "id": "hv_03e",
        "label": "Estimated ductwork repair cost",
        "type": "TEXT",
        "show_if": { "field": "hv_03c", "answer": "FAIL" }
      },

      {
        "id": "hv_04c",
        "label": "Thermostats and HVAC controls are in acceptable condition and functioning correctly",
        "type": "PASS_FAIL"
      },
      {
        "id": "hv_04d",
        "label": "Describe the thermostat or controls deficiency",
        "type": "TEXT",
        "show_if": { "field": "hv_04c", "answer": "FAIL" }
      },
      {
        "id": "hv_04u",
        "label": "Thermostat or controls repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "hv_04c", "answer": "FAIL" }
      },
      {
        "id": "hv_04e",
        "label": "Estimated thermostat or controls repair cost",
        "type": "TEXT",
        "show_if": { "field": "hv_04c", "answer": "FAIL" }
      },

      {
        "id": "pl_01c",
        "label": "Domestic water supply piping is in acceptable condition with adequate pressure and no visible leaks",
        "type": "PASS_FAIL"
      },
      {
        "id": "pl_01d",
        "label": "Describe the domestic water supply deficiency",
        "type": "TEXT",
        "show_if": { "field": "pl_01c", "answer": "FAIL" }
      },
      {
        "id": "pl_01u",
        "label": "Water supply repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "pl_01c", "answer": "FAIL" }
      },
      {
        "id": "pl_01e",
        "label": "Estimated water supply repair cost",
        "type": "TEXT",
        "show_if": { "field": "pl_01c", "answer": "FAIL" }
      },

      {
        "id": "pl_02c",
        "label": "Drain, waste, and vent system is in acceptable condition with no blockages, slow drains, or odors",
        "type": "PASS_FAIL"
      },
      {
        "id": "pl_02d",
        "label": "Describe the drain, waste, or vent deficiency",
        "type": "TEXT",
        "show_if": { "field": "pl_02c", "answer": "FAIL" }
      },
      {
        "id": "pl_02u",
        "label": "Drain or vent repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "pl_02c", "answer": "FAIL" }
      },
      {
        "id": "pl_02e",
        "label": "Estimated drain or vent repair cost",
        "type": "TEXT",
        "show_if": { "field": "pl_02c", "answer": "FAIL" }
      },

      {
        "id": "pl_03c",
        "label": "Plumbing fixtures (sinks, toilets, urinals, faucets) are in acceptable condition and functioning properly",
        "type": "PASS_FAIL"
      },
      {
        "id": "pl_03d",
        "label": "Describe the plumbing fixture deficiency",
        "type": "TEXT",
        "show_if": { "field": "pl_03c", "answer": "FAIL" }
      },
      {
        "id": "pl_03u",
        "label": "Plumbing fixture repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "pl_03c", "answer": "FAIL" }
      },
      {
        "id": "pl_03e",
        "label": "Estimated plumbing fixture repair or replacement cost",
        "type": "TEXT",
        "show_if": { "field": "pl_03c", "answer": "FAIL" }
      },

      {
        "id": "pl_04c",
        "label": "Water heating system is in acceptable condition and providing adequate hot water",
        "type": "PASS_FAIL"
      },
      {
        "id": "pl_04d",
        "label": "Describe the water heating system deficiency",
        "type": "TEXT",
        "show_if": { "field": "pl_04c", "answer": "FAIL" }
      },
      {
        "id": "pl_04u",
        "label": "Water heating system repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "pl_04c", "answer": "FAIL" }
      },
      {
        "id": "pl_04e",
        "label": "Estimated water heating system repair or replacement cost",
        "type": "TEXT",
        "show_if": { "field": "pl_04c", "answer": "FAIL" }
      },

      {
        "id": "el_01c",
        "label": "Service entrance and metering equipment are in acceptable condition with no corrosion, damage, or access issues",
        "type": "PASS_FAIL"
      },
      {
        "id": "el_01d",
        "label": "Describe the service entrance or metering deficiency",
        "type": "TEXT",
        "show_if": { "field": "el_01c", "answer": "FAIL" }
      },
      {
        "id": "el_01u",
        "label": "Service entrance repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "el_01c", "answer": "FAIL" }
      },
      {
        "id": "el_01e",
        "label": "Estimated service entrance repair cost",
        "type": "TEXT",
        "show_if": { "field": "el_01c", "answer": "FAIL" }
      },

      {
        "id": "el_02c",
        "label": "Electrical panels and distribution equipment are in acceptable condition with proper labeling and no tripped breakers",
        "type": "PASS_FAIL"
      },
      {
        "id": "el_02d",
        "label": "Describe the panel or distribution deficiency",
        "type": "TEXT",
        "show_if": { "field": "el_02c", "answer": "FAIL" }
      },
      {
        "id": "el_02u",
        "label": "Panel or distribution repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "el_02c", "answer": "FAIL" }
      },
      {
        "id": "el_02e",
        "label": "Estimated panel or distribution repair cost",
        "type": "TEXT",
        "show_if": { "field": "el_02c", "answer": "FAIL" }
      },

      {
        "id": "el_03c",
        "label": "Interior lighting fixtures and controls are in acceptable condition with adequate illumination throughout",
        "type": "PASS_FAIL"
      },
      {
        "id": "el_03d",
        "label": "Describe the interior lighting deficiency",
        "type": "TEXT",
        "show_if": { "field": "el_03c", "answer": "FAIL" }
      },
      {
        "id": "el_03u",
        "label": "Interior lighting repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "el_03c", "answer": "FAIL" }
      },
      {
        "id": "el_03e",
        "label": "Estimated interior lighting repair or upgrade cost",
        "type": "TEXT",
        "show_if": { "field": "el_03c", "answer": "FAIL" }
      },

      {
        "id": "el_04c",
        "label": "Outlets, switches, and visible wiring are in acceptable condition with no exposed conductors or damaged covers",
        "type": "PASS_FAIL"
      },
      {
        "id": "el_04d",
        "label": "Describe the outlet, switch, or wiring deficiency",
        "type": "TEXT",
        "show_if": { "field": "el_04c", "answer": "FAIL" }
      },
      {
        "id": "el_04u",
        "label": "Outlet or wiring repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "el_04c", "answer": "FAIL" }
      },
      {
        "id": "el_04e",
        "label": "Estimated outlet or wiring repair cost",
        "type": "TEXT",
        "show_if": { "field": "el_04c", "answer": "FAIL" }
      },

      {
        "id": "ls_01c",
        "label": "Fire alarm system is in acceptable condition with current inspection tags and no trouble indicators",
        "type": "PASS_FAIL"
      },
      {
        "id": "ls_01d",
        "label": "Describe the fire alarm system deficiency",
        "type": "TEXT",
        "show_if": { "field": "ls_01c", "answer": "FAIL" }
      },
      {
        "id": "ls_01u",
        "label": "Fire alarm repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "ls_01c", "answer": "FAIL" }
      },
      {
        "id": "ls_01e",
        "label": "Estimated fire alarm repair or replacement cost",
        "type": "TEXT",
        "show_if": { "field": "ls_01c", "answer": "FAIL" }
      },

      {
        "id": "ls_02c",
        "label": "Fire suppression and sprinkler systems are in acceptable condition with current inspection records",
        "type": "PASS_FAIL"
      },
      {
        "id": "ls_02d",
        "label": "Describe the fire suppression or sprinkler deficiency",
        "type": "TEXT",
        "show_if": { "field": "ls_02c", "answer": "FAIL" }
      },
      {
        "id": "ls_02u",
        "label": "Fire suppression repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "ls_02c", "answer": "FAIL" }
      },
      {
        "id": "ls_02e",
        "label": "Estimated fire suppression repair cost",
        "type": "TEXT",
        "show_if": { "field": "ls_02c", "answer": "FAIL" }
      },

      {
        "id": "ls_03c",
        "label": "Emergency lighting and exit signs are in acceptable condition and illuminating properly",
        "type": "PASS_FAIL"
      },
      {
        "id": "ls_03d",
        "label": "Describe the emergency lighting or exit sign deficiency",
        "type": "TEXT",
        "show_if": { "field": "ls_03c", "answer": "FAIL" }
      },
      {
        "id": "ls_03u",
        "label": "Emergency lighting repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "ls_03c", "answer": "FAIL" }
      },
      {
        "id": "ls_03e",
        "label": "Estimated emergency lighting repair or replacement cost",
        "type": "TEXT",
        "show_if": { "field": "ls_03c", "answer": "FAIL" }
      },

      {
        "id": "ls_04c",
        "label": "Fire extinguishers are present in required locations with current inspection tags",
        "type": "PASS_FAIL"
      },
      {
        "id": "ls_04d",
        "label": "Describe the fire extinguisher deficiency",
        "type": "TEXT",
        "show_if": { "field": "ls_04c", "answer": "FAIL" }
      },
      {
        "id": "ls_04u",
        "label": "Fire extinguisher remediation urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "ls_04c", "answer": "FAIL" }
      },
      {
        "id": "ls_04e",
        "label": "Estimated fire extinguisher replacement or servicing cost",
        "type": "TEXT",
        "show_if": { "field": "ls_04c", "answer": "FAIL" }
      },

      {
        "id": "ls_05c",
        "label": "Egress paths and exit doors are unobstructed and in acceptable condition",
        "type": "PASS_FAIL"
      },
      {
        "id": "ls_05d",
        "label": "Describe the egress path or exit deficiency",
        "type": "TEXT",
        "show_if": { "field": "ls_05c", "answer": "FAIL" }
      },
      {
        "id": "ls_05u",
        "label": "Egress or exit repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "ls_05c", "answer": "FAIL" }
      },
      {
        "id": "ls_05e",
        "label": "Estimated egress or exit repair cost",
        "type": "TEXT",
        "show_if": { "field": "ls_05c", "answer": "FAIL" }
      },

      {
        "id": "in_01c",
        "label": "Floor finishes are in acceptable condition with no significant cracking, lifting, staining, or trip hazards",
        "type": "PASS_FAIL"
      },
      {
        "id": "in_01d",
        "label": "Describe the floor finish deficiency",
        "type": "TEXT",
        "show_if": { "field": "in_01c", "answer": "FAIL" }
      },
      {
        "id": "in_01u",
        "label": "Floor finish repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "in_01c", "answer": "FAIL" }
      },
      {
        "id": "in_01e",
        "label": "Estimated floor finish repair or replacement cost",
        "type": "TEXT",
        "show_if": { "field": "in_01c", "answer": "FAIL" }
      },

      {
        "id": "in_02c",
        "label": "Wall finishes are in acceptable condition with no significant peeling, water staining, mold, or damage",
        "type": "PASS_FAIL"
      },
      {
        "id": "in_02d",
        "label": "Describe the wall finish deficiency",
        "type": "TEXT",
        "show_if": { "field": "in_02c", "answer": "FAIL" }
      },
      {
        "id": "in_02u",
        "label": "Wall finish repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "in_02c", "answer": "FAIL" }
      },
      {
        "id": "in_02e",
        "label": "Estimated wall finish repair cost",
        "type": "TEXT",
        "show_if": { "field": "in_02c", "answer": "FAIL" }
      },

      {
        "id": "in_03c",
        "label": "Ceiling finishes are in acceptable condition with no sagging tiles, stains, or visible water damage",
        "type": "PASS_FAIL"
      },
      {
        "id": "in_03d",
        "label": "Describe the ceiling finish deficiency",
        "type": "TEXT",
        "show_if": { "field": "in_03c", "answer": "FAIL" }
      },
      {
        "id": "in_03u",
        "label": "Ceiling finish repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "in_03c", "answer": "FAIL" }
      },
      {
        "id": "in_03e",
        "label": "Estimated ceiling finish repair cost",
        "type": "TEXT",
        "show_if": { "field": "in_03c", "answer": "FAIL" }
      },

      {
        "id": "in_04c",
        "label": "Interior doors and hardware are in acceptable condition and operating properly",
        "type": "PASS_FAIL"
      },
      {
        "id": "in_04d",
        "label": "Describe the interior door or hardware deficiency",
        "type": "TEXT",
        "show_if": { "field": "in_04c", "answer": "FAIL" }
      },
      {
        "id": "in_04u",
        "label": "Interior door or hardware repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "in_04c", "answer": "FAIL" }
      },
      {
        "id": "in_04e",
        "label": "Estimated interior door or hardware repair cost",
        "type": "TEXT",
        "show_if": { "field": "in_04c", "answer": "FAIL" }
      },

      {
        "id": "in_05c",
        "label": "Stairs, railings, and balustrades are in acceptable condition with no loose components or structural defects",
        "type": "PASS_FAIL"
      },
      {
        "id": "in_05d",
        "label": "Describe the stair, railing, or balustrade deficiency",
        "type": "TEXT",
        "show_if": { "field": "in_05c", "answer": "FAIL" }
      },
      {
        "id": "in_05u",
        "label": "Stair or railing repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "in_05c", "answer": "FAIL" }
      },
      {
        "id": "in_05e",
        "label": "Estimated stair or railing repair cost",
        "type": "TEXT",
        "show_if": { "field": "in_05c", "answer": "FAIL" }
      },

      {
        "id": "ad_01c",
        "label": "Accessible parking spaces and site approach routes meet ADA requirements and are in acceptable condition",
        "type": "PASS_FAIL"
      },
      {
        "id": "ad_01d",
        "label": "Describe the accessible parking or site approach deficiency",
        "type": "TEXT",
        "show_if": { "field": "ad_01c", "answer": "FAIL" }
      },
      {
        "id": "ad_01u",
        "label": "Accessible parking or approach repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "ad_01c", "answer": "FAIL" }
      },
      {
        "id": "ad_01e",
        "label": "Estimated accessible parking or approach repair cost",
        "type": "TEXT",
        "show_if": { "field": "ad_01c", "answer": "FAIL" }
      },

      {
        "id": "ad_02c",
        "label": "Accessible building entrance (ramps, level landing, door hardware, clearances) meets ADA requirements",
        "type": "PASS_FAIL"
      },
      {
        "id": "ad_02d",
        "label": "Describe the accessible entrance deficiency",
        "type": "TEXT",
        "show_if": { "field": "ad_02c", "answer": "FAIL" }
      },
      {
        "id": "ad_02u",
        "label": "Accessible entrance repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "ad_02c", "answer": "FAIL" }
      },
      {
        "id": "ad_02e",
        "label": "Estimated accessible entrance repair cost",
        "type": "TEXT",
        "show_if": { "field": "ad_02c", "answer": "FAIL" }
      },

      {
        "id": "ad_03c",
        "label": "Interior accessible routes and restroom facilities meet ADA requirements and are in acceptable condition",
        "type": "PASS_FAIL"
      },
      {
        "id": "ad_03d",
        "label": "Describe the interior accessible route or restroom deficiency",
        "type": "TEXT",
        "show_if": { "field": "ad_03c", "answer": "FAIL" }
      },
      {
        "id": "ad_03u",
        "label": "Interior accessible route or restroom repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "ad_03c", "answer": "FAIL" }
      },
      {
        "id": "ad_03e",
        "label": "Estimated interior accessible route or restroom repair cost",
        "type": "TEXT",
        "show_if": { "field": "ad_03c", "answer": "FAIL" }
      },

      {
        "id": "ad_04c",
        "label": "Elevators or accessibility lifts (if present) are in acceptable condition with current inspection certificates",
        "type": "PASS_FAIL"
      },
      {
        "id": "ad_04d",
        "label": "Describe the elevator or lift deficiency",
        "type": "TEXT",
        "show_if": { "field": "ad_04c", "answer": "FAIL" }
      },
      {
        "id": "ad_04u",
        "label": "Elevator or lift repair urgency",
        "type": "STOPLIGHT",
        "show_if": { "field": "ad_04c", "answer": "FAIL" }
      },
      {
        "id": "ad_04e",
        "label": "Estimated elevator or lift repair cost",
        "type": "TEXT",
        "show_if": { "field": "ad_04c", "answer": "FAIL" }
      },

      {
        "id": "oa_01",
        "label": "Overall facility condition rating (Good / Fair / Poor / Critical)",
        "type": "TEXT"
      },
      {
        "id": "oa_02",
        "label": "Estimated total deferred maintenance cost",
        "type": "TEXT"
      },
      {
        "id": "oa_03",
        "label": "Priority recommendations and next steps",
        "type": "TEXT"
      },
      {
        "id": "oa_04",
        "label": "Inspector certification notes",
        "type": "TEXT"
      }

    ]
  }'
)
ON CONFLICT (id) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      json_schema = EXCLUDED.json_schema,
      updated_at  = NOW();
