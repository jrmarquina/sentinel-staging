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
 * Unified custody search over the movement ledger.
 *
 * Query params (all optional, combine freely):
 *   dateFrom, dateTo   — ISO dates; filter on occurred_at
 *   custodianId        — matches movements to OR from this custodian
 *   spaceId            — matches movements to OR from this space
 *   propertyId         — matches movements to OR from this building
 *   category           — asset category (object type)
 *   mobility           — FIXED | MOBILE (defaults to MOBILE — fixed
 *                        assets never generate movements)
 *   eventType          — a specific event type
 *   limit              — max rows (default 500)
 *
 * Returns enriched movement rows, newest first. The client groups them
 * into the by-object / by-person / by-location lenses.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()
    const { searchParams } = new URL(req.url)

    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const custodianId = searchParams.get('custodianId')
    const spaceId = searchParams.get('spaceId')
    const propertyId = searchParams.get('propertyId')
    const category = searchParams.get('category')
    const mobility = searchParams.get('mobility')
    const eventType = searchParams.get('eventType')
    const limit = Math.min(Number(searchParams.get('limit')) || 500, 2000)

    // asset is embedded !inner so category/mobility filters prune the ledger.
    let query = supabase
      .from('fm_asset_movements')
      .select(`
        id, event_type, occurred_at, condition_at_event, note,
        asset:fm_assets!inner(id, name, code, category, mobility, inventory_number),
        from_custodian:fm_custodians!from_custodian_id(id, full_name, custodian_type),
        to_custodian:fm_custodians!to_custodian_id(id, full_name, custodian_type),
        from_space:fm_spaces!from_space_id(id, name),
        to_space:fm_spaces!to_space_id(id, name),
        from_property:fm_properties!from_property_id(id, name),
        to_property:fm_properties!to_property_id(id, name),
        recorded_by_profile:profiles!recorded_by(id, full_name)
      `)
      .eq('org_id', session.orgId)
      .order('occurred_at', { ascending: false })
      .limit(limit)

    // Default to mobile assets; fixed assets have no movement history.
    query = query.eq('fm_assets.mobility', mobility ?? 'MOBILE')
    if (category) query = query.eq('fm_assets.category', category)

    if (dateFrom) query = query.gte('occurred_at', dateFrom)
    if (dateTo) query = query.lte('occurred_at', dateTo)
    if (eventType) query = query.eq('event_type', eventType)

    // Person / location / building match either side of the movement.
    if (custodianId) {
      query = query.or(`from_custodian_id.eq.${custodianId},to_custodian_id.eq.${custodianId}`)
    }
    if (spaceId) {
      query = query.or(`from_space_id.eq.${spaceId},to_space_id.eq.${spaceId}`)
    }
    if (propertyId) {
      query = query.or(`from_property_id.eq.${propertyId},to_property_id.eq.${propertyId}`)
    }

    const { data, error } = await query
    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}
