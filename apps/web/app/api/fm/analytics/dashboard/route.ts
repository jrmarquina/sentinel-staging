import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'

export const dynamic = 'force-dynamic'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

const CACHE = { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' }

export async function GET(request: Request) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()
    const orgId = session.orgId
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') // 'kpi' | 'mobile' | null (full)

    const now         = new Date()
    const in30d       = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const nowISO      = now.toISOString()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

    // ── Shared COUNT helper queries ────────────────────────────────────────────
    // All use server-side COUNT (head: true) — no rows transferred, index-only scans.
    function counts() {
      return Promise.all([
        // properties
        supabase.from('fm_properties').select('*', { count: 'exact', head: true }).eq('org_id', orgId).is('deleted_at', null),
        supabase.from('fm_properties').select('*', { count: 'exact', head: true }).eq('org_id', orgId).is('deleted_at', null).eq('status', 'ACTIVE'),
        // assets
        supabase.from('fm_assets').select('*', { count: 'exact', head: true }).eq('org_id', orgId).is('deleted_at', null),
        // inspections
        supabase.from('fm_inspections').select('*', { count: 'exact', head: true }).eq('org_id', orgId).is('deleted_at', null),
        supabase.from('fm_inspections').select('*', { count: 'exact', head: true }).eq('org_id', orgId).is('deleted_at', null).eq('status', 'COMPLETED'),
        supabase.from('fm_inspections').select('*', { count: 'exact', head: true }).eq('org_id', orgId).is('deleted_at', null).eq('status', 'IN_PROGRESS'),
        supabase.from('fm_inspections').select('*', { count: 'exact', head: true }).eq('org_id', orgId).is('deleted_at', null).eq('status', 'PENDING_APPROVAL'),
        // fetch scores for compliance rate (completed only — much smaller than all rows)
        supabase.from('fm_inspections').select('score').eq('org_id', orgId).is('deleted_at', null).eq('status', 'COMPLETED').not('score', 'is', null),
        // work orders
        supabase.from('fm_work_orders').select('*', { count: 'exact', head: true }).eq('org_id', orgId).is('deleted_at', null),
        supabase.from('fm_work_orders').select('*', { count: 'exact', head: true }).eq('org_id', orgId).is('deleted_at', null).eq('status', 'OPEN'),
        supabase.from('fm_work_orders').select('*', { count: 'exact', head: true }).eq('org_id', orgId).is('deleted_at', null).eq('status', 'IN_PROGRESS'),
        supabase.from('fm_work_orders').select('*', { count: 'exact', head: true }).eq('org_id', orgId).is('deleted_at', null).eq('status', 'COMPLETED'),
        // upcoming + overdue
        supabase.from('fm_inspections').select('*', { count: 'exact', head: true })
          .eq('org_id', orgId).is('deleted_at', null).gte('scheduled_for', nowISO).lte('scheduled_for', in30d),
        supabase.from('fm_work_orders').select('*', { count: 'exact', head: true })
          .eq('org_id', orgId).is('deleted_at', null).neq('status', 'COMPLETED').lt('due_date', nowISO),
      ])
    }

    function buildStats(c: Awaited<ReturnType<typeof counts>>) {
      const [propTotal, propActive, assetTotal,
             inspTotal, inspCompleted, inspInProgress, inspPending, inspScores,
             woTotal, woOpen, woInProgress, woCompleted,
             upcoming, overdueWo] = c
      const scores   = (inspScores.data ?? []) as { score: number | null }[]
      const avgScore = scores.length > 0
        ? scores.reduce((s, r) => s + (r.score ?? 0), 0) / scores.length : 0
      return {
        properties:          { total: propTotal.count ?? 0, active: propActive.count ?? 0 },
        assets:              { total: assetTotal.count ?? 0 },
        inspections:         { total: inspTotal.count ?? 0, completed: inspCompleted.count ?? 0, inProgress: inspInProgress.count ?? 0, pending: inspPending.count ?? 0, averageScore: Math.round(avgScore * 10) / 10 },
        workOrders:          { total: woTotal.count ?? 0, open: woOpen.count ?? 0, inProgress: woInProgress.count ?? 0, completed: woCompleted.count ?? 0, highPriority: 0 },
        upcomingInspections: upcoming.count ?? 0,
        overdueWorkOrders:   overdueWo.count ?? 0,
        complianceRate:      Math.round(avgScore * 10) / 10,
      }
    }

    // ── KPI-only fast path (?view=kpi) ────────────────────────────────────────
    if (view === 'kpi') {
      const c = await counts()
      return NextResponse.json(buildStats(c), { headers: CACHE })
    }

    // ── Mobile fast path (?view=mobile) ───────────────────────────────────────
    // Runs COUNT queries + calendar events only. Skips all desktop-only chart
    // queries (propertiesGeo, recentInspections, monthlyTrend, propertyRisk).
    // Mobile goes from 2 API calls → 1, and response is ~90% smaller.
    if (view === 'mobile') {
      const [c, scheduledInspRes, scheduledWoRes] = await Promise.all([
        counts(),
        supabase
          .from('fm_inspections')
          .select('id, scheduled_for, status, property_id, fm_properties(name), fm_inspection_templates(name)')
          .eq('org_id', orgId).is('deleted_at', null)
          .not('scheduled_for', 'is', null)
          .order('scheduled_for', { ascending: true })
          .limit(200),
        supabase
          .from('fm_work_orders')
          .select('id, title, due_date, status, priority, property_id, fm_properties(name)')
          .eq('org_id', orgId).is('deleted_at', null)
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true })
          .limit(200),
      ])

      const scheduledEvents = buildScheduledEvents(
        scheduledInspRes.data ?? [], scheduledWoRes.data ?? [], nowISO
      )
      return NextResponse.json({
        ...buildStats(c),
        scheduledEvents,
        pendingApprovals: [],
        propertiesGeo: [],
        recentInspections: [],
        monthlyTrend: [],
        propertyRisk: [],
      }, { headers: CACHE })
    }

    // ── Full path (desktop) ───────────────────────────────────────────────────
    const [
      c,
      pendingRes,
      propertiesGeoRes,
      scheduledInspRes,
      scheduledWoRes,
      recentInspRes,
      monthlyInspRes,
      assetRiskRes,
    ] = await Promise.all([
      counts(),

      supabase
        .from('fm_inspections')
        .select('id, status, score, updated_at, fm_properties(name), fm_inspection_templates(name)')
        .eq('org_id', orgId).eq('status', 'PENDING_APPROVAL').is('deleted_at', null)
        .order('updated_at', { ascending: false }).limit(8),

      supabase
        .from('fm_properties')
        .select('id, name, code, status, latitude, longitude, cover_image_url')
        .eq('org_id', orgId).is('deleted_at', null)
        .not('latitude', 'is', null).limit(50),

      supabase
        .from('fm_inspections')
        .select('id, scheduled_for, status, property_id, fm_properties(name), fm_inspection_templates(name)')
        .eq('org_id', orgId).is('deleted_at', null)
        .not('scheduled_for', 'is', null)
        .order('scheduled_for', { ascending: true }).limit(200),

      supabase
        .from('fm_work_orders')
        .select('id, title, due_date, status, priority, property_id, fm_properties(name)')
        .eq('org_id', orgId).is('deleted_at', null)
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true }).limit(200),

      supabase
        .from('fm_inspections')
        .select('id, status, score, scheduled_for, updated_at, fm_properties(name), fm_inspection_templates(name)')
        .eq('org_id', orgId).is('deleted_at', null)
        .order('updated_at', { ascending: false }).limit(30),

      supabase
        .from('fm_inspections')
        .select('id, status, score, updated_at')
        .eq('org_id', orgId).is('deleted_at', null)
        .gte('updated_at', sixMonthsAgo)
        .order('updated_at', { ascending: true }),

      supabase
        .from('fm_assets')
        .select('id, condition, property_id, fm_properties(name)')
        .eq('org_id', orgId).is('deleted_at', null)
        .not('property_id', 'is', null).limit(500),
    ])

    const stats = buildStats(c)
    const scheduledEvents = buildScheduledEvents(
      scheduledInspRes.data ?? [], scheduledWoRes.data ?? [], nowISO
    )

    // Monthly trend (last 6 months)
    const monthlyMap: Record<string, { total: number; completed: number; scoreSum: number; scoreCount: number }> = {}
    for (const insp of (monthlyInspRes.data ?? [])) {
      const d   = new Date(insp.updated_at as string)
      const key = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
      if (!monthlyMap[key]) monthlyMap[key] = { total: 0, completed: 0, scoreSum: 0, scoreCount: 0 }
      monthlyMap[key].total++
      if (insp.status === 'COMPLETED' || insp.status === 'APPROVED') {
        monthlyMap[key].completed++
        if ((insp.score as number | null) != null) {
          monthlyMap[key].scoreSum  += (insp.score as number)
          monthlyMap[key].scoreCount++
        }
      }
    }
    const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
      const d   = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
      const key = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
      const m   = monthlyMap[key]
      return {
        month:     key,
        total:     m?.total     ?? 0,
        completed: m?.completed ?? 0,
        avgScore:  m?.scoreCount ? Math.round(m.scoreSum / m.scoreCount) : 0,
      }
    })

    // Per-property asset risk
    const propRiskMap: Record<string, { name: string; good: number; fair: number; poor: number }> = {}
    for (const asset of (assetRiskRes.data ?? [])) {
      const propId   = asset.property_id as string
      const propName = (asset.fm_properties as { name?: string } | null)?.name ?? 'Unknown'
      if (!propRiskMap[propId]) propRiskMap[propId] = { name: propName, good: 0, fair: 0, poor: 0 }
      if (asset.condition === 'GOOD')      propRiskMap[propId].good++
      else if (asset.condition === 'FAIR') propRiskMap[propId].fair++
      else if (asset.condition === 'POOR') propRiskMap[propId].poor++
    }
    const propertyRisk = Object.values(propRiskMap)
      .sort((a, b) => b.poor - a.poor || b.fair - a.fair)
      .slice(0, 8)

    const recentInspections = (recentInspRes.data ?? []).map(i => ({
      id: i.id,
      status: i.status as string,
      score: i.score as number | null,
      scheduled_for: (i.scheduled_for as string | null) ?? null,
      updated_at: i.updated_at as string,
      property_name: (i.fm_properties as { name?: string } | null)?.name ?? '—',
      template_name: (i.fm_inspection_templates as { name?: string } | null)?.name ?? null,
    }))

    return NextResponse.json({
      ...stats,
      pendingApprovals:  pendingRes.data ?? [],
      propertiesGeo:     propertiesGeoRes.data ?? [],
      scheduledEvents,
      recentInspections,
      monthlyTrend,
      propertyRisk,
    }, { headers: CACHE })

  } catch (e) { return caught(e) }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildScheduledEvents(
  inspections: Record<string, unknown>[],
  workOrders:  Record<string, unknown>[],
  nowISO: string,
) {
  const events: Array<{
    id: string; title: string; type: 'inspection' | 'work_order'
    date: string; datetime: string; propertyId: string | null
    propertyName: string; templateName: string | null
    isOverdue: boolean; status: string
  }> = []

  for (const insp of inspections) {
    const sf = insp.scheduled_for as string | null
    if (!sf) continue
    events.push({
      id:           insp.id as string,
      title:        (insp.fm_properties as { name?: string } | null)?.name ?? 'Inspection',
      type:         'inspection',
      date:         sf.slice(0, 10),
      datetime:     sf,
      propertyId:   (insp.property_id as string | null) ?? null,
      propertyName: (insp.fm_properties as { name?: string } | null)?.name ?? '—',
      templateName: (insp.fm_inspection_templates as { name?: string } | null)?.name ?? null,
      isOverdue:    false,
      status:       insp.status as string,
    })
  }

  for (const wo of workOrders) {
    const dd = wo.due_date as string | null
    if (!dd) continue
    const isOverdue = wo.status !== 'COMPLETED' && dd < nowISO
    events.push({
      id:           wo.id as string,
      title:        wo.title as string,
      type:         'work_order',
      date:         dd.slice(0, 10),
      datetime:     dd,
      propertyId:   (wo.property_id as string | null) ?? null,
      propertyName: (wo.fm_properties as { name?: string } | null)?.name ?? '—',
      templateName: null,
      isOverdue,
      status:       wo.status as string,
    })
  }

  return events
}
