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

const assetUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(2).optional(),
  category: z.string().min(1).optional(),
  location: z.string().optional(),
  condition: z.string().optional(),
  risk: z.string().optional(),
  property_id: z.string().optional(),
  last_inspection: z.string().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()

    const { data, error } = await supabase
      .from('fm_assets')
      .select(`
        *,
        fm_properties(*),
        fm_inspections(
          id, status, completed_at, score,
          fm_users:inspector_id(full_name)
        ),
        fm_attachments(*)
      `)
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (error || !data) return err('Asset not found', 404)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(['admin'])
    const body = await req.json()
    const validated = assetUpdateSchema.safeParse(body)
    if (!validated.success) return err(validated.error.errors[0].message, 400)

    const supabase = createClient()

    const { data, error } = await supabase
      .from('fm_assets')
      .update({ ...validated.data, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .select()
      .single()

    if (error) return err(error.message)
    if (!data) return err('Asset not found', 404)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}
