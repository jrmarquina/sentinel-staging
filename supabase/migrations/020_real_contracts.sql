-- ============================================================
-- Migration 020: Replace mock contracts with real SAP contracts
-- Deletes all existing contracts and inserts 33 real contracts
-- from the Guaynabo municipality SAP system.
-- ============================================================

DO $$
DECLARE
  v_org_id  UUID;
  v_user_id UUID;
BEGIN
  SELECT id INTO v_org_id  FROM organizations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user_id FROM profiles      ORDER BY created_at LIMIT 1;

  IF v_org_id IS NULL OR v_user_id IS NULL THEN
    RAISE NOTICE 'No org or user found — skipping.';
    RETURN;
  END IF;

  -- Remove all existing contracts (and cascade soft-delete bids)
  DELETE FROM contract_bids WHERE contract_id IN (
    SELECT id FROM contracts WHERE org_id = v_org_id
  );
  DELETE FROM contracts WHERE org_id = v_org_id;

  -- Insert 33 real SAP contracts
  INSERT INTO contracts (org_id, number, title, description, status, vendor_name, contract_value, end_date, created_by)
  VALUES
    (v_org_id, '4600007228', '2026-000669 Insp Sanitary Pipe COE',                        'Our ref: 2026-000669', 'active', 'RAMOS-AYALA & ASSOCIATES, PSC',                  12000.00,      '2026-04-02', v_user_id),
    (v_org_id, '4600006843', 'Diseño Renovación y Modernización MQM',                     'Our ref: 2025-000987', 'active', 'ABACUS ARCHITECTURE, PSC',                       399740.00,     '2026-04-16', v_user_id),
    (v_org_id, '4600007204', '2026-000603 Insp. Museo Musica',                            'Our ref: 2026-000603', 'active', 'RAMOS-AYALA & ASSOCIATES, PSC',                  24000.00,      '2026-04-17', v_user_id),
    (v_org_id, '4600007225', '2026-000644 Arte gráfico fachada MQM',                     'Our ref: 2026-000644', 'active', 'KENNETH A. ZENQUIS VELEZ',                        6000.00,       '2026-04-27', v_user_id),
    (v_org_id, '4600006298', 'Music Museum Facilities — Construction & Rehabilitation',   'Our ref: 2024-000739', 'active', 'CONSTRUCTORES GILMAR Y WORCAPS WORK',             3319042.52,    '2026-04-29', v_user_id),
    (v_org_id, '4600006852', 'Inspección / Proyecto Food Truck Park',                     'Our ref: 2025-001006', 'active', 'ENZO ENGINEERING, PSC',                          150000.00,     '2026-04-29', v_user_id),
    (v_org_id, '4600007146', '2026-000504 Insp. Liga Atlética',                           'Our ref: 2026-000504', 'active', 'ETR GROUP, PSC',                                 40800.00,      '2026-04-29', v_user_id),
    (v_org_id, '4600007222', '2026-000667 Arquitectura Box Culvert Fra',                  'Our ref: 2026-000667', 'active', 'ABACUS ARCHITECTURE, PSC',                       139300.00,     '2026-04-29', v_user_id),
    (v_org_id, '4600006416', 'Evaluación proyecto revitalización Museo',                  'Our ref: 2024-001073', 'active', 'ARTEGRAFIKO CORP',                               897720.00,     '2026-04-30', v_user_id),
    (v_org_id, '4600006640', 'Damage PW03924-173264 Mario Jimenez Rec',                   'Our ref: 2025-000486', 'active', 'REYES CONTRACTOR GROUP INC Y/O FIRST RESPONSE',  2269907.18,    '2026-04-30', v_user_id),
    (v_org_id, '4600006819', 'Inspección / Cementerio Mun. Bello Monte',                  'Our ref: 2025-000926', 'active', 'ENZO ENGINEERING, PSC',                          32500.00,      '2026-05-07', v_user_id),
    (v_org_id, '4600007239', 'Coord. evaluación y Diseño A/C Torrimar',                   'Our ref: 2026-000707', 'active', 'EBP DESIGN GROUP CONSULTING ENGINEERS',          2007.00,       '2026-05-10', v_user_id),
    (v_org_id, '4600007209', 'Subasta 24-F-094 OC #2 Guaynabo Food Con',                  'Our ref: 2026-000622', 'active', 'CONSTRUCTORES GILMAR Y WORCAPS WORK',             283280.23,     '2026-05-13', v_user_id),
    (v_org_id, '4600007260', '2026-000737 Mensura calle Ramón Emeterio',                  'Our ref: 2026-000737', 'active', 'ENRIQUE REYES TORRES D/B/A ERT & ASSOCIATES',    5500.00,       '2026-05-21', v_user_id),
    (v_org_id, '4600007261', '2026-000738 Serv Mensura PR-837',                           'Our ref: 2026-000738', 'active', 'ENRIQUE REYES TORRES D/B/A ERT & ASSOCIATES',    9500.00,       '2026-05-21', v_user_id),
    (v_org_id, '4600006781', 'Servicios de Ingeniería y Arquitectura',                    'Our ref: 2025-000805', 'active', 'SHARETECH GROUP ENGINEERING, LLC',               58900.00,      '2026-05-28', v_user_id),
    (v_org_id, '4600006809', 'Inspección / Mario Jimenez Complex',                        'Our ref: 2025-000868', 'active', 'TORRES-ROSA CONSULTING ENGINEERS PSC',           100500.00,     '2026-05-31', v_user_id),
    (v_org_id, '4600007005', 'Inspección / Imp to Mun at Valle Escondido',                'Our ref: 2026-000206', 'active', 'KAN ENGINEERING GROUP PSC',                      77440.00,      '2026-05-31', v_user_id),
    (v_org_id, '4600007201', '2026-000602 Servicios de Arquitectura',                     'Our ref: 2026-000602', 'active', 'P & S CONSULTANTS, LLC',                         99226.20,      '2026-05-31', v_user_id),
    (v_org_id, '4600006881', 'Subasta 25-F-045 Imp to Guaraguao Ward',                    'Our ref: 2025-001106', 'active', 'BEGINNERS GENERAL CONTRACTORS',                  1170682.00,    '2026-06-09', v_user_id),
    (v_org_id, '4600007097', 'Electrical Systems Maintenance — Sanitary',                 'Our ref: 2026-000344', 'active', 'ENCARNACION ELECTRIC',                           15500.00,      '2026-06-10', v_user_id),
    (v_org_id, '4600006762', 'Damage PW08155-313959 Canta Gallo Court',                   'Our ref: 2025-000755', 'active', 'JC & ASSOCIATES PROPERTY',                       686972.51,     '2026-06-12', v_user_id),
    (v_org_id, '4600007206', '2026-000617 Servicio de Mensura',                           'Our ref: 2026-000617', 'active', 'ENRIQUE REYES TORRES D/B/A ERT & ASSOCIATES',    5000.00,       '2026-06-15', v_user_id),
    (v_org_id, '4600006842', 'Diseño proy. Distrito Deportivo Guaynabo',                  'Our ref: 2025-000986', 'active', 'ABACUS ARCHITECTURE, PSC',                       1347886.00,    '2026-06-16', v_user_id),
    (v_org_id, '4600007134', '2026-000465 Insp. / Torrimar Central Command',              'Our ref: 2026-000465', 'active', 'NG ARCHITECTS, LLC',                             59200.00,      '2026-06-17', v_user_id),
    (v_org_id, '4600006903', 'Damage #173295 Alturas de Torrimar Oeste',                  'Our ref: 2025-001168', 'active', 'CONSTRUCTORA AZARIA INC',                        618059.19,     '2026-06-23', v_user_id),
    (v_org_id, '4600006389', 'Subasta 24-F-089 Ramirez de Arellano Ave',                  'Our ref: 2024-001011', 'active', 'CHES ELECTRIC INC',                              2183479.11,    '2026-06-29', v_user_id),
    (v_org_id, '4600002972', 'Tolling Systems Conector Los Filtros',                      'Our ref: 2016-001115', 'active', 'EMOVIS OPERATIONS NORTH AMERICA INC',            2721900.00,    '2026-06-30', v_user_id),
    (v_org_id, '4600006905', 'Subasta 25-F-071, Construction of wall',                    'Our ref: 2025-001172', 'active', 'REYES CONTRACTOR GROUP INC Y/O FIRST RESPONSE',  438556.75,     '2026-06-30', v_user_id),
    (v_org_id, '4600006923', 'Servicios de Consultoría Ambiental',                        'Our ref: 2026-000063', 'active', 'ENVIRONMENTAL DEVELOPMENT & CONSULTING',         40000.00,      '2026-06-30', v_user_id),
    (v_org_id, '4600006956', 'Consultoría Eléctrica',                                     'Our ref: 2026-000124', 'active', 'ESOL ENGINEERING GROUP, PSC',                    140000.00,     '2026-06-30', v_user_id),
    (v_org_id, '4600007108', 'Diseño mejoras area recreativa Colinas M',                  'Our ref: 2026-000374', 'active', 'CORPORACION PROFESIONAL',                        33700.00,      '2026-06-30', v_user_id),
    (v_org_id, '4600007122', 'Servicios Prof. de Gerencia de Construcción',               'Our ref: 2026-000440', 'active', 'KAN ENGINEERING GROUP PSC',                      102960.00,     '2026-06-30', v_user_id);

  RAISE NOTICE 'Inserted 33 real SAP contracts for org %', v_org_id;
END $$;
