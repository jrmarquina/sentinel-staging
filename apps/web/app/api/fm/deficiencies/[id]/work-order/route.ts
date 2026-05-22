import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

function canCreateWo(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager', 'fm_contributor'].includes(cap)
  return ['admin', 'supervisor', 'inspector'].includes(role)
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!canCreateWo(session.capability, session.role)) return err('Forbidden', 403)

    const supabase = createClient()
    const orgId = session.orgId
    const itemId = params.id

    // Verify the checklist item belongs to this org
    const { data: item, error: itemErr } = await supabase
      .from('fm_checklist_item_responses')
      .select('id, label, notes, severity, inspection_id')
      .eq('id', itemId)
      .eq('org_id', orgId)
      .single()

    if (itemErr || !item) return err('Deficiency item not found', 404)

    // Check if an active WO already exists for this checklist item
    const { data: existingWos } = await supabase
      .from('fm_work_orders')
      .select('id, status, title')
      .eq('checklist_item_id', itemId)
      .eq('org_id', orgId)
      .neq('status', 'COMPLETED')
      .is('deleted_at', null)
      .limit(1)

    if (existingWos && existingWos.length > 0) {
      const wo = existingWos[0]
      return NextResponse.json({ work_order_id: wo.id, status: wo.status, created: false })
    }

    // Resolve inspection → property
    const { data: inspection, error: inspErr } = await supabase
      .from('fm_inspections')
      .select('id, property_id')
      .eq('id', item.inspection_id as string)
      .eq('org_id', orgId)
      .single()

    if (inspErr || !inspection) return err('Inspection not found', 404)

    // Create new WO
    const priority = (item.severity as string | null) === 'HIGH' ? 'HIGH' : 'MEDIUM'
    const title = `Deficiency: ${(item.label as string | null) ?? 'Uncategorized item'}`
    const description =
      (item.notes as string | null) ||
      'Life safety deficiency requiring remediation. Created from analytics deficiency panel.'

    const { data: newWo, error: createErr } = await supabase
      .from('fm_work_orders')
      .insert({
        org_id: orgId,
        title,
        description,
        priority,
        status: 'OPEN',
        checklist_item_id: itemId,
        inspection_id: item.inspection_id,
        property_id: inspection.property_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, status')
      .single()

    if (createErr) return err(createErr.message)

    return NextResponse.json({ work_order_id: newWo.id, status: newWo.status, created: true })
  } catch (e) { return caught(e) }
}
