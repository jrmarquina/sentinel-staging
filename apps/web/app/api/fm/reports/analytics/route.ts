import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

function isFmManager(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'org_manager'].includes(cap)
  return ['admin', 'supervisor'].includes(role)
}

// ── GET /api/fm/reports/analytics ─────────────────────────────────────────
//
// Work order focused analytics for the FM reports page:
//   - WO counts by status
//   - WO counts by category (top 10)
//   - WO counts by priority
//   - WO counts by assignee_type
//   - Average resolution time (hours: created_at → resolved_at)
//   - Pending review queue (contributor-submitted, awaiting triage)
//   - Overdue count
//   - 30-day completion trend (daily WOs completed in last 30 days)
//   - Inspection pass rate and avg score
//
// Auth: FM managers only (admin / supervisor / org_admin / org_manager)

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmManager(session.capability, session.role)) return err('Forbidden', 403)

    const supabase = createClient()
    const { orgId } = session

    const now    = new Date()
    const nowISO = now.toISOString()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [woRes, woCompletedRes, inspRes, propertiesRes] = await Promise.all([
      // All non-deleted WOs — include property_id for per-property breakdown
      supabase
        .from('fm_work_orders')
        .select('id, status, priority, category, assignee_type, created_at, resolved_at, due_date, source, property_id')
        .eq('org_id', orgId)
        .is('deleted_at', null),

      // WOs completed in last 30 days (for trend)
      supabase
        .from('fm_work_orders')
        .select('id, resolved_at, created_at')
        .eq('org_id', orgId)
        .eq('status', 'COMPLETED')
        .is('deleted_at', null)
        .gte('resolved_at', thirtyDaysAgo)
        .not('resolved_at', 'is', null),

      // Inspections for pass rate
      supabase
        .from('fm_inspections')
        .select('id, status, score')
        .eq('org_id', orgId)
        .is('deleted_at', null),

      // Properties for by-property breakdown
      supabase
        .from('fm_properties')
        .select('id, name, code')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('name', { ascending: true }),
    ])

    if (woRes.error)         return err(woRes.error.message)
    if (woCompletedRes.error) return err(woCompletedRes.error.message)
    if (inspRes.error)       return err(inspRes.error.message)

    type WoRow = {
      id: string
      status: string
      priority: string
      category: string | null
      assignee_type: string | null
      created_at: string
      resolved_at: string | null
      due_date: string | null
      source: string | null
      property_id: string | null
    }

    const wos        = (woRes.data ?? []) as WoRow[]
    const comp       = (woCompletedRes.data ?? []) as { id: string; resolved_at: string; created_at: string }[]
    const insp       = (inspRes.data ?? []) as { id: string; status: string; score: number | null }[]
    const properties = (propertiesRes.data ?? []) as { id: string; name: string; code: string | null }[]

    // ── Status counts ──────────────────────────────────────────────────────
    const byStatus: Record<string, number> = {}
    for (const wo of wos) {
      byStatus[wo.status] = (byStatus[wo.status] ?? 0) + 1
    }

    // ── Category counts (non-null only) ────────────────────────────────────
    const byCategoryMap: Record<string, number> = {}
    for (const wo of wos) {
      if (wo.category) {
        byCategoryMap[wo.category] = (byCategoryMap[wo.category] ?? 0) + 1
      }
    }
    const byCategory = Object.entries(byCategoryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([category, count]) => ({ category, count }))

    // ── Priority counts ────────────────────────────────────────────────────
    const byPriority: Record<string, number> = {}
    for (const wo of wos) {
      byPriority[wo.priority] = (byPriority[wo.priority] ?? 0) + 1
    }

    // ── Assignee type counts ───────────────────────────────────────────────
    const byAssigneeType: Record<string, number> = {}
    for (const wo of wos) {
      const key = wo.assignee_type ?? 'UNASSIGNED'
      byAssigneeType[key] = (byAssigneeType[key] ?? 0) + 1
    }

    // ── Source counts ──────────────────────────────────────────────────────
    const bySource: Record<string, number> = {}
    for (const wo of wos) {
      const key = wo.source ?? 'DIRECT'
      bySource[key] = (bySource[key] ?? 0) + 1
    }

    // ── Average resolution time ────────────────────────────────────────────
    // Hours from created_at to resolved_at for completed WOs
    const completedWithResolved = wos.filter((w) => w.status === 'COMPLETED' && w.resolved_at)
    let avgResolutionHours: number | null = null
    if (completedWithResolved.length > 0) {
      const totalMs = completedWithResolved.reduce((sum, wo) => {
        const ms = new Date(wo.resolved_at!).getTime() - new Date(wo.created_at).getTime()
        return sum + Math.max(ms, 0)
      }, 0)
      avgResolutionHours = Math.round(totalMs / completedWithResolved.length / (1000 * 60 * 60))
    }

    // ── Overdue count ──────────────────────────────────────────────────────
    const overdueCount = wos.filter(
      (wo) => wo.status !== 'COMPLETED' && wo.due_date && wo.due_date < nowISO
    ).length

    // ── 30-day completion trend (daily buckets) ────────────────────────────
    const buckets: Record<string, number> = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      buckets[key] = 0
    }
    for (const wo of comp) {
      const day = (wo.resolved_at as string).slice(0, 10)
      if (day in buckets) buckets[day]++
    }
    const completionTrend = Object.entries(buckets).map(([date, count]) => ({ date, count }))

    // ── Inspection stats ───────────────────────────────────────────────────
    const completedInsp = insp.filter((i) => i.status === 'COMPLETED' || i.status === 'APPROVED')
    const inspWithScore = completedInsp.filter((i) => i.score != null)
    const avgInspScore  = inspWithScore.length > 0
      ? Math.round(inspWithScore.reduce((s, i) => s + (i.score ?? 0), 0) / inspWithScore.length * 10) / 10
      : null
    const passRate = insp.length > 0
      ? Math.round(completedInsp.length / insp.length * 100)
      : null

    // ── By property breakdown ──────────────────────────────────────────────
    type PropStats = {
      property_id: string
      property_name: string
      property_code: string | null
      total: number
      open: number
      inProgress: number
      completed: number
      pendingReview: number
      overdue: number
      resolutionMsSum: number
      resolutionCount: number
    }

    const propMap: Record<string, PropStats> = {}

    // Seed from the properties list (so every property appears even with 0 WOs)
    for (const p of properties) {
      propMap[p.id] = {
        property_id:     p.id,
        property_name:   p.name,
        property_code:   p.code,
        total:           0,
        open:            0,
        inProgress:      0,
        completed:       0,
        pendingReview:   0,
        overdue:         0,
        resolutionMsSum: 0,
        resolutionCount: 0,
      }
    }

    for (const wo of wos) {
      if (!wo.property_id) continue
      if (!propMap[wo.property_id]) continue // property not in list (deleted)
      const p = propMap[wo.property_id]
      p.total++
      if (wo.status === 'OPEN')           p.open++
      if (wo.status === 'IN_PROGRESS')    p.inProgress++
      if (wo.status === 'COMPLETED')      p.completed++
      if (wo.status === 'PENDING_REVIEW') p.pendingReview++
      if (wo.status !== 'COMPLETED' && wo.due_date && wo.due_date < nowISO) p.overdue++
      if (wo.status === 'COMPLETED' && wo.resolved_at) {
        const ms = new Date(wo.resolved_at).getTime() - new Date(wo.created_at).getTime()
        if (ms > 0) { p.resolutionMsSum += ms; p.resolutionCount++ }
      }
    }

    const byProperty = Object.values(propMap)
      .filter((p) => p.total > 0) // only show properties with at least one WO
      .sort((a, b) => b.total - a.total)
      .map(({ resolutionMsSum, resolutionCount, ...p }) => ({
        ...p,
        avgResolutionHours: resolutionCount > 0
          ? Math.round(resolutionMsSum / resolutionCount / (1000 * 60 * 60))
          : null,
      }))

    return NextResponse.json({
      summary: {
        total:          wos.length,
        open:           byStatus['OPEN']           ?? 0,
        inProgress:     byStatus['IN_PROGRESS']    ?? 0,
        completed:      byStatus['COMPLETED']      ?? 0,
        pendingReview:  byStatus['PENDING_REVIEW'] ?? 0,
        overdue:        overdueCount,
        highPriority:   wos.filter((w) => w.priority === 'HIGH' && w.status !== 'COMPLETED').length,
      },
      avgResolutionHours,
      byCategory,
      byPriority,
      byAssigneeType,
      bySource,
      byProperty,
      completionTrend,
      inspections: {
        total:     insp.length,
        completed: completedInsp.length,
        avgScore:  avgInspScore,
        passRate,
      },
    })
  } catch (e) { return caught(e) }
}
