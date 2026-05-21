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

const createTaskSchema = z.object({
  name:          z.string().min(1),
  description:   z.string().optional().nullable(),
  start_date:    z.string(),
  end_date:      z.string(),
  assignee_id:   z.string().uuid().optional().nullable(),
  depends_on_id: z.string().uuid().optional().nullable(),
  sort_order:    z.number().int().optional(),
})

// ── GET /api/projects/[id]/tasks ───────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)

    const supabase = createClient()

    // Verify project belongs to org
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (!project) return err('Not found', 404)

    const { data: tasks, error } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', params.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })

    if (error) return err(error.message)
    return NextResponse.json(tasks ?? [])
  } catch (e) { return caught(e) }
}

// ── POST /api/projects/[id]/tasks ──────────────────────────────────────────

export async function POST(
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

    const parsed = createTaskSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const supabase = createClient()

    // Verify project belongs to org
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (!project) return err('Not found', 404)

    const { name, description, start_date, end_date, assignee_id, depends_on_id, sort_order } = parsed.data

    const insertData: Record<string, unknown> = {
      org_id:     session.orgId,
      project_id: params.id,
      name,
      start_date,
      end_date,
      sort_order: sort_order ?? 0,
    }
    if (description !== undefined)   insertData.description = description
    if (assignee_id !== undefined)   insertData.assignee_id = assignee_id
    if (depends_on_id !== undefined) insertData.depends_on_id = depends_on_id

    const { data: task, error } = await supabase
      .from('project_tasks')
      .insert(insertData)
      .select()
      .single()

    if (error) return err(error.message)

    // Insert a calendar_events row for this task
    const calInsert: Record<string, unknown> = {
      org_id:        session.orgId,
      title:         name,
      start_at:      start_date,
      end_at:        end_date,
      event_type:    'project_task',
      related_id:    (task as { id: string }).id,
      related_table: 'project_tasks',
      color:         '#6366f1',
      all_day:       true,
    }
    // Non-fatal — task is created regardless
    await supabase.from('calendar_events').insert(calInsert)

    return NextResponse.json(task, { status: 201 })
  } catch (e) { return caught(e) }
}
