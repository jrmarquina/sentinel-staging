-- ================================================================
-- 027_fm_work_order_schema.sql
-- Extend fm_work_orders for direct (non-inspection) submissions
--
-- Changes:
--   1. Status:       Add PENDING_REVIEW before OPEN
--   2. Category:     18-value enum (client's full type list)
--   3. Assignee type: HS_STAFF | MUNICIPALITY | EXTERNAL_SUPPLIER
--                     | DIRECTOR_REFERRAL
--   4. Source:       INSPECTION | DIRECT (how the WO was created)
--   5. Indexes on new columns
--   6. Seed backfill: assign categories to existing seed WOs
--   7. New PENDING_REVIEW seed rows for triage-queue testing
--
-- Safe for existing data:
--   · New columns are nullable — no existing rows break
--   · Status CHECK is extended, not replaced — OPEN/IN_PROGRESS/
--     COMPLETED still valid; existing WOs remain OPEN
--   · No RLS changes (handled in 026)
-- ================================================================


-- ── 1. STATUS — add PENDING_REVIEW ───────────────────────────
-- The existing inline CHECK constraint is unnamed; Postgres
-- auto-names it fm_work_orders_status_check.  We drop it by
-- scanning pg_constraint so this survives any name variation.

DO $$
DECLARE
  v_con TEXT;
BEGIN
  SELECT conname INTO v_con
  FROM   pg_constraint
  WHERE  conrelid = 'fm_work_orders'::regclass
    AND  contype  = 'c'
    AND  pg_get_constraintdef(oid) LIKE '%OPEN%IN_PROGRESS%COMPLETED%'
  LIMIT 1;

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE fm_work_orders DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

ALTER TABLE fm_work_orders
  ADD CONSTRAINT fm_wo_status_check
  CHECK (status IN (
    'PENDING_REVIEW',   -- submitted by contributor, awaiting FM Manager triage
    'OPEN',             -- triaged, ready to assign / work begins
    'IN_PROGRESS',      -- actively being worked
    'COMPLETED'         -- work done, closed
  ));


-- ── 2. CATEGORY ───────────────────────────────────────────────
-- 18 types from the client's operational classification list.
-- Display labels (for UI) are the Spanish names; slugs are the
-- English ALL_CAPS values stored in the DB.

ALTER TABLE fm_work_orders
  ADD COLUMN IF NOT EXISTS category TEXT
  CHECK (category IS NULL OR category IN (
    'PLOMERIA',           -- Plomería
    'CARPINTERIA',        -- Carpintería
    'ELECTRICIDAD',       -- Electricidad
    'CISTERNA',           -- Cisterna
    'TRAMPA_GRASA',       -- Trampa de Grasa
    'AREAS_VERDES',       -- Áreas Verdes
    'AIRE_ACONDICIONADO', -- Acondicionadores de Aire
    'REFRIGERACION',      -- Nevera / Congeladores
    'ALARMA_INCENDIO',    -- Alarmas de Incendios
    'EXTINTORES',         -- Extintores de Incendios
    'CONTROL_ACCESO',     -- Control de Acceso
    'CONTROL_PLAGAS',     -- Control de Plagas
    'ESTRUCTURA',         -- Estructura
    'FILTRACIONES',       -- Filtraciones (techo / paredes / ventanas)
    'GENERADOR',          -- Generador Eléctrico
    'PINTURA',            -- Pintura
    'POZO_SEPTICO',       -- Pozo Séptico
    'ROTULACION'          -- Rotulación
  ));

COMMENT ON COLUMN fm_work_orders.category IS
  'Work order trade/type classification. '
  'NULL = uncategorised (legacy or inspection-auto-generated rows). '
  'Display labels: PLOMERIA→Plomería, CARPINTERIA→Carpintería, '
  'ELECTRICIDAD→Electricidad, CISTERNA→Cisterna, '
  'TRAMPA_GRASA→Trampa de Grasa, AREAS_VERDES→Áreas Verdes, '
  'AIRE_ACONDICIONADO→Acondicionadores de Aire, '
  'REFRIGERACION→Refrigeración (nevera/congeladores), '
  'ALARMA_INCENDIO→Alarmas de Incendios, EXTINTORES→Extintores, '
  'CONTROL_ACCESO→Control de Acceso, CONTROL_PLAGAS→Control de Plagas, '
  'ESTRUCTURA→Estructura, FILTRACIONES→Filtraciones, '
  'GENERADOR→Generador Eléctrico, PINTURA→Pintura, '
  'POZO_SEPTICO→Pozo Séptico, ROTULACION→Rotulación';


-- ── 3. ASSIGNEE TYPE ──────────────────────────────────────────
-- Who the FM Manager routes the WO to after triage.

ALTER TABLE fm_work_orders
  ADD COLUMN IF NOT EXISTS assignee_type TEXT
  CHECK (assignee_type IS NULL OR assignee_type IN (
    'HS_STAFF',           -- Personal de Mantenimiento Head Start
    'MUNICIPALITY',       -- Municipio
    'EXTERNAL_SUPPLIER',  -- Suplidor Externo
    'DIRECTOR_REFERRAL'   -- Referido a Directora (requires budget approval)
  ));

COMMENT ON COLUMN fm_work_orders.assignee_type IS
  'Routing decision made by FM Manager at triage. '
  'DIRECTOR_REFERRAL triggers a notification to all Director-role users.';


-- ── 4. SOURCE ─────────────────────────────────────────────────
-- Tracks whether the WO was system-created from an inspection
-- or submitted directly by a contributor / manager.

ALTER TABLE fm_work_orders
  ADD COLUMN IF NOT EXISTS source TEXT
  NOT NULL DEFAULT 'DIRECT'
  CHECK (source IN (
    'INSPECTION',  -- auto-created by the failed checklist item trigger
    'DIRECT'       -- created manually via the work order submission form
  ));

-- Back-fill: WOs that were linked to an inspection at creation
-- are retroactively marked INSPECTION source.
UPDATE fm_work_orders
SET source = 'INSPECTION'
WHERE inspection_id IS NOT NULL
  AND source = 'DIRECT';

COMMENT ON COLUMN fm_work_orders.source IS
  'INSPECTION = auto-created from a failed checklist item. '
  'DIRECT = submitted via the work order form (by a manager or contributor).';


-- ── 5. INDEXES ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fm_wo_category
  ON fm_work_orders(category) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fm_wo_assignee_type
  ON fm_work_orders(assignee_type) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fm_wo_source
  ON fm_work_orders(source) WHERE deleted_at IS NULL;

-- Composite: triage queue — managers poll this frequently
CREATE INDEX IF NOT EXISTS idx_fm_wo_pending_review
  ON fm_work_orders(org_id, status, created_at DESC)
  WHERE status = 'PENDING_REVIEW' AND deleted_at IS NULL;

-- Composite: contributor tracks own submissions
CREATE INDEX IF NOT EXISTS idx_fm_wo_submitted_by
  ON fm_work_orders(submitted_by_id, org_id, status)
  WHERE deleted_at IS NULL;


-- ── 6. SEED BACKFILL — add categories to existing WOs ─────────
-- Maps the seed WO titles to their trade category.
-- Uses title pattern matching so this is idempotent.

DO $$
BEGIN

  -- Structural
  UPDATE fm_work_orders SET category = 'ESTRUCTURA'
  WHERE category IS NULL AND title ILIKE '%structural%';

  -- Electrical
  UPDATE fm_work_orders SET category = 'ELECTRICIDAD'
  WHERE category IS NULL AND (
    title ILIKE '%electrical%' OR title ILIKE '%electric%'
    OR title ILIKE '%panel%' OR title ILIKE '%wiring%'
    OR title ILIKE '%lighting%' OR title ILIKE '%outlet%'
  );

  -- Generator
  UPDATE fm_work_orders SET category = 'GENERADOR'
  WHERE category IS NULL AND (
    title ILIKE '%generator%' OR title ILIKE '%generador%'
  );

  -- Plumbing
  UPDATE fm_work_orders SET category = 'PLOMERIA'
  WHERE category IS NULL AND (
    title ILIKE '%plumb%' OR title ILIKE '%pipe%'
    OR title ILIKE '%leak%' OR title ILIKE '%water%'
    OR title ILIKE '%drain%'
  );

  -- Roof / wall / window leaks
  UPDATE fm_work_orders SET category = 'FILTRACIONES'
  WHERE category IS NULL AND (
    title ILIKE '%roof%' OR title ILIKE '%filtration%'
    OR title ILIKE '%seep%' OR title ILIKE '%infiltrat%'
  );

  -- HVAC / AC
  UPDATE fm_work_orders SET category = 'AIRE_ACONDICIONADO'
  WHERE category IS NULL AND (
    title ILIKE '%hvac%' OR title ILIKE '%air condition%'
    OR title ILIKE '%cooling%' OR title ILIKE '%ac unit%'
  );

  -- Fire extinguisher
  UPDATE fm_work_orders SET category = 'EXTINTORES'
  WHERE category IS NULL AND (
    title ILIKE '%extinguisher%' OR title ILIKE '%extintor%'
  );

  -- Fire alarm
  UPDATE fm_work_orders SET category = 'ALARMA_INCENDIO'
  WHERE category IS NULL AND (
    title ILIKE '%alarm%' OR title ILIKE '%smoke%'
    OR title ILIKE '%fire detect%'
  );

  -- Carpentry / doors / windows
  UPDATE fm_work_orders SET category = 'CARPINTERIA'
  WHERE category IS NULL AND (
    title ILIKE '%door%' OR title ILIKE '%window%'
    OR title ILIKE '%carpent%' OR title ILIKE '%wood%'
    OR title ILIKE '%frame%'
  );

  -- Paint
  UPDATE fm_work_orders SET category = 'PINTURA'
  WHERE category IS NULL AND (
    title ILIKE '%paint%' OR title ILIKE '%pintura%'
  );

  -- Green areas / landscaping
  UPDATE fm_work_orders SET category = 'AREAS_VERDES'
  WHERE category IS NULL AND (
    title ILIKE '%landscap%' OR title ILIKE '%grass%'
    OR title ILIKE '%garden%' OR title ILIKE '%tree%'
    OR title ILIKE '%green%'
  );

  -- Pest control
  UPDATE fm_work_orders SET category = 'CONTROL_PLAGAS'
  WHERE category IS NULL AND (
    title ILIKE '%pest%' OR title ILIKE '%roach%'
    OR title ILIKE '%rodent%' OR title ILIKE '%termit%'
  );

  -- Signage
  UPDATE fm_work_orders SET category = 'ROTULACION'
  WHERE category IS NULL AND (
    title ILIKE '%sign%' OR title ILIKE '%label%'
    OR title ILIKE '%rotul%'
  );

  -- Anything remaining: default to ESTRUCTURA (most common for seed data)
  -- so no WO is left with NULL category in the test dataset
  UPDATE fm_work_orders
  SET category = 'ESTRUCTURA'
  WHERE category IS NULL;

END $$;


-- ── 7. SEED — PENDING_REVIEW work orders for triage testing ───
-- Adds 5 WOs in PENDING_REVIEW status so the FM Manager's triage
-- queue is populated from day one of testing.
-- Only inserted if the seed properties exist.

DO $$
DECLARE
  v_org  UUID;
  v_p1   UUID;  -- first property
  v_p2   UUID;  -- second property
  v_p3   UUID;  -- third property
BEGIN
  SELECT id INTO v_org FROM organizations ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;

  -- Use any three active properties from the seed
  SELECT id INTO v_p1 FROM fm_properties WHERE org_id = v_org
    AND status = 'ACTIVE' ORDER BY created_at LIMIT 1 OFFSET 0;
  SELECT id INTO v_p2 FROM fm_properties WHERE org_id = v_org
    AND status = 'ACTIVE' ORDER BY created_at LIMIT 1 OFFSET 1;
  SELECT id INTO v_p3 FROM fm_properties WHERE org_id = v_org
    AND status = 'ACTIVE' ORDER BY created_at LIMIT 1 OFFSET 2;

  IF v_p1 IS NULL THEN RETURN; END IF;

  -- Only seed if no PENDING_REVIEW rows exist yet
  IF EXISTS (
    SELECT 1 FROM fm_work_orders
    WHERE org_id = v_org AND status = 'PENDING_REVIEW'
  ) THEN RETURN; END IF;

  INSERT INTO fm_work_orders
    (org_id, property_id, title, description,
     status, priority, category, source,
     due_date)
  VALUES

    -- From a Zone Manager: AC not cooling
    (v_org, v_p1,
     'Aire Acondicionado no enfría — Salón Principal',
     'El AC del salón principal lleva 3 días sin enfriar correctamente. '
     || 'Personal reporta temperatura sobre 85°F durante horas de servicio.',
     'PENDING_REVIEW', 'HIGH', 'AIRE_ACONDICIONADO', 'DIRECT',
     NOW() + INTERVAL '3 days'),

    -- From a Nutrition Manager: refrigeration issue
    (v_org, COALESCE(v_p2, v_p1),
     'Congelador de cocina no mantiene temperatura',
     'El congelador de la cocina marca 28°F en lugar de 0°F. '
     || 'Alimentos en riesgo. Revisión urgente requerida.',
     'PENDING_REVIEW', 'HIGH', 'REFRIGERACION', 'DIRECT',
     NOW() + INTERVAL '1 day'),

    -- From a Zone Manager: roof leak
    (v_org, COALESCE(v_p2, v_p1),
     'Filtración de techo en área de comedor',
     'Después de las lluvias del martes se observó filtración activa '
     || 'en el techo del comedor, lado este. Cubo colocado temporalmente.',
     'PENDING_REVIEW', 'MEDIUM', 'FILTRACIONES', 'DIRECT',
     NOW() + INTERVAL '7 days'),

    -- From a Zone Manager: broken door
    (v_org, COALESCE(v_p3, v_p1),
     'Puerta de entrada principal no cierra correctamente',
     'La puerta principal tiene el cerrojo dañado y no asegura bien. '
     || 'Personal tuvo que usar cuerda para mantenerla cerrada.',
     'PENDING_REVIEW', 'MEDIUM', 'CARPINTERIA', 'DIRECT',
     NOW() + INTERVAL '5 days'),

    -- From a Nutrition Manager: pest sighting
    (v_org, COALESCE(v_p3, v_p1),
     'Avistamiento de cucarachas en área de almacén de alimentos',
     'Personal de nutrición reporta avistamiento de cucarachas en '
     || 'el almacén de alimentos. Se requiere fumigación inmediata.',
     'PENDING_REVIEW', 'HIGH', 'CONTROL_PLAGAS', 'DIRECT',
     NOW() + INTERVAL '2 days');

END $$;


-- ── END OF MIGRATION ─────────────────────────────────────────
-- Next: 028_pw_role_migration.sql (PW RLS → capability system)
--
-- App-side work that depends on this migration:
--   API-1  POST /api/fm/work-orders        — accept category + assignee_type
--   API-2  PATCH /api/fm/work-orders/[id]  — PENDING_REVIEW transitions
--   API-3  GET /api/fm/work-orders         — scope by capability level
--   FE-4   PENDING_REVIEW tab in WO list
--   FE-5   Status transition guards by role
--   FE-6   WO create form — manager (category + assignee_type)
--   FE-7   WO create form — contributor (simplified submission)
-- ================================================================
