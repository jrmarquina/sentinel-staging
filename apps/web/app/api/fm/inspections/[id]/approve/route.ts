import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(['admin', 'supervisor'])
    const supabase = createClient()

    const { data: inspection } = await supabase
      .from('fm_inspections')
      .select('id, status, asset_id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .single()

    if (!inspection) return err('Inspection not found', 404)
    if (inspection.status !== 'PENDING_APPROVAL') {
      return err('Inspection is not pending approval', 400)
    }

    const { data: updated, error } = await supabase
      .from('fm_inspections')
      .update({
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        approved_by_id: session.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return err(error.message)

    if (inspection.asset_id) {
      await supabase
        .from('fm_assets')
        .update({ last_inspection: new Date().toISOString() })
        .eq('id', inspection.asset_id)
        .eq('org_id', session.orgId)
    }

    return NextResponse.json(updated)
  } catch (e) { return caught(e) }
}
