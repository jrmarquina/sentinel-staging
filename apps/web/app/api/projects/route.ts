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

const createProjectSchema = z.object({
  name:             z.string().min(1),
  description:      z.string().optional(),
  start_date:       z.string().optional(),
  planned_end_date: z.string().optional(),
  module:           z.enum(['pw', 'fm']),
  fm_property_id:   z.string().uuid().optional().nullable(),
})

// ── GET /api/projects ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)

    const { searchParams } = new URL(req.url)
    const module = searchParams.get('module') as 'pw' | 'fm' | null

    const supabase = createClient()

    // Fetch projects
    let query = supabase
      .from('projects')
      .select('*')
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (module) {
      query = query.eq('module', module)
    }

    const { data: projects, error: projectsErr } = await query
    if (projectsErr) return err(projectsErr.message)

    const projectIds = (projects ?? []).map((p: { id: string }) => p.id)

    // Fetch tasks for all projects
    const { data: tasks, error: tasksErr } = await supabase
      .from('project_tasks')
      .select('*')
      .in('project_id', projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000'])
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })

    if (tasksErr) return err(tasksErr.message)

    // Fetch milestones for all projects
    const { data: milestones, error: milestonesErr } = await supabase
      .from('project_milestones')
      .select('*')
      .in('project_id', projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000'])
      .is('deleted_at', null)
      .order('date', { ascending: true })

    if (milestonesErr) return err(milestonesErr.message)

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

    // Attach tasks and milestones to projects
    type TaskRow = {
      id: string
      project_id: string
      assignee_id: string | null
      [key: string]: unknown
    }
    type MilestoneRow = {
      id: string
      project_id: string
      [key: string]: unknown
    }

    type RawProject = { id: string; fm_property_id?: string | null; [key: string]: unknown }

    const enrichedProjects = (projects as RawProject[] ?? []).map((p) => ({
      ...p,
      tasks: (tasks as TaskRow[] ?? [])
        .filter((t) => t.project_id === p.id)
        .map((t) => ({
          ...t,
          assignee_name: t.assignee_id ? (assigneeMap[t.assignee_id] ?? null) : null,
        })),
      milestones: (milestones as MilestoneRow[] ?? []).filter((m) => m.project_id === p.id),
    }))

    // FM mode: group by property
    if (module === 'fm') {
      const propertyIds = [...new Set(
        enrichedProjects
          .map((p) => p.fm_property_id ?? null)
          .filter((id): id is string => id !== null)
      )]

      let propertyMap: Record<string, { id: string; name: string }> = {}
      if (propertyIds.length > 0) {
        const { data: properties } = await supabase
          .from('fm_properties')
          .select('id, name')
          .in('id', propertyIds)
          .is('deleted_at', null)
        for (const prop of properties ?? []) {
          if (prop.id) propertyMap[prop.id] = { id: prop.id, name: prop.name ?? '' }
        }
      }

      // Group projects by property
      const propertyGroupMap: Record<string, {
        id: string; name: string; projects: typeof enrichedProjects
      }> = {}

      for (const p of enrichedProjects) {
        const propId = p.fm_property_id ?? 'unassigned'
        const propName = propId !== 'unassigned'
          ? (propertyMap[propId]?.name ?? 'Unknown Property')
          : 'No Property'
        if (!propertyGroupMap[propId]) {
          propertyGroupMap[propId] = { id: propId, name: propName, projects: [] }
        }
        propertyGroupMap[propId].projects.push(p)
      }

      return NextResponse.json({
        properties: Object.values(propertyGroupMap),
        projects: enrichedProjects,
      })
    }

    return NextResponse.json({ projects: enrichedProjects })
  } catch (e) { return caught(e) }
}

// ── POST /api/projects ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    console.log('[POST /api/projects] session:', session ? `role=${session.role} cap=${session.capability} org=${session.orgId}` : 'null')
    if (!session) return err('Unauthorized', 401)
    if (!canWrite(session.capability, session.role)) {
      console.log('[POST /api/projects] canWrite FAILED — role:', session.role, 'cap:', session.capability)
      return err('Forbidden', 403)
    }

    let body: unknown
    try { body = await req.json() }
    catch { return err('Invalid JSON body', 400) }

    const parsed = createProjectSchema.safeParse(body)
    console.log('[POST /api/projects] body parse:', parsed.success ? 'OK' : parsed.error.errors[0].message)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const { name, description, start_date, planned_end_date, module, fm_property_id } = parsed.data

    const supabase = createClient()

    // Auto-generate a unique code from the name + timestamp
    const slug = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'PROJ'
    const code = `${slug}-${Date.now().toString(36).toUpperCase().slice(-4)}`

    const insertData: Record<string, unknown> = {
      org_id:           session.orgId,
      name,
      code,
      module,
      status:           'planning',
      created_by:       session.userId,
      project_manager:  session.userId,
    }
    if (description)      insertData.description = description
    if (start_date)       insertData.start_date = start_date
    if (planned_end_date) insertData.planned_end_date = planned_end_date
    if (fm_property_id)   insertData.fm_property_id = fm_property_id

    const { data: project, error } = await supabase
      .from('projects')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.log('[POST /api/projects] Supabase insert error:', error.message, error.code, error.details)
      return err(error.message)
    }
    console.log('[POST /api/projects] Created project:', project?.id)
    return NextResponse.json(project, { status: 201 })
  } catch (e) { return caught(e) }
}
