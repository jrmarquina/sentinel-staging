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

    // Run queries in parallel
    const [
      propertiesRes,
      assetsRes,
      inspectionsRes,
      workOrdersRes,
      recentInspectionsRes,
    ] = await Promise.all([
      supabase
        .from('fm_properties')
        .select('id, status', { count: 'exact' })
        .eq('org_id', orgId)
        .is('deleted_at', null),

      supabase
        .from('fm_assets')
        .select('id, condition', { count: 'exact' })
        .eq('org_id', orgId)
        .is('deleted_at', null),

      supabase
        .from('fm_inspections')
        .select('id, status, score, created_at')
        .eq('org_id', orgId)
        .is('deleted_at', null),

      supabase
        .from('fm_work_orders')
        .select('id, status, priority')
        .eq('org_id', orgId)
        .is('deleted_at', null),

      supabase
        .from('fm_inspections')
        .select(`
          id, status, score, created_at,
          fm_properties(name)
        `)
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    if (propertiesRes.error) return err(propertiesRes.error.message)
    if (assetsRes.error) return err(assetsRes.error.message)
    if (inspectionsRes.error) return err(inspectionsRes.error.message)
    if (workOrdersRes.error) return err(workOrdersRes.error.message)

    const properties = propertiesRes.data ?? []
    const assets = assetsRes.data ?? []
    const inspections = inspectionsRes.data ?? []
    const workOrders = workOrdersRes.data ?? []

    const completedInspections = inspections.filter(i => i.status === 'COMPLETED')
    const avgScore = completedInspections.length > 0
      ? completedInspections.reduce((sum, i) => sum + (i.score ?? 0), 0) / completedInspections.length
      : 0

    return NextResponse.json({
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
        averageScore: Math.round(avgScore * 10) / 10,
      },
      workOrders: {
        total: workOrders.length,
        open: workOrders.filter(w => w.status === 'OPEN').length,
        inProgress: workOrders.filter(w => w.status === 'IN_PROGRESS').length,
        completed: workOrders.filter(w => w.status === 'COMPLETED').length,
        highPriority: workOrders.filter(w => w.priority === 'HIGH' && w.status !== 'COMPLETED').length,
      },
      recentInspections: recentInspectionsRes.data ?? [],
    })
  } catch (e) { return caught(e) }
}
