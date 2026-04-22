import { NextRequest, NextResponse } from 'next/server'
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

/**
 * GET /api/fm/search?q=query
 *
 * Unified global search across FM entities:
 * properties, assets, inspections, and work orders.
 * Returns up to 5 results per entity type.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') ?? ''

    if (!q || q.length < 2) {
      return NextResponse.json({ properties: [], assets: [], inspections: [], workOrders: [] })
    }

    const orgId = session.orgId
    const ilike = `%${q}%`

    const [propertiesRes, assetsRes, inspectionsRes, workOrdersRes] = await Promise.all([
      supabase
        .from('fm_properties')
        .select('id, name, code, address, status')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .or(`name.ilike.${ilike},code.ilike.${ilike},address.ilike.${ilike}`)
        .limit(5),

      supabase
        .from('fm_assets')
        .select('id, name, code, category, condition, property_id')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .or(`name.ilike.${ilike},code.ilike.${ilike},category.ilike.${ilike}`)
        .limit(5),

      supabase
        .from('fm_inspections')
        .select('id, status, score, created_at, property_id')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .eq('status', q.toUpperCase())
        .limit(5),

      supabase
        .from('fm_work_orders')
        .select('id, title, status, priority, property_id')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .or(`title.ilike.${ilike},description.ilike.${ilike}`)
        .limit(5),
    ])

    return NextResponse.json({
      properties: propertiesRes.data ?? [],
      assets: assetsRes.data ?? [],
      inspections: inspectionsRes.data ?? [],
      workOrders: workOrdersRes.data ?? [],
    })
  } catch (e) { return caught(e) }
}
