import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'
import { parseInventoryWorkbook, type ParseResult } from '@/lib/import/inventory-mapping'

export const maxDuration = 300 // large workbooks take a while

function err(msg: string, status = 500) { return NextResponse.json({ error: msg }, { status }) }
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// POST — upload the Inventario workbook. ?dryRun=true parses and returns a
// summary without writing. Otherwise it upserts everything and reports counts.
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor'])
    const dryRun = new URL(req.url).searchParams.get('dryRun') === 'true'

    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return err('No file uploaded (expected field "file")', 400)

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0])

    let parsed: ParseResult
    try { parsed = parseInventoryWorkbook(wb) }
    catch (e) { return err(`Could not parse workbook: ${e instanceof Error ? e.message : 'unknown'}`, 400) }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        stats: parsed.stats,
        counts: {
          properties: parsed.properties.length,
          spaces: parsed.spaces.length,
          custodians: parsed.custodians.length,
          assets: parsed.assets.length,
          retired: parsed.assets.filter((a) => a.status === 'RETIRED').length,
          fixed: parsed.assets.filter((a) => a.mobility === 'FIXED').length,
        },
        warnings: parsed.warnings.slice(0, 50),
        sampleAssets: parsed.assets.slice(0, 10),
      })
    }

    const supabase = createClient()
    const org = session.orgId

    // ── 1. Properties (upsert by org_id,code) → code→id map ──
    for (const c of chunk(parsed.properties, 500)) {
      const { error } = await supabase.from('fm_properties')
        .upsert(c.map((p) => ({ org_id: org, code: p.code, name: p.name })), { onConflict: 'org_id,code', ignoreDuplicates: false })
      if (error) return err(`Properties: ${error.message}`)
    }
    const { data: propRows } = await supabase.from('fm_properties')
      .select('id, code').eq('org_id', org).is('deleted_at', null)
    const propId = new Map<string, string>((propRows ?? []).map((p: { id: string; code: string }) => [p.code, p.id]))

    // ── 2. Custodians (insert names not already present) → name→id ──
    const { data: existingCust } = await supabase.from('fm_custodians')
      .select('id, full_name').eq('org_id', org).is('deleted_at', null)
    const custId = new Map<string, string>(
      (existingCust ?? []).map((c: { id: string; full_name: string }) => [c.full_name.toLowerCase(), c.id]),
    )
    const newCust = parsed.custodians.filter((c) => !custId.has(c.fullName.toLowerCase()))
    for (const c of chunk(newCust, 500)) {
      const { data, error } = await supabase.from('fm_custodians')
        .insert(c.map((x) => ({
          org_id: org, full_name: x.fullName, custodian_type: 'STAFF',
          property_id: x.propertyCode ? propId.get(x.propertyCode) ?? null : null,
        })))
        .select('id, full_name')
      if (error) return err(`Custodians: ${error.message}`)
      for (const row of data ?? []) custId.set((row as { full_name: string }).full_name.toLowerCase(), (row as { id: string }).id)
    }

    // ── 3. Spaces (insert those not already present) → key→id ──
    const { data: existingSpaces } = await supabase.from('fm_spaces')
      .select('id, property_id, name').eq('org_id', org).is('deleted_at', null)
    const spaceKey = (pid: string, name: string) => `${pid}::${name.toLowerCase()}`
    const spaceId = new Map<string, string>(
      (existingSpaces ?? []).map((s: { id: string; property_id: string; name: string }) => [spaceKey(s.property_id, s.name), s.id]),
    )
    const newSpaces = parsed.spaces
      .map((s) => ({ pid: propId.get(s.propertyCode), s }))
      .filter((x): x is { pid: string; s: typeof parsed.spaces[number] } => !!x.pid && !spaceId.has(spaceKey(x.pid, x.s.name)))
    for (const c of chunk(newSpaces, 500)) {
      const { data, error } = await supabase.from('fm_spaces')
        .insert(c.map((x) => ({
          org_id: org, property_id: x.pid, name: x.s.name,
          space_type: 'OTHER', source_path: x.s.sourcePath || null,
        })))
        .select('id, property_id, name')
      if (error) return err(`Spaces: ${error.message}`)
      for (const row of data ?? []) {
        const rr = row as { id: string; property_id: string; name: string }
        spaceId.set(spaceKey(rr.property_id, rr.name), rr.id)
      }
    }

    // ── 4. Assets (upsert by org_id,code) ──
    let assetCount = 0
    const assetRows = parsed.assets.map((a) => {
      const pid = propId.get(a.propertyCode)
      if (!pid) return null
      const sid = a.spaceName ? spaceId.get(spaceKey(pid, a.spaceName)) ?? null : null
      const cid = a.custodianName ? custId.get(a.custodianName.toLowerCase()) ?? null : null
      return {
        org_id: org, property_id: pid, code: a.code, name: a.name, category: a.category,
        mobility: a.mobility, status: a.status,
        current_custodian_id: a.mobility === 'MOBILE' ? cid : null,
        current_space_id: a.mobility === 'MOBILE' ? sid : null,
        sap_asset_number: a.sap_asset_number, sap_subnumber: a.sap_subnumber,
        inventory_number: a.inventory_number, serial: a.serial, tablilla: a.tablilla, modulo: a.modulo,
        fund: a.fund, fund_center: a.fund_center, cost_center: a.cost_center, fiscal_year: a.fiscal_year,
        acquisition_date: a.acquisition_date, acquisition_value: a.acquisition_value,
        last_inventory_date: a.last_inventory_date,
      }
    }).filter((r): r is NonNullable<typeof r> => r !== null)

    for (const c of chunk(assetRows, 500)) {
      const { error } = await supabase.from('fm_assets')
        .upsert(c, { onConflict: 'org_id,code', ignoreDuplicates: false })
      if (error) return err(`Assets: ${error.message}`)
      assetCount += c.length
    }

    return NextResponse.json({
      ok: true,
      imported: {
        properties: parsed.properties.length,
        custodians: newCust.length,
        spaces: newSpaces.length,
        assets: assetCount,
      },
      stats: parsed.stats,
      warnings: parsed.warnings.slice(0, 50),
    })
  } catch (e) { return caught(e) }
}
