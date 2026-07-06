// GET /api/fm/schedule
//
// Unified scheduling read model for the FM calendar. Merges three sources into
// one ScheduleItem shape so every calendar view (month/week/resource/timeline/
// agenda) reads from a single dataset:
//
//   fm_inspections   → point events (scheduled_for), assignee = inspector_id
//   fm_work_orders   → point events (due_date),      assignee = assigned_to_id
//   project_tasks    → SPAN events  (start_date→end_date), assignee = assignee_id
//                      (only tasks whose parent project is module = 'fm')
//
// Uses the RLS client so per-capability visibility is enforced by the database:
// managers/viewers see all org rows; contributors/workers see only their own
// (per the fm_* RLS policies). This route only READS — no writes.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error('[fm/schedule]', e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

// ── Types ────────────────────────────────────────────────────────────────────

type ScheduleType = 'inspection' | 'work_order' | 'project_task'

interface PropertyRef { id: string; name: string }

interface ScheduleItem {
  id:            string          // stable, prefixed by type
  type:          ScheduleType
  title:         string
  // A project may touch zero, one, or many properties; inspections and work
  // orders always have exactly one. Represented as an array so the calendar
  // renders 0 ("no property"), 1 (the name), or N ("N properties") uniformly —
  // and stays correct if a project→property many-to-many is added later.
  properties:    PropertyRef[]
  propertyLabel: string          // '—' | name | 'N properties'
  assigneeId:    string | null
  assigneeName:  string | null
  start:         string          // ISO date/time
  end:           string | null   // ISO (null for point events)
  allDay:        boolean
  status:        string
  priority:      string | null   // work orders only
  isOverdue:     boolean
  sourceTable:   'fm_inspections' | 'fm_work_orders' | 'project_tasks'
  sourceId:      string
  href:          string
}

// ── Overdue rules (fixes the "inspections never overdue" bug) ─────────────────

