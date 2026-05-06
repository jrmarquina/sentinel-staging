import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'
import { z } from 'zod'
import {
  notifyAssigneeWOOpen,
  notifyManagerWOCompleted,
} from '@/lib/email/fm-notifications'

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

const VALID_STATUSES    = ['PENDING_REVIEW', 'OPEN', 'IN_PROGRESS', 'COMPLETED'] as const
const VALID_PRIORITIES  = ['LOW', 'MEDIUM', 'HIGH'] as const
const VALID_CATEGORIES  = [
  'PLOMERIA', 'CARPINTERIA', 'ELECTRICIDAD', 'CISTERNA', 'TRAMPA_GRASA',
  'AREAS_VERDES', 'AIRE_ACONDICIONADO', 'REFRIGERACION', 'ALARMA_INCENDIO',
  'EXTINTORES', 'CONTROL_ACCESO', 'CONTROL_PLAGAS', 'ESTRUCTURA',
  'FILTRACIONES', 'GENERADOR', 'PINTURA', 'POZO_SEPTICO', 'ROTULACION',
] as const
const VALID_ASSIGNEE_TYPES = [
  'HS_STAFF', 'MUNICIPALITY', 'EXTERNAL_SUPPLIER', 'DIRECTOR_REFERRAL',
] as const

// ── State machine ──────────────────────────────────────────────────────────
//
// Manager transitions:  any → any (except backwards through triage)
//   PENDING_REVIEW → OPEN          (triage — the primary new flow)
//   OPEN           → IN_PROGRESS
//   OPEN           → COMPLETED     (skip in-progress for simple closures)
//   IN_PROGRESS    → COMPLETED
//   IN_PROGRESS    → OPEN          (re-open / send back)
//   COMPLETED      → OPEN          (re-open)
//
// Worker transitions:   only on WOs assigned to them
//   OPEN           → IN_PROGRESS   (start work)
//   IN_PROGRESS    → COMPLETED     (finish work)
//
// Contributor:          no status transitions; description edit only

const MANAGER_TRANSITIONS: Record<string, string[]> = {
  PENDING_REVIEW: ['OPEN'],
  OPEN:           ['IN_PROGRESS', 'COMPLETED'],
  IN_PROGRESS:    ['COMPLETED', 'OPEN'],
  COMPLETED:      ['OPEN'],
}

const WORKER_TRANSITIONS: Record<string, string[]> = {
  OPEN:        ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
}

// ── Capability helpers ─────────────────────────────────────────────────────

function isFmManager(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'org_manager'].includes(cap)
  return ['admin', 'supervisor'].includes(role)
}

function isFmWorker(cap: string | null, role: string): boolean {
  if (cap) return cap === 'worker'
  return role === 'vendor'
}

function isFmContributor(cap: string | null, role: string): boolean {
  if (cap) return cap === 'contributor'
  return role === 'inspector'
}

// ── Patch schema ───────────────────────────────────────────────────────────
// Accepts all possible fields; capability logic below decides which
// ones are actually allowed for each role.

const patchSchema = z.object({
  // Status transition
  status: z.enum(VALID_STATUSES).optional(),

  // Content — manager + contributor (own pending only)
  title:       z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).nullable().optional(),
  category:    z.enum(VALID_CATEGORIES).nullable().optional(),
  priority:    z.enum(VALID_PRIORITIES).optional(),
  due_date:    z.string().datetime({ message: 'Invalid date format' }).nullable().optional(),

  // Triage / assignment — manager only
  assignee_type:   z.enum(VALID_ASSIGNEE_TYPES).nullable().optional(),
  assigned_to_id:  z.string().uuid('Invalid assignee UUID').nullable().optional(),
})

