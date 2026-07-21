import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'
import { z } from 'zod'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

// A movement records where a mobile asset lands. from_* is optional —
// the API fills it from the asset's current state when omitted.
const movementSchema = z.object({
  event_type: z.enum([
    'ACQUISITION',
    'CHECKOUT',
    'CHECKIN',
    'TRANSFER',
    'RELOCATE',
    'RETIRE',
  ]),
  to_custodian_id: z.string().uuid().nullable().optional(),
  to_space_id: z.string().uuid().nullable().optional(),
  to_property_id: z.string().uuid().nullable().optional(),
  condition_at_event: z.enum(['GOOD', 'FAIR', 'POOR']).optional(),
  occurred_at: z.string().optional(),
  note: z.string().max(2000).optional(),
})

// GET — the asset's full chain of custody, newest first.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()

    // Confirm the asset belongs to the caller's org (RLS also enforces this).
    const { data: asset } = await supabase
      .from('fm_assets')
      .select('id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .single()
    if (!asset) return err('Asset not found', 404)

    const { data, error } = await supabase
      .from('fm_asset_movements')
      .select(`
        *,
        from_custodian:fm_custodians!from_custodian_id(id, full_name, custodian_type),
        to_custodian:fm_custodians!to_custodian_id(id, full_name, custodian_type),
        from_space:fm_spaces!from_space_id(id, name),
        to_space:fm_spaces!to_space_id(id, name),
        from_property:fm_properties!from_property_id(id, name),
        to_property:fm_properties!to_property_id(id, name),
        recorded_by_profile:profiles!recorded_by(id, full_name)
      `)
      .eq('asset_id', params.id)
      .eq('org_id', session.orgId)
      .order('occurred_at', { ascending: false })

    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

// POST — record a movement. Restricted to the property supervisor (+admin).
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(['admin', 'supervisor'])
    const body = await req.json()
    const validated = movementSchema.safeParse(body)
    if (!validated.success) return err(validated.error.errors[0].message, 400)

    const supabase = createClient()

    // Load the asset's current state — it becomes the movement's "from".
    const { data: asset } = await supabase
      .from('fm_assets')
      .select('id, mobility, current_custodian_id, current_space_id, property_id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()
    if (!asset) return err('Asset not found', 404)

    const a = asset as {
      id: string
      mobility: string
      current_custodian_id: string | null
      current_space_id: string | null
      property_id: string
    }

    if (a.mobility !== 'MOBILE') {
      return err('Only mobile assets can be checked out or moved', 400)
    }

    const v = validated.data
    const insertRow = {
      org_id: session.orgId,
      asset_id: params.id,
      event_type: v.event_type,
      from_custodian_id: a.current_custodian_id,
      to_custodian_id: v.to_custodian_id ?? null,
      from_space_id: a.current_space_id,
      to_space_id: v.to_space_id ?? null,
      from_property_id: a.property_id,
      to_property_id: v.to_property_id ?? null,
      condition_at_event: v.condition_at_event ?? null,
      occurred_at: v.occurred_at ?? new Date().toISOString(),
      recorded_by: session.userId,
      note: v.note ?? null,
    }

    const { data, error } = await supabase
      .from('fm_asset_movements')
      .insert(insertRow)
      .select()
      .single()

    if (error) return err(error.message)
    return NextResponse.json(data, { status: 201 })
  } catch (e) { return caught(e) }
}