const INSPECTION_DONE = new Set(['COMPLETED', 'CANCELLED'])

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    // Any FM-capable user may view the schedule. Legacy roles map through too.
    const cap = session.capability
    const role = session.role
    const hasFm =
      (cap && ['org_admin', 'fm_manager', 'fm_viewer', 'fm_contributor', 'fm_worker'].includes(cap)) ||
      ['admin', 'supervisor', 'inspector', 'vendor', 'viewer'].includes(role)
    if (!hasFm) return err('Forbidden', 403)

    const supabase = createClient()
    const nowISO = new Date().toISOString()
    const todayYMD = nowISO.slice(0, 10)

    const [inspRes, woRes, taskRes] = await Promise.all([
      supabase
        .from('fm_inspections')
        .select('id, scheduled_for, status, property_id, inspector_id, fm_properties(name), fm_inspection_templates(name)')
        .is('deleted_at', null)
        .not('scheduled_for', 'is', null),
      supabase
        .from('fm_work_orders')
        .select('id, title, due_date, status, priority, property_id, assigned_to_id, fm_properties(name)')
        .is('deleted_at', null)
        .not('due_date', 'is', null),
      supabase
        .from('project_tasks')
        .select('id, name, start_date, end_date, status, assignee_id, project_id, projects!inner(name, module, fm_property_id, fm_properties(name))')
        .is('deleted_at', null)
        .eq('projects.module', 'fm'),
    ])

    if (inspRes.error) return err(inspRes.error.message)
    if (woRes.error)   return err(woRes.error.message)
    if (taskRes.error) return err(taskRes.error.message)

    const inspections = (inspRes.data ?? []) as Array<Record<string, unknown>>
    const workOrders  = (woRes.data ?? []) as Array<Record<string, unknown>>
    const tasks       = (taskRes.data ?? []) as Array<Record<string, unknown>>

    // ── Resolve assignee names in one lookup ───────────────────────────────
    const assigneeIds = new Set<string>()
    for (const r of inspections) if (r.inspector_id)  assigneeIds.add(r.inspector_id as string)
    for (const r of workOrders)  if (r.assigned_to_id) assigneeIds.add(r.assigned_to_id as string)
    for (const r of tasks)       if (r.assignee_id)    assigneeIds.add(r.assignee_id as string)

    const nameMap = new Map<string, string>()
    if (assigneeIds.size > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', [...assigneeIds])
      for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
        nameMap.set(p.id, p.full_name ?? '')
      }
    }

    const propsFromEmbed = (id: string | null | undefined, name: string | null | undefined): PropertyRef[] =>
      id ? [{ id, name: name ?? '—' }] : []
    const labelOf = (props: PropertyRef[]): string =>
      props.length === 0 ? '—' : props.length === 1 ? props[0].name : `${props.length} properties`

    const items: ScheduleItem[] = []

    for (const r of inspections) {
      const start = r.scheduled_for as string
      const status = r.status as string
      const tmpl = (r.fm_inspection_templates as { name?: string } | null)?.name ?? 'Inspection'
      const assigneeId = (r.inspector_id as string | null) ?? null
      const props = propsFromEmbed(r.property_id as string | null, (r.fm_properties as { name?: string } | null)?.name)
      items.push({
        id: `inspection-${r.id}`,
        type: 'inspection',
        title: tmpl,
        properties: props,
        propertyLabel: labelOf(props),
        assigneeId,
        assigneeName: assigneeId ? (nameMap.get(assigneeId) || null) : null,
        start,
        end: null,
        allDay: false,
        status,
        priority: null,
        isOverdue: !INSPECTION_DONE.has(status) && start < nowISO,
        sourceTable: 'fm_inspections',
        sourceId: r.id as string,
        href: `/dashboard/fm/inspections/${r.id}`,
      })
    }

    for (const r of workOrders) {
      const due = r.due_date as string
      const status = r.status as string
      const assigneeId = (r.assigned_to_id as string | null) ?? null
      const props = propsFromEmbed(r.property_id as string | null, (r.fm_properties as { name?: string } | null)?.name)
      items.push({
        id: `work_order-${r.id}`,
        type: 'work_order',
        title: (r.title as string) ?? 'Work order',
        properties: props,
        propertyLabel: labelOf(props),
        assigneeId,
        assigneeName: assigneeId ? (nameMap.get(assigneeId) || null) : null,
        start: due,
        end: null,
        allDay: false,
        status,
        priority: (r.priority as string | null) ?? null,
        isOverdue: status !== 'COMPLETED' && due < nowISO,
        sourceTable: 'fm_work_orders',
        sourceId: r.id as string,
        href: `/dashboard/fm/work-orders?focus=${r.id}`,
      })
    }

    for (const r of tasks) {
      const proj = r.projects as { name?: string; fm_property_id?: string | null; fm_properties?: { name?: string } | null } | null
      const start = r.start_date as string   // DATE (YYYY-MM-DD)
      const end   = r.end_date as string
      const status = r.status as string
      const assigneeId = (r.assignee_id as string | null) ?? null
      // Today a project links to 0 or 1 property (projects.fm_property_id).
      // If a project→property many-to-many is added, resolve the full set here.
      const props = propsFromEmbed(proj?.fm_property_id ?? null, proj?.fm_properties?.name)
      items.push({
        id: `project_task-${r.id}`,
        type: 'project_task',
        title: (r.name as string) ?? 'Task',
        properties: props,
        propertyLabel: labelOf(props),
        assigneeId,
        assigneeName: assigneeId ? (nameMap.get(assigneeId) || null) : null,
        start,
        end,
        allDay: true,
        status,
        priority: null,
        isOverdue: status !== 'completed' && end < todayYMD,
        sourceTable: 'project_tasks',
        sourceId: r.id as string,
        href: `/dashboard/projects/${r.project_id}`,
      })
    }

    // ── Filter facets + summary counts (for the command bar) ───────────────
    const propMap = new Map<string, string>()
    const asgMap  = new Map<string, string>()
    for (const it of items) {
      for (const p of it.properties) propMap.set(p.id, p.name)
      if (it.assigneeId) asgMap.set(it.assigneeId, it.assigneeName ?? '—')
    }

    const counts = {
      total:        items.length,
      overdue:      items.filter((i) => i.isOverdue).length,
      unassigned:   items.filter((i) => !i.assigneeId && i.type !== 'inspection').length,
      inspections:  items.filter((i) => i.type === 'inspection').length,
      workOrders:   items.filter((i) => i.type === 'work_order').length,
      projectTasks: items.filter((i) => i.type === 'project_task').length,
    }

    return NextResponse.json(
      {
        items,
        properties: [...propMap].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        assignees:  [...asgMap].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        counts,
      },
      { headers: { 'Cache-Control': 'private, max-age=20, stale-while-revalidate=60' } }
    )
  } catch (e) {
    return caught(e)
  }
}
