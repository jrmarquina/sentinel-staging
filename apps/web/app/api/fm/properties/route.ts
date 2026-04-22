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

const propertySchema = z.object({
  name: z.string().min(1),
  code: z.string().min(2),
  address: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  risk_level: z.string().optional(),
  status: z.string().default('ACTIVE'),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
})

export async function GET() {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()

    const { data, error } = await supabase
      .from('fm_properties')
      .select(`
        *,
        fm_assets(count),
        fm_inspections(count)
      `)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })

    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['admin'])
    const body = await req.json()
    const validated = propertySchema.safeParse(body)
    if (!validated.success) return err(validated.error.errors[0].message, 400)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('fm_properties')
      .insert({ ...validated.data, org_id: session.orgId })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return err('Property code must be unique within your organisation', 400)
      return err(error.message)
    }
    return NextResponse.json(data, { status: 201 })
  } catch (e) { return caught(e) }
}
