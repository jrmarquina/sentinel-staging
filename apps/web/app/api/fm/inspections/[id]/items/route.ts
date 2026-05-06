import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'
import { z } from 'zod'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

// FM capability helpers
function canRunInspection(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'org_manager'].includes(cap)
  return ['admin', 'supervisor', 'inspector'].includes(role)
}

const updateItemsSchema = z.object({
  items: z.array(z.object({
    key: z.string(),
    label: z.string().optional(),   // optional — saveDirty only sends key + result/severity/notes
    result: z.string().nullable().optional(),
    severity: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    evidence: z.unknown().optional(),
    pin: z.unknown().optional(),
  })),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!canRunInspection(session.capability, session.role)) return err('Forbidden', 403)
    const body = await req.json()
    const parsed = updateItemsSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const supabase = createClient()

    // Verify inspection exists and belongs to org
    const { data: inspection } = await supabase
      .from('fm_inspections')
      .select('id, status, property_id, asset_id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .single()

    if (!inspection) return err('Inspection not found', 404)

    // Fetch existing items
    const { data: existingItems } = await supabase
      .from('fm_checklist_item_responses')
      .select('id, key')
      .eq('inspection_id', params.id)

    const itemMap = new Map((existingItems ?? []).map(i => [i.key, i.id]))

    // Upsert each item
    for (const item of parsed.data.items) {
      const itemId = itemMap.get(item.key)
      if (!itemId) continue

      const isFail = item.result?.toLowerCase() === 'fail' || item.severity === 'HIGH'

      await supabase
        .from('fm_checklist_item_responses')
        .update({
          result: item.result ?? null,
          severity: item.severity ?? null,
          notes: item.notes ?? null,
          evidence: item.evidence ?? null,
          location_data: item.pin ?? null,
        })
        .eq('id', itemId)

      // Auto-create work order on failure (if one doesn't already exist)
      if (isFail) {
        const { count } = await supabase
          .from('fm_work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('checklist_item_id', itemId)
          .eq('org_id', session.orgId)
          .then(r => ({ count: r.count ?? 0 }))

        if (count === 0) {
          const label = item.label ?? item.key
          await supabase.from('fm_work_orders').insert({
            title: `${label} - Maintenance Required`,
            description: item.notes ?? `Automated work order from inspection failure (${label})`,
            priority: item.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
            property_id: inspection.property_id,
            asset_id: inspection.asset_id ?? null,
            inspection_id: params.id,
            checklist_item_id: itemId,
            status: 'OPEN',
            org_id: session.orgId,
          })
        }
      }
    }

    // Advance status from DRAFT → IN_PROGRESS
    if (inspection.status === 'DRAFT') {
      await supabase
        .from('fm_inspections')
        .update({ status: 'IN_PROGRESS', updated_at: new Date().toISOString() })
        .eq('id', params.id)
    } else {
      await supabase
        .from('fm_inspections')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', params.id)
    }

    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
