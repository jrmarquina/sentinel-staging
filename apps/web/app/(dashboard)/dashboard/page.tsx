import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'
import { isWithinInterval, addDays, parseISO, isPast, format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { DashboardClient } from './dashboard-client'
import type {
  DevStats,
  DevPriorityItem,
  DevUpcomingItem,
  AssigneeWorkload,
  PotholeBacklogData,
  ProjectMarker,
  GanttProject,
} from './dashboard-dev'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard — SIMS' }

function delayStatus(endDate: string | null, status: string): 'overdue' | 'at_risk' | 'on_track' | 'closed' {
  if (status === 'completed' || status === 'cancelled') return 'closed'
  if (!endDate) return 'on_track'
  const end = parseISO(endDate)
  const now = new Date()
  if (isPast(end)) return 'overdue'
  if (isWithinInterval(end, { start: now, end: addDays(now, 14) })) return 'at_risk'
  return 'on_track'
}

export default async function DashboardPage() {
  // ── Capability-based routing ───────────────────────────────────────────────
  // Non-admin users are sent directly to their home section on login.
  const session = await getSession()
  if (session) {
    const cap = session.capability
    if (cap === 'org_admin')                         redirect('/dashboard/fm')
    if (cap === 'fm_manager' || cap === 'fm_viewer') redirect('/dashboard/fm')
    if (cap === 'fm_contributor')                    redirect('/dashboard/fm/inspections')
    if (cap === 'fm_worker')                         redirect('/dashboard/fm/work-orders')
    if (cap === 'pw_worker')                         redirect('/dashboard/work-orders')
    // pw_manager, pw_viewer — stay on this page (PW dashboard)
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [profileRes, orgRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user?.id ?? '').single(),
    supabase.from('user_roles').select('org_id').eq('user_id', user?.id ?? '').limit(1).single(),
  ])

  const profile   = profileRes.data as { full_name: string | null } | null
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const orgId     = (orgRes.data as { org_id: string } | null)?.org_id ?? null

  // ── Parallel fetches ───────────────────────────────────────────────────────
  const [woRes, contractRes, inspRes, projRes, potholeRes, workloadRes, potholeCountRes, allInspRes, allProjRes, contractEndRes, potholeHistoryRes] = await Promise.all([
    // Open WOs for workload widget + upcoming (status filtered)
    // Note: assigned_to FK points to auth.users, not profiles — fetch without join
    orgId
      ? supabase.from('work_orders')
          .select('id, number, title, due_date, status, assigned_to')
          .eq('org_id', orgId).is('deleted_at', null)
          .in('status', ['open', 'in_progress', 'on_hold'])
      : Promise.resolve({ data: [] }),

    orgId
      ? supabase.from('contracts').select('id')
          .eq('org_id', orgId).is('deleted_at', null).eq('status', 'active')
      : Promise.resolve({ data: [] }),

    // Pending inspections count (for existing stats)
    orgId
      ? supabase.from('inspections').select('id')
          .eq('org_id', orgId).is('deleted_at', null)
          .in('status', ['draft', 'in_progress'])
      : Promise.resolve({ data: [] }),

    // Active projects for priority list, Gantt, map
    orgId
      ? supabase.from('projects')
          .select('id, number, name, status, planned_end_date, start_date, blocked, blocked_by, blocked_by_reason, latitude, longitude')
          .eq('org_id', orgId).is('deleted_at', null)
          .neq('status', 'completed').neq('status', 'cancelled')
      : Promise.resolve({ data: [] }),

    orgId
      ? supabase.from('pothole_reports').select('id')
          .eq('org_id', orgId).is('deleted_at', null)
          .in('status', ['reported', 'verified', 'assigned', 'in_repair'])
      : Promise.resolve({ data: [] }),

    // Blocked WOs for priority list
    orgId
      ? supabase.from('work_orders')
          .select('id, number, title, due_date, status, blocked, blocked_by')
          .eq('org_id', orgId).is('deleted_at', null)
          .eq('blocked', true)
          .neq('status', 'closed').neq('status', 'cancelled')
      : Promise.resolve({ data: [] }),

    // All pothole counts by status bucket
    orgId
      ? supabase.from('pothole_reports')
          .select('id, status')
          .eq('org_id', orgId).is('deleted_at', null)
      : Promise.resolve({ data: [] }),

    // Total inspections (matches inspections list page — no status filter)
    orgId
      ? supabase.from('inspections').select('id')
          .eq('org_id', orgId).is('deleted_at', null)
      : Promise.resolve({ data: [] }),

    // Total projects (matches projects list page — no status filter)
    orgId
      ? supabase.from('projects').select('id')
          .eq('org_id', orgId).is('deleted_at', null)
      : Promise.resolve({ data: [] }),

    // Contracts ending soon — for upcoming panel
    orgId
      ? createAdminClient().from('contracts')
          .select('id, number, title, end_date')
          .eq('org_id', orgId).is('deleted_at', null)
          .in('status', ['active', 'pending_approval'])
          .not('end_date', 'is', null)
      : Promise.resolve({ data: [] }),

    // Pothole history for backlog chart — all records (created_at + repaired_at)
    orgId
      ? supabase.from('pothole_reports')
          .select('id, created_at, repaired_at')
          .eq('org_id', orgId).is('deleted_at', null)
      : Promise.resolve({ data: [] }),
  ])

  // Total work orders (all statuses — matches work orders list page)
  const { data: allWOData } = orgId
    ? await supabase.from('work_orders').select('id')
        .eq('org_id', orgId).is('deleted_at', null)
    : { data: [] }

  type WORow = {
    id: string
    number: string
    title: string
    due_date: string | null
    status: string
    assigned_to: string | null
  }
  type ProjRow = {
    id: string; number: string; name: string; status: string
    planned_end_date: string | null; start_date: string | null
    blocked: boolean; blocked_by: string | null; blocked_by_reason: string | null
    latitude: number | null; longitude: number | null
  }
  type BlockedWO = { id: string; number: string; title: string; due_date: string | null; status: string; blocked: boolean; blocked_by: string | null }
  type PotRow = { id: string; status: string }
  type ContractEndRow = { id: string; number: string; title: string; end_date: string }

  const workOrders  = (woRes.data   ?? []) as WORow[]
  const projects    = (projRes.data ?? []) as ProjRow[]
  const blockedWOs  = (workloadRes.data ?? []) as BlockedWO[]
  const potholeRows = (potholeCountRes.data ?? []) as PotRow[]

  // Resolve assignee names — assigned_to FK is to auth.users, fetch profiles separately
  const assigneeIds = [...new Set(workOrders.map((wo) => wo.assigned_to).filter(Boolean) as string[])]
  let woNameMap: Record<string, string> = {}
  if (assigneeIds.length > 0 && orgId) {
    const { data: profileRows } = await supabase
      .from('profiles').select('id, full_name').in('id', assigneeIds)
    for (const p of profileRows ?? []) {
      if (p.id && p.full_name) woNameMap[p.id] = p.full_name
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const today   = new Date()
  const weekEnd = addDays(today, 7)
  const dueThisWeek = workOrders.filter((wo) => {
    if (!wo.due_date) return false
    const d = parseISO(wo.due_date)
    return isWithinInterval(d, { start: today, end: weekEnd })
  }).length

  // Overdue count: WOs past due + projects past their planned end
  const overdueWOCount   = workOrders.filter((wo) => wo.due_date && isPast(parseISO(wo.due_date))).length
  const overdueProjCount = projects.filter((p) => p.planned_end_date && isPast(parseISO(p.planned_end_date))).length

  const stats: DevStats = {
    totalWorkOrders:    (allWOData ?? []).length,
    openWorkOrders:     workOrders.length,
    dueThisWeek,
    activeContracts:    (contractRes.data ?? []).length,
    totalInspections:   (allInspRes.data ?? []).length,
    pendingInspections: (inspRes.data    ?? []).length,
    activePotholes:     (potholeRes.data ?? []).length,
    totalProjects:      (allProjRes.data ?? []).length,
    activeProjects:     projects.length,
    overdueCount:       overdueWOCount + overdueProjCount,
  }

  // ── Priority items ─────────────────────────────────────────────────────────
  const overdueProjects: DevPriorityItem[] = projects
    .map((p) => ({
      id:        p.id,
      type:      'project' as const,
      number:    p.number,
      title:     p.name,
      dueDate:   p.planned_end_date,
      delay:     delayStatus(p.planned_end_date, p.status),
      blocked:   p.blocked,
      blockedBy: p.blocked_by,
      href:      `/dashboard/projects/${p.id}`,
    }))
    .filter((p) => p.delay === 'overdue' || p.delay === 'at_risk' || p.blocked)
    .sort((a, b) => {
      if (a.blocked !== b.blocked) return a.blocked ? -1 : 1
      if (a.delay !== b.delay) return a.delay === 'overdue' ? -1 : 1
      return 0
    })

  const priorityItems: DevPriorityItem[] = [
    ...overdueProjects,
    ...blockedWOs.map((wo) => ({
      id:        wo.id,
      type:      'work_order' as const,
      number:    wo.number,
      title:     wo.title,
      dueDate:   wo.due_date,
      delay:     delayStatus(wo.due_date, wo.status),
      blocked:   true,
      blockedBy: wo.blocked_by,
      href:      `/dashboard/work-orders/${wo.id}`,
    })),
  ].slice(0, 10)

  const contractsWithEnd = (contractEndRes.data ?? []) as ContractEndRow[]

  // ── Upcoming (next 14 days) ────────────────────────────────────────────────
  const fourteenDayEnd = addDays(today, 14)
  const upcoming: DevUpcomingItem[] = [
    ...projects
      .filter((p) => {
        if (!p.planned_end_date) return false
        const d = parseISO(p.planned_end_date)
        return isWithinInterval(d, { start: today, end: fourteenDayEnd }) && !p.blocked
      })
      .map((p) => ({
        id:      p.id,
        type:    'project' as const,
        number:  p.number,
        title:   p.name,
        dueDate: p.planned_end_date!,
        href:    `/dashboard/projects/${p.id}`,
      })),
    ...workOrders
      .filter((wo) => {
        if (!wo.due_date) return false
        const d = parseISO(wo.due_date)
        return isWithinInterval(d, { start: today, end: fourteenDayEnd })
      })
      .map((wo) => ({
        id:      wo.id,
        type:    'work_order' as const,
        number:  wo.number,
        title:   wo.title,
        dueDate: wo.due_date!,
        href:    `/dashboard/work-orders/${wo.id}`,
      })),
    ...contractsWithEnd
      .filter((c) => {
        const d = parseISO(c.end_date)
        return isWithinInterval(d, { start: today, end: fourteenDayEnd })
      })
      .map((c) => ({
        id:      c.id,
        type:    'contract' as const,
        number:  c.number,
        title:   c.title,
        dueDate: c.end_date,
        href:    `/dashboard/contracts/${c.id}`,
      })),
  ]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 10)

  // ── Assignee workload ──────────────────────────────────────────────────────
  const workloadMap = new Map<string, AssigneeWorkload>()
  for (const wo of workOrders) {
    const key  = wo.assigned_to ?? '__unassigned'
    const name = wo.assigned_to ? (woNameMap[wo.assigned_to] ?? 'Unknown') : 'Unassigned'
    if (!workloadMap.has(key)) {
      workloadMap.set(key, { assigneeId: wo.assigned_to, name, open: 0, inProgress: 0 })
    }
    const entry = workloadMap.get(key)!
    if (wo.status === 'in_progress') entry.inProgress++
    else entry.open++
  }
  const assigneeWorkload: AssigneeWorkload[] = [...workloadMap.values()]
    .filter((w) => w.assigneeId !== null)  // exclude unassigned from chart
    .sort((a, b) => (b.open + b.inProgress) - (a.open + a.inProgress))
    .slice(0, 7)

  // ── Pothole backlog chart data ─────────────────────────────────────────────
  type PotHistRow = { id: string; created_at: string; repaired_at: string | null }
  const potholeHistory = (potholeHistoryRes.data ?? []) as PotHistRow[]

  const MONTHS = 6
  const potholeMonths = Array.from({ length: MONTHS }, (_, i) => {
    const monthDate   = subMonths(today, MONTHS - 1 - i)
    const mStart      = startOfMonth(monthDate)
    const mEnd        = endOfMonth(monthDate)

    const opened = potholeHistory.filter((r) => {
      const d = new Date(r.created_at)
      return d >= mStart && d <= mEnd
    }).length

    const closed = potholeHistory.filter((r) => {
      if (!r.repaired_at) return false
      const d = new Date(r.repaired_at)
      return d >= mStart && d <= mEnd
    }).length

    const cumulativeOpened = potholeHistory.filter((r) => new Date(r.created_at) <= mEnd).length
    const cumulativeClosed = potholeHistory.filter((r) => {
      if (!r.repaired_at) return false
      return new Date(r.repaired_at) <= mEnd
    }).length

    return {
      label:             format(monthDate, 'MMM'),
      opened,
      closed,
      cumulativeOpened,
      cumulativeClosed,
      backlog:           cumulativeOpened - cumulativeClosed,
    }
  })

  const potholeBacklog: PotholeBacklogData = {
    months:        potholeMonths,
    currentBacklog: potholeMonths.at(-1)?.backlog ?? 0,
  }

  // ── Project map markers ────────────────────────────────────────────────────
  const projectMarkers: ProjectMarker[] = projects
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => ({
      id:     p.id,
      number: p.number,
      name:   p.name,
      lat:    p.latitude!,
      lng:    p.longitude!,
      status: p.status,
    }))

  // ── Gantt projects ─────────────────────────────────────────────────────────
  const ganttProjects: GanttProject[] = projects
    .filter((p) => p.start_date || p.planned_end_date)
    .map((p) => ({
      id:        p.id,
      number:    p.number,
      name:      p.name,
      startDate: p.start_date,
      endDate:   p.planned_end_date,
      status:    p.status,
    }))
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
    .slice(0, 10)

  return (
    <DashboardClient
      firstName={firstName}
      stats={stats}
      priorityItems={priorityItems}
      upcoming={upcoming}
      assigneeWorkload={assigneeWorkload}
      potholeStats={potholeBacklog}
      projectMarkers={projectMarkers}
      ganttProjects={ganttProjects}
    />
  )
}
