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

// ── PATCH schema ───────────────────────────────────────────────────────────

const patchTaskSchema = z.object({
  name:          z.string().min(1).optional(),
  description:   z.string().optional().nullable(),
  start_date:    z.string().optional(),
  end_date:      z.string().optional(),
  status:        z.enum(['not_started', 'in_progress', 'completed', 'blocked']).optional(),
  assignee_id:   z.string().uuid().optional().nullable(),
  depends_on_id: z.string().uuid().optional().nullable(),
  sort_order:    z.number().int().optional(),
})

// ── PATCH /api/projects/[id]/tasks/[taskId] ────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; taskId: string } },
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!canWrite(session.capability, session.role)) return err('Forbidden', 403)

    let body: unknown
    try { body = await req.json() }
    catch { return err('Invalid JSON body', 400) }

    const parsed = patchTaskSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const supabase = createClient()

    // Verify task belongs to org
    const { data: existing } = await supabase
      .from('project_tasks')
      .select('id, name, start_date, end_date')
      .eq('id', params.taskId)
      .eq('project_id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (!existing) return err('Not found', 404)

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...parsed.data,
    }

    const { data: task, error } = await supabase
      .from('project_tasks')
      .update(update)
      .eq('id', params.taskId)
      .select()
      .single()

    if (error) return err(error.message)

    // Update linked calendar event if name or dates changed
    const nameChanged  = parsed.data.name       !== undefined
    const datesChanged = parsed.data.start_date !== undefined || parsed.data.end_date !== undefined

    if (nameChanged || datesChanged) {
      const calUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (nameChanged)              calUpdate.title    = parsed.data.name
      if (parsed.data.start_date)   calUpdate.start_at = parsed.data.start_date
      if (parsed.data.end_date)     calUpdate.end_at   = parsed.data.end_date

      // Non-fatal
      await supabase
        .from('calendar_events')
        .update(calUpdate)
        .eq('related_id', params.taskId)
        .eq('related_table', 'project_tasks')
    }

    return NextResponse.json(task)
  } catch (e) { return caught(e) }
}

// ── DELETE /api/projects/[id]/tasks/[taskId] ───────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; taskId: string } },
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!canWrite(session.capability, session.role)) return err('Forbidden', 403)

    const supabase = createClient()

    const now = new Date().toISOString()

    // Soft-delete task
    const { error } = await supabase
      .from('project_tasks')
      .update({ deleted_at: now })
      .eq('id', params.taskId)
      .eq('project_id', params.id)
      .eq('org_id', session.orgId)

    if (error) return err(error.message)

    // Soft-delete linked calendar event (non-fatal)
    await supabase
      .from('calendar_events')
      .update({ deleted_at: now } as Record<string, unknown>)
      .eq('related_id', params.taskId)
      .eq('related_table', 'project_tasks')

    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