// ── PATCH ──────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)

    const { capability, role, userId, orgId } = session
    const isManager     = isFmManager(capability, role)
    const isWorker      = isFmWorker(capability, role)
    const isContributor = isFmContributor(capability, role)

    if (!isManager && !isWorker && !isContributor) {
      return err('Forbidden', 403)
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let body: unknown
    try { body = await req.json() }
    catch { return err('Invalid JSON body', 400) }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const incoming = parsed.data

    // ── Fetch existing WO ──────────────────────────────────────────────────
    const supabase = createClient()
    const { data: existing, error: fetchErr } = await supabase
      .from('fm_work_orders')
      .select('id, org_id, status, submitted_by_id, assigned_to_id')
      .eq('id', params.id)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .single()

    if (fetchErr || !existing) return err('Work order not found', 404)

    // ── Build allowed update payload ───────────────────────────────────────
    const now    = new Date().toISOString()
    const update: Record<string, unknown> = {}

    if (isManager) {
      // ── Manager: validate transition then apply all allowed fields ───────

      if (incoming.status !== undefined) {
        const allowed = MANAGER_TRANSITIONS[existing.status] ?? []
        if (!allowed.includes(incoming.status)) {
          return err(
            `Cannot transition from ${existing.status} to ${incoming.status}. ` +
            `Allowed: ${allowed.join(', ') || 'none'}`,
            422,
          )
        }
        update.status = incoming.status
      }

      // Triage action: PENDING_REVIEW → OPEN may include assignment fields
      if (incoming.title !== undefined)          update.title         = incoming.title
      if (incoming.description !== undefined)    update.description   = incoming.description
      if (incoming.category !== undefined)       update.category      = incoming.category
      if (incoming.priority !== undefined)       update.priority      = incoming.priority
      if (incoming.due_date !== undefined)       update.due_date      = incoming.due_date
      if (incoming.assignee_type !== undefined)  update.assignee_type = incoming.assignee_type
      if (incoming.assigned_to_id !== undefined) update.assigned_to_id = incoming.assigned_to_id ?? null

    } else if (isWorker) {
      // ── Worker: only status + description on assigned WOs ─────────────

      if (existing.assigned_to_id !== userId) {
        return err('You can only update work orders assigned to you', 403)
      }

      if (incoming.status !== undefined) {
        const allowed = WORKER_TRANSITIONS[existing.status] ?? []
        if (!allowed.includes(incoming.status)) {
          return err(
            `Cannot transition from ${existing.status} to ${incoming.status}. ` +
            `Allowed: ${allowed.join(', ') || 'none'}`,
            422,
          )
        }
        update.status = incoming.status
      }

      // Workers can append progress notes via description
      if (incoming.description !== undefined) update.description = incoming.description

    } else if (isContributor) {
      // ── Contributor: description only, own PENDING_REVIEW WOs ────────────

      if (existing.submitted_by_id !== userId) {
        return err('You can only edit your own submissions', 403)
      }
      if (existing.status !== 'PENDING_REVIEW') {
        return err('Cannot edit a work order that has already been triaged', 422)
      }

      // Allow editing description and title while still pending
      if (incoming.title !== undefined)       update.title       = incoming.title
      if (incoming.description !== undefined) update.description = incoming.description
      if (incoming.category !== undefined)    update.category    = incoming.category
      if (incoming.priority !== undefined)    update.priority    = incoming.priority
      if (incoming.due_date !== undefined)    update.due_date    = incoming.due_date
    }

    // Nothing to update
    if (Object.keys(update).length === 0) {
      return err('No valid fields to update', 400)
    }

    // ── Auto-set audit timestamps on status change ─────────────────────────

    const newStatus = update.status as string | undefined

    if (newStatus === 'IN_PROGRESS' && existing.status !== 'IN_PROGRESS') {
      update.engaged_at    = now
      update.engaged_by_id = userId
    }

    if (newStatus === 'COMPLETED' && existing.status !== 'COMPLETED') {
      update.resolved_at    = now
      update.resolved_by_id = userId
    }

    // If re-opening a completed WO, clear resolution fields
    if (newStatus === 'OPEN' && existing.status === 'COMPLETED') {
      update.resolved_at    = null
      update.resolved_by_id = null
    }

    // ── Persist ────────────────────────────────────────────────────────────
    const { data: updated, error: updateErr } = await supabase
      .from('fm_work_orders')
      .update({ ...update, updated_at: now })
      .eq('id', params.id)
      .eq('org_id', orgId)
      .select(`
        *,
        fm_properties(name, code),
        assigned_to:profiles!fm_work_orders_assigned_to_id_fkey(full_name),
        submitted_by:profiles!fm_work_orders_submitted_by_id_fkey(full_name),
        engaged_by:profiles!fm_work_orders_engaged_by_id_fkey(full_name),
        resolved_by:profiles!fm_work_orders_resolved_by_id_fkey(full_name)
      `)
      .single()

    if (updateErr) return err(updateErr.message)
    if (!updated)  return err('Work order not found', 404)

    // ── Fire-and-forget email notifications ────────────────────────────────
    if (newStatus) {
      const woSummary = {
        id:             updated.id,
        title:          updated.title,
        description:    updated.description ?? null,
        category:       (updated as Record<string, unknown>).category as string | null ?? null,
        priority:       updated.priority,
        assignee_type:  (updated as Record<string, unknown>).assignee_type as string | null ?? null,
        due_date:       (updated as Record<string, unknown>).due_date as string | null ?? null,
        property_name:  (updated.fm_properties as { name?: string } | null)?.name ?? null,
        submitter_name: (updated.submitted_by  as { full_name?: string } | null)?.full_name ?? null,
      }

      // N-2: PENDING_REVIEW → OPEN and an assignee is set → notify the assignee
      if (
        newStatus === 'OPEN' &&
        existing.status === 'PENDING_REVIEW' &&
        updated.assigned_to_id
      ) {
        notifyAssigneeWOOpen(woSummary, updated.assigned_to_id as string).catch(console.error)
      }

      // N-3: → COMPLETED → notify the manager who engaged the WO
      if (
        newStatus === 'COMPLETED' &&
        existing.status !== 'COMPLETED' &&
        updated.engaged_by_id
      ) {
        notifyManagerWOCompleted(woSummary, updated.engaged_by_id as string).catch(console.error)
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    return NextResponse.json(updated)

  } catch (e) { return caught(e) }
}

// ── DELETE ─────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)

    // Only org_admin (or legacy admin) can soft-delete
    const canDelete =
      session.capability === 'org_admin' ||
      (!session.capability && session.role === 'admin')

    if (!canDelete) return err('Forbidden', 403)

    const supabase = createClient()
    const { error } = await supabase
      .from('fm_work_orders')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('org_id', session.orgId)

    if (error) return err(error.message)
    return new NextResponse(null, { status: 204 })
  } catch (e) { return caught(e) }
}
