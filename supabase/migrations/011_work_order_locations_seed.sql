-- ============================================================
-- Migration 011: Seed lat/lng for mock work orders
-- All coordinates verified inside Guaynabo, PR municipality.
-- ============================================================

DO $$
BEGIN
  -- W1: Emergency Pothole — PR-177 at Camarones intersection
  UPDATE work_orders SET latitude = 18.3651, longitude = -66.1069
  WHERE number = 'WO-2026-0101';

  -- W2: Street Light Outages — Urb. Santa Rosa
  UPDATE work_orders SET latitude = 18.3835, longitude = -66.1388
  WHERE number = 'WO-2026-0102';

  -- W3: Storm Drain Cleaning — Barrio Camarones
  UPDATE work_orders SET latitude = 18.3618, longitude = -66.1055
  WHERE number = 'WO-2026-0103';

  -- W4: Traffic Sign Replacement — PR-167 Sector Río
  UPDATE work_orders SET latitude = 18.3442, longitude = -66.0801
  WHERE number = 'WO-2026-0104';

  -- W5: Bridge Inspection — Puente Quebrada Maracaibo (Mamey)
  UPDATE work_orders SET latitude = 18.3372, longitude = -66.1225
  WHERE number = 'WO-2025-0401';

  -- W6: Pothole Cluster — Carr. 2 Service Road, Guaraguao
  UPDATE work_orders SET latitude = 18.3478, longitude = -66.1502
  WHERE number = 'WO-2026-0105';

  -- W7: Fence Repair — Parque Pueblo Viejo
  UPDATE work_orders SET latitude = 18.4128, longitude = -66.1075
  WHERE number = 'WO-2026-0106';

  -- W8: ADA Curb Ramp — Calle Carazo at Plaza Guaynabo
  UPDATE work_orders SET latitude = 18.3722, longitude = -66.1105
  WHERE number = 'WO-2025-0402';

  -- W9: Slope Erosion — Barrio Sonadora
  UPDATE work_orders SET latitude = 18.3228, longitude = -66.1418
  WHERE number = 'WO-2026-0107';

  -- W10: Playground Equipment — Parque Frailes
  UPDATE work_orders SET latitude = 18.3938, longitude = -66.1102
  WHERE number = 'WO-2026-0108';

  -- W11: Graffiti Removal (closed — skip map pin)
  -- W12: Pavement Marking — Hato Nuevo Access Road
  UPDATE work_orders SET latitude = 18.3252, longitude = -66.0912
  WHERE number = 'WO-2026-0110';

  RAISE NOTICE 'Work order lat/lng seed applied.';
END $$;
