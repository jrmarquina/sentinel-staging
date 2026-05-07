import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'
import { z } from 'zod'

function err(msg: string, status = 500) { return NextResponse.json({ error: msg }, { status }) }
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

const propertySchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(2).optional(),
  address: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  risk_level: z.string().optional(),
  status: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  cover_image_url: z.string().url().nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()

    const { data, error } = await supabase
      .from('fm_properties')
      .select(`
        *,
        fm_floors(*, fm_floor_plans(*)),
        fm_attachments(*),
        fm_assets(*, updated_at),
        fm_inspections(id, status, score, started_at, completed_at, fm_inspection_templates(name))
      `)
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (error || !data) return err('Property not found', 404)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(['admin'])
    const body = await req.json()
    const validated = propertySchema.safeParse(body)
    if (!validated.success) return err(validated.error.errors[0].message, 400)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('fm_properties')
      .update(validated.data)
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .select()
      .single()

    if (error || !data) return err('Property not found or access denied', 404)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(['admin'])
    const supabase = createClient()

    const { error } = await supabase
      .from('fm_properties')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('org_id', session.orgId)

    if (error) return err(error.message)
    return new NextResponse(null, { status: 204 })
  } catch (e) { return caught(e) }
}
