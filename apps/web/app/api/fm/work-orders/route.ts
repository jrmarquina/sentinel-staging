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

const workOrderSchema = z.object({
  title: z.string().min(1),
  priority: z.string().optional().default('MEDIUM'),
  property_id: z.string().min(1),
  asset_id: z.string().nullable().optional().transform(v => (v === '' || v === null ? undefined : v)),
  inspection_id: z.string().nullable().optional().transform(v => (v === '' || v === null ? undefined : v)),
  checklist_item_id: z.string().nullable().optional().transform(v => (v === '' || v === null ? undefined : v)),
  description: z.string().nullable().optional().transform(v => (v === '' || v === null ? undefined : v)),
  assigned_to_id: z.string().nullable().optional().transform(v => (v === '' || v === null ? undefined : v)),
})

export async function GET(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()
    const { searchParams } = new URL(req.url)
    const propertyId = searchParams.get('propertyId')
    const assetId = searchParams.get('assetId')
    const status = searchParams.get('status')
    const inspectionId = searchParams.get('inspectionId')
    const checklistItemId = searchParams.get('checklistItemId')

    let query = supabase
      .from('fm_work_orders')
      .select(`
        *,
        fm_properties!inner(name, code),
        assigned_to:assigned_to_id(full_name)
      `)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (propertyId) query = query.eq('property_id', propertyId)
    if (assetId) query = query.eq('asset_id', assetId)
    if (status) query = query.eq('status', status)
    if (inspectionId) query = query.eq('inspection_id', inspectionId)
    if (checklistItemId) query = query.eq('checklist_item_id', checklistItemId)

    const { data, error } = await query
    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector'])
    const body = await req.json()
    const validated = workOrderSchema.safeParse(body)
    if (!validated.success) return err(validated.error.errors[0].message, 400)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('fm_work_orders')
      .insert({
        ...validated.data,
        status: 'OPEN',
        org_id: session.orgId,
      })
      .select()
      .single()

    if (error) return err(error.message)
    return NextResponse.json(data, { status: 201 })
  } catch (e) { return caught(e) }
}
