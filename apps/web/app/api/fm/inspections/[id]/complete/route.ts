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
function canRunInspection(cap: string | null, role: string): boolean {
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
    if (!canRunInspection(session.capability, session.role)) return err('Forbidden', 403)
    const supabase = createClient()

    const { data: items } = await supabase
      .from('fm_checklist_item_responses')
      .select('rating')
      .eq('inspection_id', params.id)

    // Score = average of all rated items (1–5 scale) normalised to 0–100.
    // Unrated items are excluded — only what was actually assessed counts.
    const rated = (items ?? []).filter(i => i.rating !== null)
    const score = rated.length > 0
      ? Math.round((rated.reduce((s, i) => s + (i.rating ?? 0), 0) / rated.length / 5) * 1000) / 10
      : null

    // FM managers complete directly; inspectors go to pending approval
    const nextStatus = isFmManager(session.capability, session.role)
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
          condition: (score ?? 0) >= 80 ? 'GOOD' : (score ?? 0) >= 50 ? 'FAIR' : 'POOR',
        })
        .eq('id', inspection.asset_id)
        .eq('org_id', session.orgId)
    }

    return NextResponse.json(updated)
  } catch (e) { return caught(e) }
}
