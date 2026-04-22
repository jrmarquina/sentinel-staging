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

const assetSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(2),
  category: z.string().min(1),
  location: z.string().optional(),
  condition: z.string().optional(),
  risk: z.string().optional(),
  property_id: z.string().min(1),
})

export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()
    const { searchParams } = new URL(req.url)
    const propertyId = searchParams.get('propertyId')
    const category = searchParams.get('category')

    let query = supabase
      .from('fm_assets')
      .select(`
        *,
        fm_properties!inner(name, code),
        fm_inspections(count)
      `)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })

    if (propertyId) query = query.eq('property_id', propertyId)
    if (category) query = query.eq('category', category)

    const { data, error } = await query
    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'inspector'])
    const body = await req.json()
    const validated = assetSchema.safeParse(body)
    if (!validated.success) return err(validated.error.errors[0].message, 400)

    const supabase = createClient()

    // Verify property belongs to org
    const { data: property } = await supabase
      .from('fm_properties')
      .select('id')
      .eq('id', validated.data.property_id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (!property) return err('Invalid property: not found in your organisation', 403)

    const { data, error } = await supabase
      .from('fm_assets')
      .insert({ ...validated.data, org_id: session.orgId })
      .select()
      .single()

    if (error) return err(error.message)
    return NextResponse.json(data, { status: 201 })
  } catch (e) { return caught(e) }
}
