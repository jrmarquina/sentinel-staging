import type ExcelJS from 'exceljs'

// ─────────────────────────────────────────────────────────────────────────────
// Maps the Municipality of Guaynabo "Inventario" SAP export into SIMS records.
//
// The workbook has one sheet per property (named "<Name> <code>", e.g.
// "Almacen #050102", "Administracion 010401"), a master rollup sheet, and
// several "Decomiso …" (decommission) sheets. Rows are furniture/equipment
// with a Location code (the building), a Location Description hierarchy
// (BUILDING \ FLOOR \ ROOM), and — on per-property sheets — a Custody Name.
//
// This module is pure: it takes a parsed workbook and returns structured,
// de-duplicated records. The import route persists them; a Node script can
// exercise it directly against the real file.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedProperty { code: string; name: string }
export interface ParsedSpace { propertyCode: string; name: string; sourcePath: string }
export interface ParsedCustodian { fullName: string; propertyCode: string | null }
export interface ParsedAsset {
  code: string
  name: string
  category: string
  mobility: 'FIXED' | 'MOBILE'
  status: 'IN_SERVICE' | 'IN_STORAGE' | 'RETIRED'
  propertyCode: string
  custodianName: string | null
  spaceName: string | null
  sap_asset_number: string | null
  sap_subnumber: string | null
  inventory_number: string | null
  serial: string | null
  tablilla: string | null
  modulo: string | null
  fund: string | null
  fund_center: string | null
  cost_center: string | null
  fiscal_year: string | null
  acquisition_date: string | null
  acquisition_value: number | null
  last_inventory_date: string | null
}

export interface ParseResult {
  properties: ParsedProperty[]
  spaces: ParsedSpace[]
  custodians: ParsedCustodian[]
  assets: ParsedAsset[]
  warnings: string[]
  stats: { sheets: number; rows: number; skipped: number; unassigned: number }
}

// Catch-all building for assets whose row carries no Location code. They are
// imported here (never dropped) so the supervisor can reassign them in SIMS.
const UNASSIGNED_PROPERTY_CODE = 'UNASSIGNED'
const UNASSIGNED_PROPERTY_NAME = 'Unassigned / No Location'

// ── helpers ──────────────────────────────────────────────────────────────────

function cellStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && v !== null && 'text' in (v as Record<string, unknown>)) {
    v = (v as { text: unknown }).text // rich text / hyperlink cells
  }
  const s = String(v).trim()
  return s === '' ? null : s
}

function cellDate(v: unknown): string | null {
  let d: Date | null = null
  if (v instanceof Date && !isNaN(v.getTime())) d = v
  else {
    const s = cellStr(v)
    if (!s) return null
    const parsed = new Date(s)
    if (!isNaN(parsed.getTime())) d = parsed
  }
  if (!d) return null
  // Guard against corrupt spreadsheet dates (seen: year 44158) that Postgres rejects.
  const y = d.getUTCFullYear()
  if (y < 1900 || y > 2100) return null
  return d.toISOString().slice(0, 10)
}

