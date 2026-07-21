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

// STORAGE custodians are system-managed (one per property, auto-created).
// They cannot be created through this endpoint.
const custodianSchema = z.object({
  full_name: z.string().min(1),
  custodian_type: z.enum(['TEACHER', 'MAINTENANCE', 'STAFF']),
  property_id: z.string().uuid().nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  external_ref: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()
    const { searchParams } = new URL(req.url)
    const propertyId = searchParams.get('propertyId')
    const type = searchParams.get('type')
    const activeOnly = searchParams.get('activeOnly') === 'true'

    let query = supabase
      .from('fm_custodians')
      .select('*, fm_properties!property_id(id, name)')
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .order('full_name', { ascending: true })

    if (propertyId) query = query.eq('property_id', propertyId)
    if (type) query = query.eq('custodian_type', type)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query
    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor'])
    const body = await req.json()
    const validated = custodianSchema.safeParse(body)
    if (!validated.success) return err(validated.error.errors[0].message, 400)

    const supabase = createClient()

    // If a property is given, verify it belongs to the org.
    if (validated.data.property_id) {
      const { data: property } = await supabase
        .from('fm_properties')
        .select('id')
        .eq('id', validated.data.property_id)
        .eq('org_id', session.orgId)
        .is('deleted_at', null)
        .single()
      if (!property) return err('Invalid property: not found in your organisation', 403)
    }

    const { data, error } = await supabase
      .from('fm_custodians')
      .insert({ ...validated.data, org_id: session.orgId })
      .select()
      .single()

    if (error) return err(error.message)
    return NextResponse.json(data, { status: 201 })
  } catch (e) { return caught(e) }
}
