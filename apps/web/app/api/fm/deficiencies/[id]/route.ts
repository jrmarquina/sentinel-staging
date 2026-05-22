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

function isFmManager(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager'].includes(cap)
  return ['admin', 'supervisor'].includes(role)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmManager(session.capability, session.role)) return err('Forbidden', 403)

    const body = await req.json() as { cost_estimate?: number | null }

    const rawCost = body.cost_estimate
    if (rawCost !== null && rawCost !== undefined) {
      if (typeof rawCost !== 'number' || rawCost < 0 || !isFinite(rawCost)) {
        return err('cost_estimate must be a non-negative number or null', 400)
      }
    }

    const supabase = createClient()

    const { data, error } = await supabase
      .from('fm_checklist_item_responses')
      .update({ cost_estimate: rawCost ?? null })
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .select('id, cost_estimate')
      .single()

    if (error) return err(error.message)
    if (!data) return err('Item not found', 404)

    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}
