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

const spaceSchema = z.object({
  property_id: z.string().uuid(),
  name: z.string().min(1),
  space_type: z.enum(['CLASSROOM', 'OFFICE', 'STORAGE', 'COMMON', 'OUTDOOR', 'OTHER']).optional(),
  floor_id: z.string().uuid().nullable().optional(),
  code: z.string().nullable().optional(),
  source_path: z.string().nullable().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()
    const { searchParams } = new URL(req.url)
    const propertyId = searchParams.get('propertyId')
    const type = searchParams.get('type')

    let query = supabase
      .from('fm_spaces')
      .select('*, fm_properties!property_id(id, name), fm_floors!floor_id(id, name)')
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    if (propertyId) query = query.eq('property_id', propertyId)
    if (type) query = query.eq('space_type', type)

    const { data, error } = await query
    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor'])
    const body = await req.json()
    const validated = spaceSchema.safeParse(body)
    if (!validated.success) return err(validated.error.errors[0].message, 400)

    const supabase = createClient()

    const { data: property } = await supabase
      .from('fm_properties')
      .select('id')
      .eq('id', validated.data.property_id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()
    if (!property) return err('Invalid property: not found in your organisation', 403)

    const { data, error } = await supabase
      .from('fm_spaces')
      .insert({ ...validated.data, org_id: session.orgId })
      .select()
      .single()

    if (error) return err(error.message)
    return NextResponse.json(data, { status: 201 })
  } catch (e) { return caught(e) }
}
