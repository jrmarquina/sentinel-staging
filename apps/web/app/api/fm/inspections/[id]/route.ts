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

// FM capability helpers
function isFmManager(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager'].includes(cap)
  return ['admin', 'supervisor'].includes(role)
}
function canReadInspection(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager', 'fm_viewer', 'fm_contributor'].includes(cap)
  return ['admin', 'supervisor', 'inspector', 'viewer'].includes(role)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!canReadInspection(session.capability, session.role)) return err('Forbidden', 403)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('fm_inspections')
      .select(`
        *,
        fm_properties(*),
        asset:asset_id(*),
        template:template_id(*),
        inspector:inspector_id(*),
        approved_by:approved_by_id(id, full_name),
        fm_inspection_items:fm_checklist_item_responses(*),
        fm_attachments(*),
        fm_reports(*)
      `)
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .single()

    if (error) return err(error.message, 404)
    if (!data) return err('Inspection not found', 404)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmManager(session.capability, session.role)) return err('Forbidden', 403)
    const supabase = createClient()

    // Cascade: reports → items → inspection
    await supabase.from('fm_reports').delete().eq('inspection_id', params.id).eq('org_id', session.orgId)
    await supabase.from('fm_checklist_item_responses').delete().eq('inspection_id', params.id).eq('org_id', session.orgId)

    const { error } = await supabase
      .from('fm_inspections')
      .delete()
      .eq('id', params.id)
      .eq('org_id', session.orgId)

    if (error) return err(error.message)
    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
