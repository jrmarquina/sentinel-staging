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
    const session = await requireRole(['admin', 'supervisor', 'inspector'])
    const supabase = createClient()

    const { data: items } = await supabase
      .from('fm_inspection_items')
      .select('id, result, severity')
      .eq('inspection_id', params.id)

    const total = items?.length ?? 0
    const passes = (items ?? []).filter(i =>
      i.result?.toLowerCase() === 'pass' ||
      i.result?.toLowerCase() === 'yes' ||
      !i.severity || i.severity === 'LOW'
    ).length

    const score = total > 0 ? (passes / total) * 100 : 100

    // Admins and supervisors complete directly; inspectors go to pending approval
    const nextStatus =
      session.role === 'admin' || session.role === 'supervisor'
        ? 'COMPLETED'
        : 'PENDING_APPROVAL'

    const { data: inspection } = await supabase
      .from('fm_inspections')
      .select('id, asset_id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .single()

    if (!inspection) return err('Inspection not found', 404)

    const { data: updated, error } = await supabase
      .from('fm_inspections')
      .update({
        status: nextStatus,
        completed_at: nextStatus === 'COMPLETED' ? new Date().toISOString() : null,
        score,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return err(error.message)

    // Update asset condition if applicable
    if (inspection.asset_id && nextStatus === 'COMPLETED') {
      await supabase
        .from('fm_assets')
        .update({
          last_inspection: new Date().toISOString(),
          condition: score > 80 ? 'GOOD' : score > 50 ? 'FAIR' : 'POOR',
        })
        .eq('id', inspection.asset_id)
        .eq('org_id', session.orgId)
    }

    return NextResponse.json(updated)
  } catch (e) { return caught(e) }
}
