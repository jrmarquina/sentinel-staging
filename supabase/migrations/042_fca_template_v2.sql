-- Migration: 042_fca_template_v2.sql
-- Replaces the existing FCA template (ID 20000000-0000-0000-0000-000000000001)
-- with a comprehensive 258-field version. Idempotent via ON CONFLICT.
-- Also seeds the FCA Deficiency Follow-up template (ID 20000000-0000-0000-0000-000000000002).

INSERT INTO fm_inspection_templates (id, org_id, name, description, json_schema)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Facility Condition Assessment (FCA)',
  'Comprehensive facility condition assessment covering site, building envelope, structural, mechanical, plumbing, electrical, life safety, interior finishes, accessibility, and special spaces. Uses 1-5 condition ratings (5=New/Excellent, 4=Good, 3=Fair, 2=Poor, 1=Critical). Sections adapt to facility features declared in the Facility Profile. Components rated 1-2 can generate a follow-up deficiency inspection.',
  '{
    "fields": [

      {"id": "fp_00a", "label": "Inspector name", "type": "TEXT"},
      {"id": "fp_00b", "label": "Inspection date", "type": "TEXT"},

      {"id": "fp_01", "label": "Does the facility have parking areas, driveways, or bus lanes?", "type": "YES_NO"},
      {"id": "fp_02", "label": "Does the facility have a playground or outdoor recreation equipment?", "type": "YES_NO"},
      {"id": "fp_03", "label": "Does the facility have athletic courts or sports fields?", "type": "YES_NO"},
      {"id": "fp_04", "label": "Does the facility have a swimming pool (indoor or outdoor)?", "type": "YES_NO"},
      {"id": "fp_05", "label": "Does the facility have a kitchen or food preparation area?", "type": "YES_NO"},
      {"id": "fp_06", "label": "Does the facility have a cafeteria or dining hall?", "type": "YES_NO"},
      {"id": "fp_07", "label": "Does the facility have an auditorium, stage, or event hall?", "type": "YES_NO"},
      {"id": "fp_08", "label": "Does the facility have a gymnasium or covered indoor sports court?", "type": "YES_NO"},
      {"id": "fp_09", "label": "Does the facility have laboratory or specialized rooms (science, art, etc.)?", "type": "YES_NO"},
      {"id": "fp_10", "label": "Does the facility have an HVAC or air conditioning system?", "type": "YES_NO"},
      {"id": "fp_11", "label": "Does the facility have a central heating system (boilers or furnaces)?", "type": "YES_NO"},
      {"id": "fp_12", "label": "Does the facility have a gas distribution system?", "type": "YES_NO"},
      {"id": "fp_13", "label": "Does the facility have water storage tanks or cisterns?", "type": "YES_NO"},
      {"id": "fp_14", "label": "Does the facility have an elevator or accessibility lift?", "type": "YES_NO"},
      {"id": "fp_15", "label": "Does the facility have a laundry facility?", "type": "YES_NO"},
      {"id": "fp_16", "label": "Does the facility have an emergency generator or backup power system?", "type": "YES_NO"},
      {"id": "fp_17", "label": "Does the facility have a fire sprinkler suppression system?", "type": "YES_NO"},
      {"id": "fp_18", "label": "Does the facility have security cameras or a perimeter alarm system?", "type": "YES_NO"},
      {"id": "fp_19", "label": "Does the facility have locker rooms or shower facilities?", "type": "YES_NO"},
      {"id": "fp_20", "label": "Does the facility have a loading dock or service entrance?", "type": "YES_NO"},

      {"id": "gi_01", "label": "Facility name and address", "type": "TEXT"},
      {"id": "gi_02", "label": "Year of original construction", "type": "NUMBER"},
      {"id": "gi_03", "label": "Building use and occupancy type", "type": "TEXT"},
      {"id": "gi_04", "label": "Gross floor area (sq ft)", "type": "NUMBER"},
      {"id": "gi_05", "label": "Number of stories", "type": "NUMBER"},
      {"id": "gi_06", "label": "Construction type (e.g. masonry, reinforced concrete, wood frame)", "type": "TEXT"},
      {"id": "gi_07", "label": "Most recent renovation (year and scope)", "type": "TEXT"},
      {"id": "gi_08", "label": "Outstanding code violations or open permits", "type": "TEXT"},

      {"id": "si_01c", "label": "Parking lot, driveways, and bus lanes are in acceptable condition (no significant cracking, potholes, or drainage issues)", "type": "RATING_5", "show_if": {"field": "fp_01", "answer": "YES"}},
      {"id": "si_01d", "label": "Describe the parking or paving deficiency", "type": "TEXT"},
      {"id": "si_01u", "label": "Parking or paving repair urgency", "type": "STOPLIGHT"},
      {"id": "si_01e", "label": "Estimated parking or paving repair cost", "type": "TEXT"},

      {"id": "si_02c", "label": "Pedestrian sidewalks, crosswalks, and on-site pathways are in acceptable condition with no trip hazards or erosion", "type": "RATING_5"},
      {"id": "si_02d", "label": "Describe the sidewalk or pathway deficiency", "type": "TEXT"},
      {"id": "si_02u", "label": "Sidewalk or pathway repair urgency", "type": "STOPLIGHT"},
      {"id": "si_02e", "label": "Estimated sidewalk or pathway repair cost", "type": "TEXT"},

      {"id": "si_03c", "label": "Site drainage and stormwater management function acceptably with no ponding or erosion", "type": "RATING_5"},
      {"id": "si_03d", "label": "Describe the site drainage deficiency", "type": "TEXT"},
      {"id": "si_03u", "label": "Site drainage repair urgency", "type": "STOPLIGHT"},
      {"id": "si_03e", "label": "Estimated site drainage repair cost", "type": "TEXT"},

      {"id": "si_04c", "label": "Perimeter fencing, gates, and access control elements are in acceptable condition", "type": "RATING_5"},
      {"id": "si_04d", "label": "Describe the fencing or gate deficiency", "type": "TEXT"},
      {"id": "si_04u", "label": "Fencing or gate repair urgency", "type": "STOPLIGHT"},
      {"id": "si_04e", "label": "Estimated fencing or gate repair cost", "type": "TEXT"},

      {"id": "si_05c", "label": "Landscaping, exterior furniture, shade structures, and vegetation are in acceptable condition", "type": "RATING_5"},
      {"id": "si_05d", "label": "Describe the landscaping or exterior furniture deficiency", "type": "TEXT"},
      {"id": "si_05u", "label": "Landscaping or exterior furniture repair urgency", "type": "STOPLIGHT"},
      {"id": "si_05e", "label": "Estimated landscaping or exterior furniture repair cost", "type": "TEXT"},

      {"id": "si_06c", "label": "Playground areas (equipment, surfacing, edging, canopies, and fencing) are safe and in acceptable condition", "type": "RATING_5", "show_if": {"field": "fp_02", "answer": "YES"}},
      {"id": "si_06d", "label": "Describe the playground deficiency", "type": "TEXT"},
      {"id": "si_06u", "label": "Playground repair urgency", "type": "STOPLIGHT"},
      {"id": "si_06e", "label": "Estimated playground repair cost", "type": "TEXT"},

      {"id": "si_07c", "label": "Athletic courts, fields, bleachers, and sports equipment are in acceptable condition", "type": "RATING_5", "show_if": {"field": "fp_03", "answer": "YES"}},
      {"id": "si_07d", "label": "Describe the athletic court or field deficiency", "type": "TEXT"},
      {"id": "si_07u", "label": "Athletic court or field repair urgency", "type": "STOPLIGHT"},
      {"id": "si_07e", "label": "Estimated athletic court or field repair cost", "type": "TEXT"},

      {"id": "be_01c", "label": "Roof system is in acceptable condition with no active leaks, blisters, or significant membrane deterioration", "type": "RATING_5"},
      {"id": "be_01d", "label": "Describe the roof system deficiency", "type": "TEXT"},
      {"id": "be_01u", "label": "Roof system repair urgency", "type": "STOPLIGHT"},
      {"id": "be_01e", "label": "Estimated roof system repair cost", "type": "TEXT"},

      {"id": "be_02c", "label": "Roof drainage (drains, gutters, downspouts, and scuppers) function acceptably with no blockages or ponding", "type": "RATING_5"},
      {"id": "be_02d", "label": "Describe the roof drainage deficiency", "type": "TEXT"},
      {"id": "be_02u", "label": "Roof drainage repair urgency", "type": "STOPLIGHT"},
      {"id": "be_02e", "label": "Estimated roof drainage repair cost", "type": "TEXT"},

      {"id": "be_03c", "label": "Exterior walls, soffits, and sealants are in acceptable condition with no cracking, spalling, or water infiltration", "type": "RATING_5"},
      {"id": "be_03d", "label": "Describe the exterior wall or soffit deficiency", "type": "TEXT"},
      {"id": "be_03u", "label": "Exterior wall or soffit repair urgency", "type": "STOPLIGHT"},
      {"id": "be_03e", "label": "Estimated exterior wall or soffit repair cost", "type": "TEXT"},

      {"id": "be_04c", "label": "Windows, glazing, louvers, and vents are in acceptable condition with no broken panes, failed seals, or operation problems", "type": "RATING_5"},
      {"id": "be_04d", "label": "Describe the window or glazing deficiency", "type": "TEXT"},
      {"id": "be_04u", "label": "Window or glazing repair urgency", "type": "STOPLIGHT"},
      {"id": "be_04e", "label": "Estimated window or glazing repair cost", "type": "TEXT"},

      {"id": "be_05c", "label": "Exterior doors, frames, and hardware are in acceptable condition and operate correctly", "type": "RATING_5"},
      {"id": "be_05d", "label": "Describe the exterior door or hardware deficiency", "type": "TEXT"},
      {"id": "be_05u", "label": "Exterior door or hardware repair urgency", "type": "STOPLIGHT"},
      {"id": "be_05e", "label": "Estimated exterior door or hardware repair cost", "type": "TEXT"},

      {"id": "be_06c", "label": "Covered walkways, canopies, and exterior shade structures are in acceptable condition", "type": "RATING_5"},
      {"id": "be_06d", "label": "Describe the covered walkway or canopy deficiency", "type": "TEXT"},
      {"id": "be_06u", "label": "Covered walkway or canopy repair urgency", "type": "STOPLIGHT"},
      {"id": "be_06e", "label": "Estimated covered walkway or canopy repair cost", "type": "TEXT"},

      {"id": "st_01c", "label": "Foundation, footings, and slab-on-grade show no significant settlement, cracking, or water intrusion", "type": "RATING_5"},
      {"id": "st_01d", "label": "Describe the foundation or slab deficiency", "type": "TEXT"},
      {"id": "st_01u", "label": "Foundation or slab repair urgency", "type": "STOPLIGHT"},
      {"id": "st_01e", "label": "Estimated foundation or slab repair cost", "type": "TEXT"},

      {"id": "st_02c", "label": "Load-bearing walls, columns, and beams show no significant cracking, spalling, or structural distress", "type": "RATING_5"},
      {"id": "st_02d", "label": "Describe the structural wall or beam deficiency", "type": "TEXT"},
      {"id": "st_02u", "label": "Structural wall or beam repair urgency", "type": "STOPLIGHT"},
      {"id": "st_02e", "label": "Estimated structural wall or beam repair cost", "type": "TEXT"},

      {"id": "st_03c", "label": "Floor framing and subflooring are in acceptable condition with no deflection, bounce, or deterioration", "type": "RATING_5"},
      {"id": "st_03d", "label": "Describe the floor framing or subfloor deficiency", "type": "TEXT"},
      {"id": "st_03u", "label": "Floor framing or subfloor repair urgency", "type": "STOPLIGHT"},
      {"id": "st_03e", "label": "Estimated floor framing or subfloor repair cost", "type": "TEXT"},

      {"id": "st_04c", "label": "No significant structural cracking, distress, or deformation is observed throughout the building", "type": "RATING_5"},
      {"id": "st_04d", "label": "Describe the observed structural cracking or distress", "type": "TEXT"},
      {"id": "st_04u", "label": "Structural cracking or distress repair urgency", "type": "STOPLIGHT"},
      {"id": "st_04e", "label": "Estimated structural cracking or distress repair cost", "type": "TEXT"},

      {"id": "hv_i1", "label": "HVAC system type, manufacturer, and approximate age", "type": "TEXT", "show_if": {"field": "fp_10", "answer": "YES"}},

      {"id": "hv_01c", "label": "Cooling equipment (AC units, chillers) is in acceptable condition and operating properly", "type": "RATING_5", "show_if": {"field": "fp_10", "answer": "YES"}},
      {"id": "hv_01d", "label": "Describe the cooling equipment deficiency", "type": "TEXT"},
      {"id": "hv_01u", "label": "Cooling equipment repair urgency", "type": "STOPLIGHT"},
      {"id": "hv_01e", "label": "Estimated cooling equipment repair cost", "type": "TEXT"},

      {"id": "hv_02c", "label": "Air distribution, ductwork, and registers are in acceptable condition with no significant leakage or blockage", "type": "RATING_5", "show_if": {"field": "fp_10", "answer": "YES"}},
      {"id": "hv_02d", "label": "Describe the ductwork or air distribution deficiency", "type": "TEXT"},
      {"id": "hv_02u", "label": "Ductwork or air distribution repair urgency", "type": "STOPLIGHT"},
      {"id": "hv_02e", "label": "Estimated ductwork or air distribution repair cost", "type": "TEXT"},

      {"id": "hv_03c", "label": "Thermostats, HVAC controls, and building automation are in acceptable condition and functioning correctly", "type": "RATING_5", "show_if": {"field": "fp_10", "answer": "YES"}},
      {"id": "hv_03d", "label": "Describe the HVAC controls or thermostat deficiency", "type": "TEXT"},
      {"id": "hv_03u", "label": "HVAC controls or thermostat repair urgency", "type": "STOPLIGHT"},
      {"id": "hv_03e", "label": "Estimated HVAC controls or thermostat repair cost", "type": "TEXT"},

      {"id": "hv_04c", "label": "General ventilation and exhaust systems (restroom, general building exhaust) are in acceptable condition", "type": "RATING_5", "show_if": {"field": "fp_10", "answer": "YES"}},
      {"id": "hv_04d", "label": "Describe the ventilation or exhaust system deficiency", "type": "TEXT"},
      {"id": "hv_04u", "label": "Ventilation or exhaust system repair urgency", "type": "STOPLIGHT"},
      {"id": "hv_04e", "label": "Estimated ventilation or exhaust system repair cost", "type": "TEXT"},

      {"id": "hv_05c", "label": "Kitchen exhaust hood, grease duct, and Ansul fire suppression are in acceptable condition and compliant", "type": "RATING_5", "show_if": {"field": "fp_05", "answer": "YES"}},
      {"id": "hv_05d", "label": "Describe the kitchen exhaust or Ansul system deficiency", "type": "TEXT"},
      {"id": "hv_05u", "label": "Kitchen exhaust or Ansul system repair urgency", "type": "STOPLIGHT"},
      {"id": "hv_05e", "label": "Estimated kitchen exhaust or Ansul system repair cost", "type": "TEXT"},

      {"id": "pl_01c", "label": "Domestic water supply piping is in acceptable condition with adequate pressure and no visible leaks", "type": "RATING_5"},
      {"id": "pl_01d", "label": "Describe the water supply piping deficiency", "type": "TEXT"},
      {"id": "pl_01u", "label": "Water supply piping repair urgency", "type": "STOPLIGHT"},
      {"id": "pl_01e", "label": "Estimated water supply piping repair cost", "type": "TEXT"},

      {"id": "pl_02c", "label": "Drain, waste, and vent system is in acceptable condition with no blockages, slow drains, or odors", "type": "RATING_5"},
      {"id": "pl_02d", "label": "Describe the drain, waste, or vent deficiency", "type": "TEXT"},
      {"id": "pl_02u", "label": "Drain, waste, or vent repair urgency", "type": "STOPLIGHT"},
      {"id": "pl_02e", "label": "Estimated drain, waste, or vent repair cost", "type": "TEXT"},

      {"id": "pl_03c", "label": "Water heaters are in acceptable condition with no corrosion, leaks, or inadequate capacity", "type": "RATING_5"},
      {"id": "pl_03d", "label": "Describe the water heater deficiency", "type": "TEXT"},
      {"id": "pl_03u", "label": "Water heater repair urgency", "type": "STOPLIGHT"},
      {"id": "pl_03e", "label": "Estimated water heater repair cost", "type": "TEXT"},

      {"id": "pl_04c", "label": "Restroom fixtures (water closets, urinals, lavatories, and accessories) are in acceptable condition and ADA-compliant", "type": "RATING_5"},
      {"id": "pl_04d", "label": "Describe the restroom fixture deficiency", "type": "TEXT"},
      {"id": "pl_04u", "label": "Restroom fixture repair urgency", "type": "STOPLIGHT"},
      {"id": "pl_04e", "label": "Estimated restroom fixture repair cost", "type": "TEXT"},

      {"id": "pl_05c", "label": "Water storage tanks or cisterns are in acceptable condition, clean, and properly sealed", "type": "RATING_5", "show_if": {"field": "fp_13", "answer": "YES"}},
      {"id": "pl_05d", "label": "Describe the water tank or cistern deficiency", "type": "TEXT"},
      {"id": "pl_05u", "label": "Water tank or cistern repair urgency", "type": "STOPLIGHT"},
      {"id": "pl_05e", "label": "Estimated water tank or cistern repair cost", "type": "TEXT"},

      {"id": "pl_06c", "label": "Kitchen plumbing (sinks, grease traps, dishwasher supply and drain) is in acceptable condition", "type": "RATING_5", "show_if": {"field": "fp_05", "answer": "YES"}},
      {"id": "pl_06d", "label": "Describe the kitchen plumbing deficiency", "type": "TEXT"},
      {"id": "pl_06u", "label": "Kitchen plumbing repair urgency", "type": "STOPLIGHT"},
      {"id": "pl_06e", "label": "Estimated kitchen plumbing repair cost", "type": "TEXT"},

      {"id": "el_01c", "label": "Electrical service, switchgear, and main disconnect are in acceptable condition and adequately sized", "type": "RATING_5"},
      {"id": "el_01d", "label": "Describe the electrical service or switchgear deficiency", "type": "TEXT"},
      {"id": "el_01u", "label": "Electrical service or switchgear repair urgency", "type": "STOPLIGHT"},
      {"id": "el_01e", "label": "Estimated electrical service or switchgear repair cost", "type": "TEXT"},

      {"id": "el_02c", "label": "Panelboards, feeders, and distribution equipment are in acceptable condition with no tripped breakers or overloading", "type": "RATING_5"},
      {"id": "el_02d", "label": "Describe the panelboard or distribution equipment deficiency", "type": "TEXT"},
      {"id": "el_02u", "label": "Panelboard or distribution equipment repair urgency", "type": "STOPLIGHT"},
      {"id": "el_02e", "label": "Estimated panelboard or distribution equipment repair cost", "type": "TEXT"},

      {"id": "el_03c", "label": "Interior lighting (classrooms, offices, corridors, restrooms) is in acceptable condition and provides adequate illumination", "type": "RATING_5"},
      {"id": "el_03d", "label": "Describe the interior lighting deficiency", "type": "TEXT"},
      {"id": "el_03u", "label": "Interior lighting repair urgency", "type": "STOPLIGHT"},
      {"id": "el_03e", "label": "Estimated interior lighting repair cost", "type": "TEXT"},

      {"id": "el_04c", "label": "Exterior lighting (parking, walkways, building perimeter) is in acceptable condition and provides adequate security lighting", "type": "RATING_5"},
      {"id": "el_04d", "label": "Describe the exterior lighting deficiency", "type": "TEXT"},
      {"id": "el_04u", "label": "Exterior lighting repair urgency", "type": "STOPLIGHT"},
      {"id": "el_04e", "label": "Estimated exterior lighting repair cost", "type": "TEXT"},

      {"id": "el_05c", "label": "Emergency and exit lighting meets code requirements and is in acceptable condition", "type": "RATING_5"},
      {"id": "el_05d", "label": "Describe the emergency or exit lighting deficiency", "type": "TEXT"},
      {"id": "el_05u", "label": "Emergency or exit lighting repair urgency", "type": "STOPLIGHT"},
      {"id": "el_05e", "label": "Estimated emergency or exit lighting repair cost", "type": "TEXT"},

      {"id": "el_06c", "label": "Emergency generator, transfer switch, and fuel system are in acceptable condition and tested regularly", "type": "RATING_5", "show_if": {"field": "fp_16", "answer": "YES"}},
      {"id": "el_06d", "label": "Describe the emergency generator or transfer switch deficiency", "type": "TEXT"},
      {"id": "el_06u", "label": "Emergency generator or transfer switch repair urgency", "type": "STOPLIGHT"},
      {"id": "el_06e", "label": "Estimated emergency generator or transfer switch repair cost", "type": "TEXT"},

      {"id": "el_07c", "label": "Security camera system and perimeter alarm are in acceptable condition and fully functional", "type": "RATING_5", "show_if": {"field": "fp_18", "answer": "YES"}},
      {"id": "el_07d", "label": "Describe the security camera or alarm system deficiency", "type": "TEXT"},
      {"id": "el_07u", "label": "Security camera or alarm system repair urgency", "type": "STOPLIGHT"},
      {"id": "el_07e", "label": "Estimated security camera or alarm system repair cost", "type": "TEXT"},

      {"id": "ls_01c", "label": "Fire alarm system, detectors, pull stations, and annunciator panels are in acceptable condition and current on inspections", "type": "RATING_5"},
      {"id": "ls_01d", "label": "Describe the fire alarm system deficiency", "type": "TEXT"},
      {"id": "ls_01u", "label": "Fire alarm system repair urgency", "type": "STOPLIGHT"},
      {"id": "ls_01e", "label": "Estimated fire alarm system repair cost", "type": "TEXT"},

      {"id": "ls_02c", "label": "Fire sprinkler suppression system is in acceptable condition, properly pressurized, and current on inspections", "type": "RATING_5", "show_if": {"field": "fp_17", "answer": "YES"}},
      {"id": "ls_02d", "label": "Describe the sprinkler system deficiency", "type": "TEXT"},
      {"id": "ls_02u", "label": "Sprinkler system repair urgency", "type": "STOPLIGHT"},
      {"id": "ls_02e", "label": "Estimated sprinkler system repair cost", "type": "TEXT"},

      {"id": "ls_03c", "label": "Emergency egress routes, exit doors, and stairwell enclosures are unobstructed and in acceptable condition", "type": "RATING_5"},
      {"id": "ls_03d", "label": "Describe the egress route or exit door deficiency", "type": "TEXT"},
      {"id": "ls_03u", "label": "Egress route or exit door repair urgency", "type": "STOPLIGHT"},
      {"id": "ls_03e", "label": "Estimated egress route or exit door repair cost", "type": "TEXT"},

      {"id": "ls_04c", "label": "Exit signs and emergency illumination are in acceptable condition and functional on battery backup", "type": "RATING_5"},
      {"id": "ls_04d", "label": "Describe the exit sign or emergency illumination deficiency", "type": "TEXT"},
      {"id": "ls_04u", "label": "Exit sign or emergency illumination repair urgency", "type": "STOPLIGHT"},
      {"id": "ls_04e", "label": "Estimated exit sign or emergency illumination repair cost", "type": "TEXT"},

      {"id": "ls_05c", "label": "Portable fire extinguishers are properly mounted, charged, and current on annual inspection", "type": "RATING_5"},
      {"id": "ls_05d", "label": "Describe the fire extinguisher deficiency", "type": "TEXT"},
      {"id": "ls_05u", "label": "Fire extinguisher repair urgency", "type": "STOPLIGHT"},
      {"id": "ls_05e", "label": "Estimated fire extinguisher repair cost", "type": "TEXT"},

      {"id": "in_01c", "label": "Wall finishes (paint, tile, paneling) throughout the facility are in acceptable condition", "type": "RATING_5"},
      {"id": "in_01d", "label": "Describe the wall finish deficiency", "type": "TEXT"},
      {"id": "in_01u", "label": "Wall finish repair urgency", "type": "STOPLIGHT"},
      {"id": "in_01e", "label": "Estimated wall finish repair cost", "type": "TEXT"},

      {"id": "in_02c", "label": "Ceiling finishes (ACT, drywall, exposed structure) are in acceptable condition with no water stains or missing tiles", "type": "RATING_5"},
      {"id": "in_02d", "label": "Describe the ceiling finish deficiency", "type": "TEXT"},
      {"id": "in_02u", "label": "Ceiling finish repair urgency", "type": "STOPLIGHT"},
      {"id": "in_02e", "label": "Estimated ceiling finish repair cost", "type": "TEXT"},

      {"id": "in_03c", "label": "Floor finishes (tile, VCT, carpet, concrete, wood) are in acceptable condition with no safety hazards", "type": "RATING_5"},
      {"id": "in_03d", "label": "Describe the floor finish deficiency", "type": "TEXT"},
      {"id": "in_03u", "label": "Floor finish repair urgency", "type": "STOPLIGHT"},
      {"id": "in_03e", "label": "Estimated floor finish repair cost", "type": "TEXT"},

      {"id": "in_04c", "label": "Interior doors, frames, and hardware are in acceptable condition and operate correctly", "type": "RATING_5"},
      {"id": "in_04d", "label": "Describe the interior door or hardware deficiency", "type": "TEXT"},
      {"id": "in_04u", "label": "Interior door or hardware repair urgency", "type": "STOPLIGHT"},
      {"id": "in_04e", "label": "Estimated interior door or hardware repair cost", "type": "TEXT"},

      {"id": "in_05c", "label": "Stairs, landings, treads, nosings, and handrails are in acceptable condition and meet code", "type": "RATING_5"},
      {"id": "in_05d", "label": "Describe the stair or handrail deficiency", "type": "TEXT"},
      {"id": "in_05u", "label": "Stair or handrail repair urgency", "type": "STOPLIGHT"},
      {"id": "in_05e", "label": "Estimated stair or handrail repair cost", "type": "TEXT"},

      {"id": "ad_01c", "label": "Accessible parking spaces, signage, and approach path meet ADA requirements and are in acceptable condition", "type": "RATING_5", "show_if": {"field": "fp_01", "answer": "YES"}},
      {"id": "ad_01d", "label": "Describe the accessible parking or approach path deficiency", "type": "TEXT"},
      {"id": "ad_01u", "label": "Accessible parking or approach path repair urgency", "type": "STOPLIGHT"},
      {"id": "ad_01e", "label": "Estimated accessible parking or approach path repair cost", "type": "TEXT"},

      {"id": "ad_02c", "label": "Accessible building entrance (ramps, level landing, door hardware, and clearances) meets ADA requirements", "type": "RATING_5"},
      {"id": "ad_02d", "label": "Describe the accessible entrance deficiency", "type": "TEXT"},
      {"id": "ad_02u", "label": "Accessible entrance repair urgency", "type": "STOPLIGHT"},
      {"id": "ad_02e", "label": "Estimated accessible entrance repair cost", "type": "TEXT"},

      {"id": "ad_03c", "label": "Interior accessible routes, restroom facilities, and hardware meet ADA requirements and are in acceptable condition", "type": "RATING_5"},
      {"id": "ad_03d", "label": "Describe the interior accessible route or restroom deficiency", "type": "TEXT"},
      {"id": "ad_03u", "label": "Interior accessible route or restroom repair urgency", "type": "STOPLIGHT"},
      {"id": "ad_03e", "label": "Estimated interior accessible route or restroom repair cost", "type": "TEXT"},

      {"id": "ad_04c", "label": "Elevator or accessibility lift is in acceptable condition with current inspection certificate", "type": "RATING_5", "show_if": {"field": "fp_14", "answer": "YES"}},
      {"id": "ad_04d", "label": "Describe the elevator or lift deficiency", "type": "TEXT"},
      {"id": "ad_04u", "label": "Elevator or lift repair urgency", "type": "STOPLIGHT"},
      {"id": "ad_04e", "label": "Estimated elevator or lift repair cost", "type": "TEXT"},

      {"id": "sp_01c", "label": "Kitchen and food service equipment, finishes, and utilities are in acceptable condition and code-compliant", "type": "RATING_5", "show_if": {"field": "fp_05", "answer": "YES"}},
      {"id": "sp_01d", "label": "Describe the kitchen or food service equipment deficiency", "type": "TEXT"},
      {"id": "sp_01u", "label": "Kitchen or food service equipment repair urgency", "type": "STOPLIGHT"},
      {"id": "sp_01e", "label": "Estimated kitchen or food service equipment repair cost", "type": "TEXT"},

      {"id": "sp_02c", "label": "Cafeteria or dining area finishes, furniture, and equipment are in acceptable condition", "type": "RATING_5", "show_if": {"field": "fp_06", "answer": "YES"}},
      {"id": "sp_02d", "label": "Describe the cafeteria or dining area deficiency", "type": "TEXT"},
      {"id": "sp_02u", "label": "Cafeteria or dining area repair urgency", "type": "STOPLIGHT"},
      {"id": "sp_02e", "label": "Estimated cafeteria or dining area repair cost", "type": "TEXT"},

      {"id": "sp_03c", "label": "Auditorium, stage, or event hall structure, seating, A/V equipment, and finishes are in acceptable condition", "type": "RATING_5", "show_if": {"field": "fp_07", "answer": "YES"}},
      {"id": "sp_03d", "label": "Describe the auditorium or event hall deficiency", "type": "TEXT"},
      {"id": "sp_03u", "label": "Auditorium or event hall repair urgency", "type": "STOPLIGHT"},
      {"id": "sp_03e", "label": "Estimated auditorium or event hall repair cost", "type": "TEXT"},

      {"id": "sp_04c", "label": "Gymnasium, sports court, and athletic equipment are in acceptable condition and safe for use", "type": "RATING_5", "show_if": {"field": "fp_08", "answer": "YES"}},
      {"id": "sp_04d", "label": "Describe the gymnasium or sports court deficiency", "type": "TEXT"},
      {"id": "sp_04u", "label": "Gymnasium or sports court repair urgency", "type": "STOPLIGHT"},
      {"id": "sp_04e", "label": "Estimated gymnasium or sports court repair cost", "type": "TEXT"},

      {"id": "sp_05c", "label": "Swimming pool structure, mechanical systems, deck, and safety equipment are in acceptable condition and current on inspections", "type": "RATING_5", "show_if": {"field": "fp_04", "answer": "YES"}},
      {"id": "sp_05d", "label": "Describe the swimming pool deficiency", "type": "TEXT"},
      {"id": "sp_05u", "label": "Swimming pool repair urgency", "type": "STOPLIGHT"},
      {"id": "sp_05e", "label": "Estimated swimming pool repair cost", "type": "TEXT"},

      {"id": "sp_06c", "label": "Laundry facility equipment, plumbing, electrical supply, and finishes are in acceptable condition", "type": "RATING_5", "show_if": {"field": "fp_15", "answer": "YES"}},
      {"id": "sp_06d", "label": "Describe the laundry facility deficiency", "type": "TEXT"},
      {"id": "sp_06u", "label": "Laundry facility repair urgency", "type": "STOPLIGHT"},
      {"id": "sp_06e", "label": "Estimated laundry facility repair cost", "type": "TEXT"},

      {"id": "oa_01", "label": "Overall facility condition rating (Excellent / Good / Fair / Poor / Critical)", "type": "TEXT"},
      {"id": "oa_02", "label": "Estimated total deferred maintenance cost", "type": "TEXT"},
      {"id": "oa_03", "label": "Priority recommendations and immediate actions required", "type": "TEXT"},
      {"id": "oa_04", "label": "Inspector certification, signature, and date", "type": "TEXT"}

    ]
  }'
)
ON CONFLICT (id) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      json_schema = EXCLUDED.json_schema,
      updated_at  = NOW();

-- FCA Deficiency Follow-up template (items added dynamically by the generate-inspection API)
INSERT INTO fm_inspection_templates (id, org_id, name, description, json_schema)
VALUES (
  '20000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'FCA Deficiency Follow-up Inspection',
  'Automatically generated inspection from FCA deficiencies rated 1 or 2. Items are dynamically created — one per deficient FCA component. Use the runner to add photo evidence and confirm each deficiency. Failed items auto-create work orders.',
  '{"fields": []}'
)
ON CONFLICT (id) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      json_schema = EXCLUDED.json_schema,
      updated_at  = NOW();
