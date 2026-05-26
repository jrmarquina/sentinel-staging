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
  if (cap) return ['org_admin', 'fm_manager', 'fm_contributor'].includes(cap)
  return ['admin', 'supervisor', 'inspector'].includes(role)
}

const updateItemsSchema = z.object({
  items: z.array(z.object({
    key: z.string(),
    label: z.string().optional(),
    result: z.string().nullable().optional(),
    severity: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    // Structured commentary fields for RICS-style report view
    inspector_notes:    z.string().nullable().optional(),
    recommended_action: z.string().nullable().optional(),
    // 1-5 condition rating used by FCA assessments; null for pass/fail inspections
    rating: z.number().int().min(1).max(5).nullable().optional(),
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
    const { data: existingItems, error: fetchError } = await supabase
      .from('fm_checklist_item_responses')
      .select('id, key')
      .eq('inspection_id', params.id)

    if (fetchError) {
      console.error('Failed to fetch checklist items:', fetchError)
      return err('Failed to load inspection items', 500)
    }

    const itemMap = new Map((existingItems ?? []).map(i => [i.key, i.id]))

    // Update each item — insert row if it wasn't pre-created (e.g. template updated after inspection)
    const failedKeys: string[] = []
    for (const item of parsed.data.items) {
      const itemId = itemMap.get(item.key)

      const payload = {
        result:             item.result != null ? item.result.toLowerCase() : null,
        severity:           item.severity ?? null,
        notes:              item.notes ?? null,
        inspector_notes:    item.inspector_notes ?? null,
        recommended_action: item.recommended_action ?? null,
        rating:             item.rating ?? null,
        evidence:           item.evidence ?? null,
        location_data:      item.pin ?? null,
      } as Record<string, unknown>

      let saveError: unknown = null
      if (itemId) {
        // DB constraint requires lowercase result ('pass', 'fail', 'yes', 'no')
        // but the run page UI sends uppercase. Normalise before saving.
        const { error } = await supabase
          .from('fm_checklist_item_responses')
          .update(payload)
          .eq('id', itemId)
        saveError = error
      } else {
        // Row missing — template gained this field after inspection was created
        const { error } = await supabase
          .from('fm_checklist_item_responses')
          .insert({
            ...payload,
            inspection_id: params.id,
            key:           item.key,
            label:         item.label ?? item.key,
            org_id:        session.orgId,
          })
        saveError = error
      }

      if (saveError) {
        console.error(`Failed to save item ${item.key}:`, saveError)
        failedKeys.push(item.key)
        continue
      }

      // Work orders are created manually from inspections, not auto-generated here.
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

    if (failedKeys.length > 0) {
      return NextResponse.json({ error: 'Some items failed to save', failedKeys }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
