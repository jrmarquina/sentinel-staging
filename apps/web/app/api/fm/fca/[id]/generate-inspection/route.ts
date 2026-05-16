import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'

// Template ID for dynamically-built FCA follow-up inspections
const FCA_FOLLOWUP_TEMPLATE_ID = '20000000-0000-0000-0000-000000000002'

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

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmManager(session.capability, session.role)) return err('Forbidden', 403)

    const supabase = createClient()

    // Load the FCA inspection with its checklist items
    const { data: fca, error: fcaErr } = await supabase
      .from('fm_inspections')
      .select('id, property_id, org_id, status, fm_checklist_item_responses(*)')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .single()

    if (fcaErr || !fca) return err('FCA not found', 404)

    // Find all deficient components: items whose key ends in 'c' and have rating 1 or 2
    type ChecklistItem = {
      id: string; key: string; label: string
      rating: number | null; notes: string | null
      evidence: unknown | null
    }
    const items = (fca.fm_checklist_item_responses ?? []) as ChecklistItem[]
    const deficient = items.filter(
      item => item.key.endsWith('c') && item.rating !== null && item.rating <= 2
    )

    if (deficient.length === 0) {
      return NextResponse.json({ error: 'No components rated 1 or 2 found in this FCA' }, { status: 422 })
    }

    // Create the follow-up inspection
    const { data: inspection, error: insErr } = await supabase
      .from('fm_inspections')
      .insert({
        template_id:  FCA_FOLLOWUP_TEMPLATE_ID,
        property_id:  fca.property_id,
        inspector_id: session.userId,
        status:       'DRAFT',
        started_at:   new Date().toISOString(),
        org_id:       session.orgId,
      })
      .select()
      .single()

    if (insErr || !inspection) return err(insErr?.message ?? 'Failed to create inspection')

    // Pre-populate checklist items from FCA deficiencies
    const checklistItems = deficient.map(item => {
      const ratingLabel = item.rating === 1 ? 'Critical' : 'Poor'
      return {
        inspection_id: inspection.id,
        key:           item.key,
        label:         `${item.label} — FCA rating: ${item.rating} (${ratingLabel})`,
        org_id:        session.orgId,
        notes:         item.notes ?? null,
        evidence:      item.evidence ?? null,
      }
    })

    const { error: itemsErr } = await supabase
      .from('fm_checklist_item_responses')
      .insert(checklistItems)

    if (itemsErr) {
      // Rollback inspection on item insert failure
      await supabase.from('fm_inspections').delete().eq('id', inspection.id)
      return err(itemsErr.message)
    }

    return NextResponse.json({ inspection_id: inspection.id }, { status: 201 })
  } catch (e) { return caught(e) }
}
