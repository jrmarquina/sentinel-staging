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

// ── POST schema ────────────────────────────────────────────────────────────

const createWOSchema = z.object({
  module:         z.enum(['pw', 'fm']),
  title:          z.string().optional(),
  description:    z.string().optional().nullable(),
  priority:       z.string().optional(),
  assigned_to_id: z.string().uuid().optional().nullable(),
  due_date:       z.string().optional().nullable(),
})

// ── POST /api/projects/[id]/tasks/[taskId]/work-order ──────────────────────

export async function POST(
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

    const parsed = createWOSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const { module, title, description, priority, assigned_to_id, due_date } = parsed.data

    const supabase = createClient()

    // Verify task belongs to org
    const { data: task } = await supabase
      .from('project_tasks')
      .select('id, name')
      .eq('id', params.taskId)
      .eq('project_id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (!task) return err('Task not found', 404)

    const woTitle = title ?? (task as { name: string }).name

    let newWOId: string
    let woTable: 'work_orders' | 'fm_work_orders'

    if (module === 'pw') {
      const insertData: Record<string, unknown> = {
        org_id:     session.orgId,
        project_id: params.id,
        title:      woTitle,
        created_by: session.userId,
        status:     'open',
      }
      if (description)    insertData.description = description
      if (priority)       insertData.priority    = priority
      if (assigned_to_id) insertData.assigned_to = assigned_to_id
      if (due_date)       insertData.due_date    = due_date

      const { data: wo, error } = await supabase
        .from('work_orders')
        .insert(insertData)
        .select('id')
        .single()

      if (error) return err(error.message)
      newWOId = (wo as { id: string }).id
      woTable = 'work_orders'
    } else {
      const insertData: Record<string, unknown> = {
        org_id:        session.orgId,
        title:         woTitle,
        status:        'OPEN',
        source:        'DIRECT',
        inspection_id: null,
      }
      if (description)    insertData.description    = description
      if (priority)       insertData.priority       = priority
      if (assigned_to_id) insertData.assigned_to_id = assigned_to_id
      if (due_date)       insertData.due_date        = due_date

      const { data: wo, error } = await supabase
        .from('fm_work_orders')
        .insert(insertData)
        .select('id')
        .single()

      if (error) return err(error.message)
      newWOId = (wo as { id: string }).id
      woTable = 'fm_work_orders'
    }

    // Link task to work order
    const { error: linkErr } = await supabase
      .from('project_tasks')
      .update({
        work_order_id:    newWOId,
        work_order_table: woTable,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', params.taskId)

    if (linkErr) return err(linkErr.message)

    return NextResponse.json({ work_order_id: newWOId, work_order_table: woTable }, { status: 201 })
  } catch (e) { return caught(e) }
}