function cellNum(v: unknown): number | null {
  if (typeof v === 'number') return v
  const s = cellStr(v)
  if (!s) return null
  const n = Number(s.replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? null : n
}

// Property code = a 5–6 digit run near the end of the sheet name.
function parseSheetCode(sheetName: string): { code: string | null; name: string } {
  const m = sheetName.match(/#?\s*(\d{5,6})\s*$/)
  if (!m) return { code: null, name: sheetName.trim() }
  const code = m[1]
  const name = sheetName.slice(0, m.index).replace(/[#\-\s]+$/, '').trim() || code
  return { code, name }
}

const UNASSIGNED = new Set(['SIN ASIGNAR', 'SIN ASIGNACION', 'N/A', 'NA'])

// Space = the most specific (last) segment of the "A \ B \ C" hierarchy.
function parseSpaceLeaf(locationDescription: string | null): string | null {
  if (!locationDescription) return null
  const parts = locationDescription.split('\\').map((p) => p.trim()).filter(Boolean)
  const leaf = parts[parts.length - 1]
  if (!leaf || UNASSIGNED.has(leaf.toUpperCase())) return null
  return leaf
}

// Light keyword classification — the property supervisor refines these in SIMS.
function classify(description: string): { category: string; mobility: 'FIXED' | 'MOBILE' } {
  const d = description.toUpperCase()
  const fixedKw = ['AIRE ACONDICIONADO', 'ACONDICIONADOR', 'ACOND', 'BTU', 'PLANTA ELECTRICA', 'GENERADOR',
    'CISTERNA', 'CALENTADOR', 'EXTRACTOR', 'CONSOLA DE AIRE']
  if (fixedKw.some((k) => d.includes(k))) return { category: 'HVAC/FIXED', mobility: 'FIXED' }
  if (['ABANICO', 'ENFRIADOR', 'NEVERA', 'REFRIGERADOR', 'MICROONDAS', 'ESTUFA', 'HORNO'].some((k) => d.includes(k)))
    return { category: 'APPLIANCE', mobility: 'MOBILE' }
  if (['COMPUTADORA', 'LAPTOP', 'MONITOR', 'IMPRESORA', 'PROYECTOR', 'TABLET', 'CPU'].some((k) => d.includes(k)))
    return { category: 'IT', mobility: 'MOBILE' }
  if (['SILLA', 'ESCRITORIO', 'MESA', 'ARCHIVO', 'GABINETE', 'ANAQUEL', 'ESTANTE', 'SOFA', 'BUTACA'].some((k) => d.includes(k)))
    return { category: 'FURNITURE', mobility: 'MOBILE' }
  return { category: 'OTHER', mobility: 'MOBILE' }
}

// Header name → column index, tolerant of spacing/casing variants.
function headerIndex(headerRow: ExcelJS.Row): Record<string, number> {
  const idx: Record<string, number> = {}
  headerRow.eachCell((cell, col) => {
    const key = cellStr(cell.value)?.toLowerCase().replace(/\s+/g, ' ')
    if (key) idx[key] = col
  })
  return idx
}

function col(idx: Record<string, number>, ...names: string[]): number | null {
  for (const n of names) if (idx[n] !== undefined) return idx[n]
  return null
}

// ── main ─────────────────────────────────────────────────────────────────────

export function parseInventoryWorkbook(wb: ExcelJS.Workbook): ParseResult {
  const warnings: string[] = []
  const propertyByCode = new Map<string, ParsedProperty>()
  const spaceKeys = new Set<string>()
  const spaces: ParsedSpace[] = []
  const custodianKeys = new Set<string>()
  const custodians: ParsedCustodian[] = []
  const assetByCode = new Map<string, ParsedAsset>()
  let rowCount = 0, skipped = 0, sheetCount = 0, unassignedCount = 0

  // First pass: seed property names from sheet names (the richest source).
  wb.eachSheet((ws) => {
    const { code, name } = parseSheetCode(ws.name)
    if (code && !propertyByCode.has(code)) propertyByCode.set(code, { code, name })
  })

  wb.eachSheet((ws) => {
    sheetCount++
    const isDecomiso = /decomiso/i.test(ws.name)
    const headerRow = ws.getRow(1)
    const idx = headerIndex(headerRow)

    const cAsset = col(idx, 'asset')
    const cSub = col(idx, 'subnumber', 'sub number')
    const cDesc = col(idx, 'description')
    const cDate = col(idx, 'date')
    const cFy = col(idx, 'fiscal yr', 'fiscal year')
    const cInv = col(idx, 'inventory number')
    const cSerial = col(idx, 'serial')
    const cLastInv = col(idx, 'last inventory')
    const cLoc = col(idx, 'location')
    const cLocDesc = col(idx, 'location description')
    const cTablilla = col(idx, 'tablilla')
    const cModulo = col(idx, 'módulo', 'modulo')
    const cValue = col(idx, 'adq value')
    const cFund = col(idx, 'fund')
    const cFundCtr = col(idx, 'fund center')
    const cCostCtr = col(idx, 'cost center')
    const cCustody = col(idx, 'custody name')

    if (cDesc === null && cInv === null && cAsset === null) {
      warnings.push(`Sheet "${ws.name}": no recognizable header row — skipped.`)
      return
    }

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const get = (c: number | null) => (c ? row.getCell(c).value : null)

      const description = cDesc ? cellStr(get(cDesc)) : null
      const invNumber = cInv ? cellStr(get(cInv)) : null
      const sapAsset = cAsset ? cellStr(get(cAsset)) : null
      const sapSub = cSub ? cellStr(get(cSub)) : null

      // A row needs at least a description or an identifier to be real.
      if (!description && !invNumber && !sapAsset) { continue }
      rowCount++

      // Property from the row's Location code (authoritative), else sheet.
      let propCode = cLoc ? cellStr(get(cLoc)) : null
      if (!propCode) { const s = parseSheetCode(ws.name); propCode = s.code }
      // No building on the row → route to the Unassigned catch-all, never drop.
      if (!propCode) { propCode = UNASSIGNED_PROPERTY_CODE; unassignedCount++ }

      const locDesc = cLocDesc ? cellStr(get(cLocDesc)) : null
      if (!propertyByCode.has(propCode)) {
        const name = propCode === UNASSIGNED_PROPERTY_CODE
          ? UNASSIGNED_PROPERTY_NAME
          : (locDesc?.split('\\')[0]?.trim() || propCode)
        propertyByCode.set(propCode, { code: propCode, name })
      }

      // Space (skip unassigned).
      const spaceLeaf = parseSpaceLeaf(locDesc)
      if (spaceLeaf) {
        const key = `${propCode}::${spaceLeaf.toLowerCase()}`
        if (!spaceKeys.has(key)) {
          spaceKeys.add(key)
          spaces.push({ propertyCode: propCode, name: spaceLeaf, sourcePath: locDesc ?? '' })
        }
      }

      // Custodian.
      const custodyName = cCustody ? cellStr(get(cCustody)) : null
      if (custodyName) {
        const key = custodyName.toLowerCase()
        if (!custodianKeys.has(key)) {
          custodianKeys.add(key)
          custodians.push({ fullName: custodyName, propertyCode: propCode })
        }
      }

      // Asset code: prefer municipal inventory tag; else SAP asset+sub.
      const code = invNumber && invNumber !== '0'
        ? invNumber
        : sapAsset ? `SAP-${sapAsset}${sapSub ? '-' + sapSub : ''}` : null
      if (!code) { skipped++; continue }

      const cls = classify(description ?? '')
      const status: ParsedAsset['status'] = isDecomiso ? 'RETIRED' : custodyName ? 'IN_SERVICE' : 'IN_STORAGE'

      const existing = assetByCode.get(code)
      if (existing) {
        // Enrich a previously-seen asset with custody/space if it lacked them.
        if (!existing.custodianName && custodyName) existing.custodianName = custodyName
        if (!existing.spaceName && spaceLeaf) existing.spaceName = spaceLeaf
        if (isDecomiso) existing.status = 'RETIRED'
        continue
      }

      assetByCode.set(code, {
        code,
        name: description ?? 'Unnamed asset',
        category: cls.category,
        mobility: cls.mobility,
        status,
        propertyCode: propCode,
        custodianName: custodyName,
        spaceName: spaceLeaf,
        sap_asset_number: sapAsset,
        sap_subnumber: sapSub,
        inventory_number: invNumber && invNumber !== '0' ? invNumber : null,
        serial: cSerial ? cellStr(get(cSerial)) : null,
        tablilla: cTablilla ? cellStr(get(cTablilla)) : null,
        modulo: cModulo ? cellStr(get(cModulo)) : null,
        fund: cFund ? cellStr(get(cFund)) : null,
        fund_center: cFundCtr ? cellStr(get(cFundCtr)) : null,
        cost_center: cCostCtr ? cellStr(get(cCostCtr)) : null,
        fiscal_year: cFy ? cellStr(get(cFy)) : null,
        acquisition_date: cDate ? cellDate(get(cDate)) : null,
        acquisition_value: cValue ? cellNum(get(cValue)) : null,
        last_inventory_date: cLastInv ? cellDate(get(cLastInv)) : null,
      })
    }
  })

  if (unassignedCount > 0) {
    warnings.push(
      `${unassignedCount} assets had no building code and were placed in "${UNASSIGNED_PROPERTY_NAME}" — reassign them in SIMS.`,
    )
  }

  return {
    properties: Array.from(propertyByCode.values()),
    spaces,
    custodians,
    assets: Array.from(assetByCode.values()),
    warnings,
    stats: { sheets: sheetCount, rows: rowCount, skipped, unassigned: unassignedCount },
  }
}
