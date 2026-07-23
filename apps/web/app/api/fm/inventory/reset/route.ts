import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'
import { z } from 'zod'

export const maxDuration = 120

function err(msg: string, status = 500) { return NextResponse.json({ error: msg }, { status }) }
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

// Deletes ONLY the data brought in by the Excel inventory import, scoped to the
// caller's org. Custody tables (movements, spaces, non-storage custodians) are
// this-feature-only, so they clear fully. Assets are deleted only when they
// carry an import marker (SAP / inventory fields), leaving any UI-created
// assets untouched. Import-origin properties (now empty, with no work orders,
// inspections, or floors) are removed too so the list can be curated fresh.
//
// Admin-only, typed confirmation, service-role (also clears the append-only
// movements ledger, which RLS otherwise forbids deleting).
const bodySchema = z.object({
  confirm: z.literal('WIPE'),
  includeProperties: z.boolean().optional().default(true),
})

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['admin'])
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) return err('Type WIPE to confirm', 400)
    const org = session.orgId
    const db = createAdminClient()

    const counts: Record<string, number> = {}
    const del = async (label: string, run: () => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) => {
      const { data, error } = await run()
      if (error) throw new Error(`${label}: ${error.message}`)
      counts[label] = (data ?? []).length
    }

    // 1. Movements (custody-only table) — must go before assets (FK).
    await del('movements', () => db.from('fm_asset_movements').delete().eq('org_id', org).select('id'))

    // 2. Imported assets — identified by import-only fields.
    await del('assets', () => db.from('fm_assets').delete()
      .eq('org_id', org)
      .or('sap_asset_number.not.is.null,inventory_number.not.is.null,fund.not.is.null,cost_center.not.is.null')
      .select('id'))

    // 3. Spaces (custody-only table).
    await del('spaces', () => db.from('fm_spaces').delete().eq('org_id', org).select('id'))

    // 4. Custodian people (keep the per-building STORAGE buckets).
    await del('custodians', () => db.from('fm_custodians').delete()
      .eq('org_id', org).neq('custodian_type', 'STORAGE').select('id'))

    // 5. Import-origin properties: those with no remaining dependents.
    if (parsed.data.includeProperties) {
      const protectedIds = new Set<string>()
      for (const tbl of ['fm_assets', 'fm_work_orders', 'fm_inspections', 'fm_floors']) {
        const { data } = await db.from(tbl).select('property_id').eq('org_id', org).not('property_id', 'is', null)
        for (const r of (data ?? []) as { property_id: string | null }[]) {
          if (r.property_id) protectedIds.add(r.property_id)
        }
      }
      let q = db.from('fm_properties').delete().eq('org_id', org)
      if (protectedIds.size > 0) q = q.not('id', 'in', `(${[...protectedIds].join(',')})`)
      const { data, error } = await q.select('id')
      if (error) throw new Error(`properties: ${error.message}`)
      counts['properties'] = (data ?? []).length
      counts['propertiesKept'] = protectedIds.size
    }

    return NextResponse.json({ ok: true, deleted: counts })
  } catch (e) { return caught(e) }
}
