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

function canWrite(capability: string | null, role: string): boolean {
  if (capability) return ['org_admin', 'fm_manager', 'pw_manager'].includes(capability)
  return ['admin', 'supervisor'].includes(role)
}

function isAdmin(capability: string | null, role: string): boolean {
  if (capability) return capability === 'org_admin'
  return role === 'admin'
}

// ── PATCH schema ───────────────────────────────────────────────────────────

const patchProjectSchema = z.object({
  name:             z.string().min(1).optional(),
  description:      z.string().optional().nullable(),
  status:           z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
  start_date:       z.string().optional().nullable(),
  planned_end_date: z.string().optional().nullable(),
  end_date:         z.string().optional().nullable(),
  fm_property_id:   z.string().uuid().optional().nullable(),
})

// ── GET /api/projects/[id] ─────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)

    const supabase = createClient()

    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (error || !project) return err('Not found', 404)

    // Fetch tasks
    const { data: tasks } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', params.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })

    // Fetch milestones
    const { data: milestones } = await supabase
      .from('project_milestones')
      .select('*')
      .eq('project_id', params.id)
      .is('deleted_at', null)
      .order('date', { ascending: true })

    // Resolve assignee names
    const assigneeIds = [...new Set(
      (tasks ?? [])
        .map((t: { assignee_id: string | null }) => t.assignee_id)
        .filter((id): id is string => id !== null)
    )]
    let assigneeMap: Record<string, string> = {}
    if (assigneeIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', assigneeIds)
      for (const p of profiles ?? []) {
        if (p.id && p.full_name) assigneeMap[p.id] = p.full_name
      }
    }

    type TaskRow = { assignee_id: string | null; [key: string]: unknown }

    return NextResponse.json({
      ...project,
      tasks: (tasks as TaskRow[] ?? []).map((t) => ({
        ...t,
        assignee_name: t.assignee_id ? (assigneeMap[t.assignee_id] ?? null) : null,
      })),
      milestones: milestones ?? [],
    })
  } catch (e) { return caught(e) }
}

// ── PATCH /api/projects/[id] ───────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!canWrite(session.capability, session.role)) return err('Forbidden', 403)

    let body: unknown
    try { body = await req.json() }
    catch { return err('Invalid JSON body', 400) }

    const parsed = patchProjectSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const supabase = createClient()

    // Verify ownership
    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (!existing) return err('Not found', 404)

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...parsed.data,
    }

    const { data: updated, error } = await supabase
      .from('projects')
      .update(update)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return err(error.message)
    return NextResponse.json(updated)
  } catch (e) { return caught(e) }
}

// ── DELETE /api/projects/[id] ──────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isAdmin(session.capability, session.role)) return err('Forbidden', 403)

    const supabase = createClient()

    const { error } = await supabase
      .from('projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('org_id', session.orgId)

    if (error) return err(error.message)
    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
