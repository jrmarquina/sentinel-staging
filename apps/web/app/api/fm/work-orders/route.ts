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

type FmAccessLevel = 'manager' | 'viewer' | 'contributor' | 'worker'

/**
 * Maps a session to a FM access level.
 * Checks the new capability field first; falls back to legacy app_role
 * so users whose user_roles row hasn't been migrated yet still work.
 * Returns null when the user has no FM access at all.
 */
function getFmAccessLevel(
  capability: string | null,
  role: string,
): FmAccessLevel | null {
  if (capability) {
    if (['org_admin', 'org_manager'].includes(capability)) return 'manager'
    if (capability === 'org_viewer')  return 'viewer'
    if (capability === 'contributor') return 'contributor'
    if (capability === 'worker')      return 'worker'
    return null
  }
  // Legacy app_role fallback
  if (['admin', 'supervisor'].includes(role)) return 'manager'
  if (role === 'viewer')    return 'viewer'
  if (role === 'inspector') return 'contributor'
  if (role === 'vendor')    return 'worker'
  return null
}

/** Convenience — true for org_admin / org_manager / legacy admin+supervisor */
function isFmManager(capability: string | null, role: string): boolean {
  return getFmAccessLevel(capability, role) === 'manager'
}

/** True for any role that can submit a new WO (manager or contributor) */
function canSubmitWO(capability: string | null, role: string): boolean {
  const level = getFmAccessLevel(capability, role)
  return level === 'manager' || level === 'contributor'
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
//
// Row visibility by access level:
//
//   manager     — all rows, all statuses (including PENDING_REVIEW queue)
//   viewer      — all rows except PENDING_REVIEW (read-only operational view)
//   contributor — only rows where submitted_by_id = their userId
//   worker      — only rows where assigned_to_id  = their userId,
//                 excluding PENDING_REVIEW (nothing assigned yet at that stage)
//
// Explicit ?status=PENDING_REVIEW from non-managers returns 403 rather than
// silently returning empty results — makes misconfigured clients visible.
//
// Filter params (all optional, combinable):
//   propertyId, assetId, inspectionId, checklistItemId  — existing
//   status, category, assigneeType, source               — new
//   pendingReview=true                                   — shortcut for the
//                                                          triage queue (managers only)

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)

    const accessLevel = getFmAccessLevel(session.capability, session.role)
    if (!accessLevel) return err('Forbidden', 403)

    const { searchParams } = new URL(req.url)

    // ── Parse filter params ────────────────────────────────────────────────
    const propertyId      = searchParams.get('propertyId')
    const assetId         = searchParams.get('assetId')
    const statusFilter    = searchParams.get('status')
    const inspectionId    = searchParams.get('inspectionId')
    const checklistItemId = searchParams.get('checklistItemId')
    const categoryFilter  = searchParams.get('category')
    const assigneeType    = searchParams.get('assigneeType')
    const sourceFilter    = searchParams.get('source')
    const pendingReview   = searchParams.get('pendingReview') === 'true'

    // Non-managers requesting the triage queue get an explicit 403
    if (
      (pendingReview || statusFilter === 'PENDING_REVIEW') &&
      accessLevel !== 'manager'
    ) {
      return err('Forbidden', 403)
    }

    // ── Build base query ───────────────────────────────────────────────────
    const supabase = createClient()

    let query = supabase
      .from('fm_work_orders')
      .select(`
        *,
        fm_properties(name, code),
        assigned_to:assigned_to_id(full_name),
        submitted_by:submitted_by_id(full_name),
        engaged_by:engaged_by_id(full_name),
        resolved_by:resolved_by_id(full_name)
      `)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    // ── Capability scoping ─────────────────────────────────────────────────

    switch (accessLevel) {
      case 'manager':
        // No row-level restriction — managers see everything
        break

      case 'viewer':
        // Viewers see operational data; triage queue is internal to FM Manager
        query = query.neq('status', 'PENDING_REVIEW')
        break

      case 'contributor':
        // Zone/Nutrition Managers see only their own submissions
        query = query.eq('submitted_by_id', session.userId)
        break

      case 'worker':
        // Maintenance workers and suppliers see only their assigned WOs.
        // PENDING_REVIEW rows have no assignee yet so this is also naturally
        // empty for workers, but we exclude explicitly for clarity.
        query = query
          .eq('assigned_to_id', session.userId)
          .neq('status', 'PENDING_REVIEW')
        break
    }

    // ── Apply caller-supplied filters (on top of capability scope) ─────────

    // Triage queue shortcut — overrides any status filter
    if (pendingReview) {
      query = query.eq('status', 'PENDING_REVIEW')
    } else if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    if (propertyId)      query = query.eq('property_id', propertyId)
    if (assetId)         query = query.eq('asset_id', assetId)
    if (inspectionId)    query = query.eq('inspection_id', inspectionId)
    if (checklistItemId) query = query.eq('checklist_item_id', checklistItemId)
    if (categoryFilter)  query = query.eq('category', categoryFilter)
    if (assigneeType)    query = query.eq('assignee_type', assigneeType)
    if (sourceFilter)    query = query.eq('source', sourceFilter)

    // ── Execute ────────────────────────────────────────────────────────────
    const { data, error } = await query
    if (error) return err(error.message)

    // Return rows with a summary header so the frontend knows what scope
    // was applied (useful for debugging role issues during rollout)
    return NextResponse.json(data, {
      headers: { 'X-FM-Access-Level': accessLevel },
    })

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
