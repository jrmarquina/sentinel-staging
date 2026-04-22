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

const scheduleSchema = z.object({
  property_id: z.string().min(1),
  template_id: z.string().min(1),
  cron: z.string().optional(),
  frequency: z.string().optional(),
  type: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()
    const { searchParams } = new URL(req.url)
    const propertyId = searchParams.get('propertyId')

    let query = supabase
      .from('fm_schedules')
      .select(`
        *,
        fm_properties!inner(name),
        fm_templates:template_id(name)
      `)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)

    if (propertyId) query = query.eq('property_id', propertyId)

    const { data, error } = await query
    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['admin'])
    const body = await req.json()
    const parsed = scheduleSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('fm_schedules')
      .insert({ ...parsed.data, active: true, org_id: session.orgId })
      .select()
      .single()

    if (error) return err(error.message)
    return NextResponse.json(data, { status: 201 })
  } catch (e) { return caught(e) }
}
