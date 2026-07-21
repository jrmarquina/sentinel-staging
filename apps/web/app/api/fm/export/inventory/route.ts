import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'

export const maxDuration = 300

function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

// GET — export all current assets to an .xlsx, columns aligned with the
// import format so corrected data round-trips back into SIMS.
export async function GET(_req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()

    const { data, error } = await supabase
      .from('fm_assets')
      .select(`
        code, name, category, mobility, status, inventory_number, sap_asset_number, sap_subnumber,
        serial, tablilla, modulo, fund, fund_center, cost_center, fiscal_year,
        acquisition_date, acquisition_value, last_inventory_date,
        fm_properties!inner(code, name),
        current_custodian:fm_custodians!current_custodian_id(full_name, custodian_type),
        current_space:fm_spaces!current_space_id(name)
      `)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .order('code', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    type Row = {
      code: string; name: string; category: string; mobility: string; status: string
      inventory_number: string | null; sap_asset_number: string | null; sap_subnumber: string | null
      serial: string | null; tablilla: string | null; modulo: string | null
      fund: string | null; fund_center: string | null; cost_center: string | null; fiscal_year: string | null
      acquisition_date: string | null; acquisition_value: number | null; last_inventory_date: string | null
      fm_properties: { code: string; name: string } | null
      current_custodian: { full_name: string; custodian_type: string } | null
      current_space: { name: string } | null
    }
    const rows = (data ?? []) as unknown as Row[]

    const wb = new ExcelJS.Workbook()
    wb.creator = 'SIMS'
    wb.created = new Date()
    const ws = wb.addWorksheet('Inventory')

    ws.columns = [
      { header: 'Code', key: 'code', width: 18 },
      { header: 'Name', key: 'name', width: 40 },
      { header: 'Category', key: 'category', width: 14 },
      { header: 'Mobility', key: 'mobility', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Building Code', key: 'pcode', width: 14 },
      { header: 'Building', key: 'pname', width: 26 },
      { header: 'Space', key: 'space', width: 24 },
      { header: 'Custodian', key: 'custodian', width: 26 },
      { header: 'Custodian Type', key: 'ctype', width: 14 },
      { header: 'Inventory Number', key: 'inventory_number', width: 16 },
      { header: 'SAP Asset', key: 'sap_asset_number', width: 16 },
      { header: 'SAP Sub', key: 'sap_subnumber', width: 10 },
      { header: 'Serial', key: 'serial', width: 16 },
      { header: 'Tablilla', key: 'tablilla', width: 12 },
      { header: 'Módulo', key: 'modulo', width: 10 },
      { header: 'Fund', key: 'fund', width: 10 },
      { header: 'Fund Center', key: 'fund_center', width: 12 },
      { header: 'Cost Center', key: 'cost_center', width: 12 },
      { header: 'Fiscal Yr', key: 'fiscal_year', width: 10 },
      { header: 'Acquisition Date', key: 'acquisition_date', width: 16 },
      { header: 'Adq Value', key: 'acquisition_value', width: 12 },
      { header: 'Last Inventory', key: 'last_inventory_date', width: 16 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]

    for (const r of rows) {
      ws.addRow({
        code: r.code, name: r.name, category: r.category, mobility: r.mobility, status: r.status,
        pcode: r.fm_properties?.code ?? '', pname: r.fm_properties?.name ?? '',
        space: r.current_space?.name ?? '', custodian: r.current_custodian?.full_name ?? '',
        ctype: r.current_custodian?.custodian_type ?? '',
        inventory_number: r.inventory_number ?? '', sap_asset_number: r.sap_asset_number ?? '',
        sap_subnumber: r.sap_subnumber ?? '', serial: r.serial ?? '', tablilla: r.tablilla ?? '',
        modulo: r.modulo ?? '', fund: r.fund ?? '', fund_center: r.fund_center ?? '',
        cost_center: r.cost_center ?? '', fiscal_year: r.fiscal_year ?? '',
        acquisition_date: r.acquisition_date ?? '', acquisition_value: r.acquisition_value ?? '',
        last_inventory_date: r.last_inventory_date ?? '',
      })
    }

    const buffer = await wb.xlsx.writeBuffer()
    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="sims-inventory-${stamp}.xlsx"`,
      },
    })
  } catch (e) { return caught(e) }
}
