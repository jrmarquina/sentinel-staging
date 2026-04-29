import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'
import { z } from 'zod'

// ── Helpers ────────────────────────────────────────────────────────────────

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

// ── Valid values (mirrors 027_fm_work_order_schema.sql) ────────────────────

const VALID_CATEGORIES = [
  'PLOMERIA', 'CARPINTERIA', 'ELECTRICIDAD', 'CISTERNA', 'TRAMPA_GRASA',
  'AREAS_VERDES', 'AIRE_ACONDICIONADO', 'REFRIGERACION', 'ALARMA_INCENDIO',
  'EXTINTORES', 'CONTROL_ACCESO', 'CONTROL_PLAGAS', 'ESTRUCTURA',
  'FILTRACIONES', 'GENERADOR', 'PINTURA', 'POZO_SEPTICO', 'ROTULACION',
] as const

const VALID_ASSIGNEE_TYPES = [
  'HS_STAFF', 'MUNICIPALITY', 'EXTERNAL_SUPPLIER', 'DIRECTOR_REFERRAL',
] as const

const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const

// ── Capability helpers ─────────────────────────────────────────────────────

/**
 * Returns true when the session has FM manager-level access.
 * Checks the new capability field first; falls back to legacy app_role
 * so users whose user_roles row hasn't been migrated yet still work.
 */
function isFmManager(capability: string | null, role: string): boolean {
  if (capability) return ['org_admin', 'org_manager'].includes(capability)
  return ['admin', 'supervisor'].includes(role)
}

/**
 * Returns true when the session can submit (but not triage) work orders.
 * Contributors go through PENDING_REVIEW; managers go straight to OPEN.
 */
function canSubmitWO(capability: string | null, role: string): boolean {
  if (capability) return ['org_admin', 'org_manager', 'contributor'].includes(capability)
  return ['admin', 'supervisor', 'inspector'].includes(role)
}

// ── Validation schemas ──────────────────────────────────────────────────────

// Shared base — fields accepted from any authorised user
const baseSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or fewer'),

  description: z
    .string()
    .min(10, 'Please describe the issue in at least 10 characters')
    .max(2000, 'Description must be 2000 characters or fewer'),

  property_id: z
    .string()
    .uuid('Invalid property'),

  category: z
    .enum(VALID_CATEGORIES, { errorMap: () => ({ message: 'Invalid category' }) })
    .optional(),

  priority: z
    .enum(VALID_PRIORITIES)
    .optional()
    .default('MEDIUM'),

  due_date: z
    .string()
    .datetime({ message: 'Invalid date format' })
    .nullable()
    .optional(),

  // Optional links to assets / inspections (normally set automatically)
  asset_id:          z.string().uuid().nullable().optional(),
  inspection_id:     z.string().uuid().nullable().optional(),
  checklist_item_id: z.string().uuid().nullable().optional(),
})

// Manager-only extra fields — applied only when isFmManager() is true
const managerExtras = z.object({
  assignee_type: z
    .enum(VALID_ASSIGNEE_TYPES, { errorMap: () => ({ message: 'Invalid assignee type' }) })
    .optional(),

  assigned_to_id: z
    .string()
    .uuid('Invalid assignee')
    .nullable()
    .optional(),
})

// Combined schema for managers
const managerSchema = baseSchema.merge(managerExtras)

// Stripped schema for contributors — manager fields are silently ignored
// even if sent, so a malicious client cannot self-assign or skip triage.
const contributorSchema = baseSchema

// ── GET /api/fm/work-orders ────────────────────────────────────────────────
// NOTE: This is the existing implementation — full capability-scoping
// is handled in API-3. For now it preserves current behaviour.

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!canSubmitWO(session.capability, session.role)) return err('Forbidden', 403)

    const supabase = createClient()
    const { searchParams } = new URL(req.url)
    const propertyId       = searchParams.get('propertyId')
    const assetId          = searchParams.get('assetId')
    const status           = searchParams.get('status')
    const inspectionId     = searchParams.get('inspectionId')
    const checklistItemId  = searchParams.get('checklistItemId')

    let query = supabase
      .from('fm_work_orders')
      .select(`
        *,
        fm_properties!inner(name, code),
        assigned_to:assigned_to_id(full_name),
        submitted_by:submitted_by_id(full_name)
      `)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (propertyId)      query = query.eq('property_id', propertyId)
    if (assetId)         query = query.eq('asset_id', assetId)
    if (status)          query = query.eq('status', status)
    if (inspectionId)    query = query.eq('inspection_id', inspectionId)
    if (checklistItemId) query = query.eq('checklist_item_id', checklistItemId)

    const { data, error } = await query
    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

// ── POST /api/fm/work-orders ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)

    const isManager    = isFmManager(session.capability, session.role)
    const canSubmit    = canSubmitWO(session.capability, session.role)

    if (!canSubmit) return err('Forbidden', 403)

    // ── Parse body ─────────────────────────────────────────────────────────
    let body: unknown
    try { body = await req.json() }
    catch { return err('Invalid JSON body', 400) }

    // Apply the appropriate schema based on capability
    const parsed = isManager
      ? managerSchema.safeParse(body)
      : contributorSchema.safeParse(body)

    if (!parsed.success) {
      return err(parsed.error.errors[0].message, 400)
    }

    const data = parsed.data

    // ── Determine initial status ────────────────────────────────────────────
    // Managers create WOs directly in OPEN (they are the FM Manager).
    // Contributors (Zone/Nutrition Managers) submit to PENDING_REVIEW
    // for the FM Manager to triage before work begins.
    const initialStatus = isManager ? 'OPEN' : 'PENDING_REVIEW'

    // ── Build insert payload ────────────────────────────────────────────────
    // Strip empty strings from optional UUID fields to avoid FK errors.
    function uuidOrUndefined(v: string | null | undefined) {
      return v && v.trim() !== '' ? v : undefined
    }

    const insertPayload: Record<string, unknown> = {
      org_id:            session.orgId,
      property_id:       data.property_id,
      title:             data.title,
      description:       data.description,
      category:          data.category ?? null,
      priority:          data.priority,
      due_date:          data.due_date ?? null,
      status:            initialStatus,
      source:            'DIRECT',
      submitted_by_id:   session.userId,   // always set server-side
      asset_id:          uuidOrUndefined(data.asset_id),
      inspection_id:     uuidOrUndefined(data.inspection_id),
      checklist_item_id: uuidOrUndefined(data.checklist_item_id),
    }

    // Manager-only fields — only included when the schema allowed them
    if (isManager) {
      const managerData = data as z.infer<typeof managerSchema>
      insertPayload.assignee_type  = managerData.assignee_type ?? null
      insertPayload.assigned_to_id = uuidOrUndefined(managerData.assigned_to_id)
    }

    // ── Insert ─────────────────────────────────────────────────────────────
    const supabase = createClient()
    const { data: created, error } = await supabase
      .from('fm_work_orders')
      .insert(insertPayload)
      .select(`
        *,
        fm_properties(name, code),
        assigned_to:assigned_to_id(full_name),
        submitted_by:submitted_by_id(full_name)
      `)
      .single()

    if (error) return err(error.message)

    // Return 201 with the full created record + which status was applied
    return NextResponse.json(created, { status: 201 })

  } catch (e) { return caught(e) }
}
