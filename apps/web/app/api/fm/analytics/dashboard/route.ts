import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

export async function GET() {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()
    const orgId = session.orgId

    const now   = new Date()
    const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const nowISO = now.toISOString()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

    const [
      propertiesRes,
      assetsRes,
      inspectionsRes,
      workOrdersRes,
      pendingRes,
      propertiesGeoRes,
      upcomingRes,
      overdueWoRes,
      scheduledInspRes,
      scheduledWoRes,
      recentInspRes,
      monthlyInspRes,
      assetRiskRes,
    ] = await Promise.all([
      // Core counts
      supabase.from('fm_properties').select('id, status').eq('org_id', orgId).is('deleted_at', null),
      supabase.from('fm_assets').select('id, condition').eq('org_id', orgId).is('deleted_at', null),
      supabase.from('fm_inspections').select('id, status, score').eq('org_id', orgId).is('deleted_at', null),
      supabase.from('fm_work_orders').select('id, status, priority').eq('org_id', orgId).is('deleted_at', null),

      // Pending approvals feed
      supabase
        .from('fm_inspections')
        .select('id, status, score, updated_at, fm_properties(name), fm_inspection_templates(name)')
        .eq('org_id', orgId)
        .eq('status', 'PENDING_APPROVAL')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(8),

      // Properties with geo coords for map
      supabase
        .from('fm_properties')
        .select('id, name, code, status, latitude, longitude')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .not('latitude', 'is', null)
        .limit(50),

      // Upcoming inspections (next 30 days)
      supabase
        .from('fm_inspections')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .gte('scheduled_for', nowISO)
        .lte('scheduled_for', in30d),

      // Overdue work orders (past due, not completed)
      supabase
        .from('fm_work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .neq('status', 'COMPLETED')
        .lt('due_date', nowISO),

      // Inspections with scheduled_for (for calendar)
      supabase
        .from('fm_inspections')
        .select('id, scheduled_for, status, property_id, fm_properties(name), fm_inspection_templates(name)')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .not('scheduled_for', 'is', null)
        .order('scheduled_for', { ascending: true })
        .limit(200),

      // Work orders with due_date (for calendar)
      supabase
        .from('fm_work_orders')
        .select('id, title, due_date, status, priority, property_id, fm_properties(name)')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true })
        .limit(200),

      // Recent inspections for the inspections panel (right sidebar)
      supabase
        .from('fm_inspections')
        .select('id, status, score, scheduled_for, updated_at, fm_properties(name), fm_inspection_templates(name)')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(30),

      // Monthly inspection activity (last 6 months) — for InspectionChart
      supabase
        .from('fm_inspections')
        .select('id, status, score, updated_at')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .gte('updated_at', sixMonthsAgo)
        .order('updated_at', { ascending: true }),

      // Asset conditions per property — for RiskAssessmentChart
      supabase
        .from('fm_assets')
        .select('id, condition, property_id, fm_properties(name)')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .not('property_id', 'is', null)
        .limit(500),
    ])

    if (propertiesRes.error)  return err(propertiesRes.error.message)
    if (assetsRes.error)      return err(assetsRes.error.message)
    if (inspectionsRes.error) return err(inspectionsRes.error.message)
    if (workOrdersRes.error)  return err(workOrdersRes.error.message)

    const properties  = propertiesRes.data  ?? []
    const assets      = assetsRes.data      ?? []
    const inspections = inspectionsRes.data ?? []
    const workOrders  = workOrdersRes.data  ?? []

    const completedInspections = inspections.filter(i => i.status === 'COMPLETED')
    const avgScore = completedInspections.length > 0
      ? completedInspections.reduce((sum, i) => sum + (i.score ?? 0), 0) / completedInspections.length
      : 0
    const complianceRate = Math.round(avgScore * 10) / 10

    // Build scheduled events list for calendar
    const scheduledEvents: Array<{
      id: string; title: string; type: 'inspection' | 'work_order'
      date: string; datetime: string; propertyId: string | null
      propertyName: string; templateName: string | null
      isOverdue: boolean; status: string
    }> = []

    for (const insp of scheduledInspRes.data ?? []) {
      if (!insp.scheduled_for) continue
      scheduledEvents.push({
        id: insp.id,
        title: (insp.fm_properties as { name?: string } | null)?.name ?? 'Inspection',
        type: 'inspection',
        date: insp.scheduled_for.slice(0, 10),
        datetime: insp.scheduled_for,
        propertyId: insp.property_id ?? null,
        propertyName: (insp.fm_properties as { name?: string } | null)?.name ?? '—',
        templateName: (insp.fm_inspection_templates as { name?: string } | null)?.name ?? null,
        isOverdue: false,
        status: insp.status,
      })
    }

    for (const wo of scheduledWoRes.data ?? []) {
      if (!wo.due_date) continue
      const isOverdue = wo.status !== 'COMPLETED' && wo.due_date < nowISO
      scheduledEvents.push({
        id: wo.id,
        title: wo.title,
        type: 'work_order',
        date: wo.due_date.slice(0, 10),
        datetime: wo.due_date,
        propertyId: wo.property_id ?? null,
        propertyName: (wo.fm_properties as { name?: string } | null)?.name ?? '—',
        templateName: null,
        isOverdue,
        status: wo.status,
      })
    }

    // ── Monthly trend (last 6 months) for InspectionChart ──────────────────
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

    // ── Per-property asset risk for RiskAssessmentChart ─────────────────────
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

    // Build recent inspections list for the right-panel
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
      // Core stats
      properties: {
        total: properties.length,
        active: properties.filter(p => p.status === 'ACTIVE').length,
      },
      assets: {
        total: assets.length,
        byCondition: {
          good: assets.filter(a => a.condition === 'GOOD').length,
          fair: assets.filter(a => a.condition === 'FAIR').length,
          poor: assets.filter(a => a.condition === 'POOR').length,
        },
      },
      inspections: {
        total: inspections.length,
        completed: completedInspections.length,
        pending: inspections.filter(i => i.status === 'PENDING_APPROVAL').length,
        inProgress: inspections.filter(i => i.status === 'IN_PROGRESS').length,
        averageScore: complianceRate,
      },
      workOrders: {
        total: workOrders.length,
        open: workOrders.filter(w => w.status === 'OPEN').length,
        inProgress: workOrders.filter(w => w.status === 'IN_PROGRESS').length,
        completed: workOrders.filter(w => w.status === 'COMPLETED').length,
        highPriority: workOrders.filter(w => w.priority === 'HIGH' && w.status !== 'COMPLETED').length,
      },
      // Dashboard panel data
      upcomingInspections: upcomingRes.count ?? 0,
      overdueWorkOrders: overdueWoRes.count ?? 0,
      complianceRate,
      pendingApprovals: pendingRes.data ?? [],
      propertiesGeo: propertiesGeoRes.data ?? [],
      scheduledEvents,
      recentInspections,
      monthlyTrend,
      propertyRisk,
    })
  } catch (e) { return caught(e) }
}
