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
    ] = await Promise.all([
      // Core counts
      supabase.from('fm_properties').select('id, status').eq('org_id', orgId).is('deleted_at', null),
      supabase.from('fm_assets').select('id, condition').eq('org_id', orgId).is('deleted_at', null),
      supabase.from('fm_inspections').select('id, status, score').eq('org_id', orgId).is('deleted_at', null),
      supabase.from('fm_work_orders').select('id, status, priority').eq('org_id', orgId).is('deleted_at', null),

      // Pending approvals feed
      supabase
        .from('fm_inspections')
        .select('id, status, score, updated_at, fm_properties(name), fm_templates(name)')
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
        .select('id, scheduled_for, status, property_id, fm_properties(name), fm_templates(name)')
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
        templateName: (insp.fm_templates as { name?: string } | null)?.name ?? null,
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
      // New fields for redesigned dashboard
      upcomingInspections: upcomingRes.count ?? 0,
      overdueWorkOrders: overdueWoRes.count ?? 0,
      complianceRate,
      pendingApprovals: pendingRes.data ?? [],
      propertiesGeo: propertiesGeoRes.data ?? [],
      scheduledEvents,
      // Legacy — kept for compatibility
      recentInspections: [],
    })
  } catch (e) { return caught(e) }
}
