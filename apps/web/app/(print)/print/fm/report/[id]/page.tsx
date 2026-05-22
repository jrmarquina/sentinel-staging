import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PrintButton } from './PrintButton'

export const dynamic = 'force-dynamic'

// ── Types ──────────────────────────────────────────────────────────────────

interface Property {
  id: string
  name: string
  code: string | null
  address: string | null
}

interface ChecklistItem {
  id: string
  key: string
  label: string
  rating: number | null
  result: string | null
  notes: string | null
  severity: string | null
}

interface Inspection {
  id: string
  status: string
  score: number | null
  completed_at: string | null
  started_at: string | null
  property: Property
  template_name: string | null
  inspector_name: string | null
  items: ChecklistItem[]
}

// ── Scoring ────────────────────────────────────────────────────────────────

/** Canonical score: avg of rated items (1–5) normalised to 0–100. */
function computeScore(items: { rating: number | null }[]): number | null {
  const rated = items.filter(i => i.rating !== null)
  if (rated.length === 0) return null
  const avg = rated.reduce((s, i) => s + (i.rating ?? 0), 0) / rated.length
  return Math.round((avg / 5) * 1000) / 10   // one decimal, e.g. 55.8
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ratingColor(r: number | null): string {
  if (r === null) return '#94a3b8'
  if (r <= 2) return '#ef4444'
  if (r === 3) return '#f59e0b'
  return '#10b981'
}

function ratingLabel(r: number | null): string {
  if (r === null) return '—'
  const map: Record<number, string> = { 1: 'Critical', 2: 'Poor', 3: 'Fair', 4: 'Good', 5: 'Excellent' }
  return map[r] ?? String(r)
}

function scoreColor(s: number | null): string {
  if (s === null) return '#64748b'
  if (s < 60) return '#ef4444'
  if (s < 80) return '#f59e0b'
  return '#10b981'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function FmReportPrintPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createClient()

  // Load report record
  const { data: report } = await supabase
    .from('fm_reports')
    .select('*')
    .eq('id', params.id)
    .is('deleted_at', null)
    .single()

  if (!report) notFound()

  // Load org name
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', report.org_id)
    .single()

  const orgName = (org as { name: string } | null)?.name ?? 'Sentinel'

  // ── Portfolio compliance report ──────────────────────────────────────────
  if (report.type === 'PORTFOLIO_COMPLIANCE') {
    const { data: inspections } = await supabase
      .from('fm_inspections')
      .select(`
        id, status, score, completed_at, started_at,
        fm_properties!inner(id, name, code, address),
        fm_templates:template_id(name),
        inspector:inspector_id(full_name),
        fm_checklist_item_responses(id, key, label, rating, result, notes, severity)
      `)
      .eq('org_id', report.org_id)
      .eq('status', 'COMPLETED')
      .is('deleted_at', null)
      .order('completed_at', { ascending: false })

    const rows = (inspections ?? []) as unknown as Array<{
      id: string
      status: string
      score: number | null
      completed_at: string | null
      started_at: string | null
      fm_properties: Property
      fm_templates: { name: string } | null
      inspector: { full_name: string } | null
      fm_checklist_item_responses: ChecklistItem[]
    }>

    // Group by property
    const byProperty = new Map<string, { property: Property; inspections: typeof rows }>()
    for (const insp of rows) {
      const pid = insp.fm_properties.id
      if (!byProperty.has(pid)) {
        byProperty.set(pid, { property: insp.fm_properties, inspections: [] })
      }
      byProperty.get(pid)!.inspections.push(insp)
    }

    const totalInspections = rows.length

    // Recalculate each inspection's score from its items (canonical methodology)
    const inspectionScores = rows.map(r => computeScore(r.fm_checklist_item_responses))

    const scoredValues = inspectionScores.filter((s): s is number => s !== null)
    const avgScore = scoredValues.length > 0
      ? Math.round(scoredValues.reduce((s, v) => s + v, 0) / scoredValues.length * 10) / 10
      : null
    const passing = scoredValues.filter(s => s >= 80).length
    const passRate = totalInspections > 0 ? Math.round((passing / totalInspections) * 100) : null

    // All deficiencies across portfolio
    const allDeficiencies = rows.flatMap((insp) =>
      (insp.fm_checklist_item_responses ?? [])
        .filter((item) => item.rating !== null && item.rating <= 2)
        .map((item) => ({ ...item, property: insp.fm_properties, inspectionId: insp.id, completedAt: insp.completed_at }))
    )

    return (
      <div style={{ fontFamily: 'Georgia, serif', color: '#1e293b', maxWidth: 900, margin: '0 auto', padding: '2rem' }}>
        <style>{`
          @page { size: A4; margin: 18mm 15mm; }
          @media print {
            .no-print { display: none !important; }
            .page-break { page-break-before: always; }
          }
          body { font-family: Georgia, serif; }
          table { border-collapse: collapse; width: 100%; }
          th, td { padding: 6px 10px; border: 1px solid #e2e8f0; }
          th { background: #f8fafc; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
          td { font-size: 0.82rem; }
        `}</style>

        {/* Print button */}
        <div className="no-print" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          <PrintButton />
        </div>

        {/* Cover */}
        <div style={{ borderBottom: '3px solid #0D1B2E', paddingBottom: '1.5rem', marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>
                {orgName} — Facilities Management
              </p>
              <h1 style={{ margin: '0.4rem 0 0', fontSize: '1.6rem', fontWeight: 800, color: '#0D1B2E', lineHeight: 1.2 }}>
                Portfolio Compliance Report
              </h1>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                Generated {fmtDate(report.created_at)} &nbsp;·&nbsp; {totalInspections} completed inspection{totalInspections !== 1 ? 's' : ''} across {byProperty.size} propert{byProperty.size !== 1 ? 'ies' : 'y'}
              </p>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.75rem' }}>
          {[
            { label: 'Properties', value: byProperty.size },
            { label: 'Inspections', value: totalInspections },
            { label: 'Avg Score', value: avgScore !== null ? `${avgScore}%` : '—', color: scoreColor(avgScore) },
            { label: 'Pass Rate (≥80%)', value: passRate !== null ? `${passRate}%` : '—', color: scoreColor(passRate) },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.875rem 1rem', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8' }}>{label}</p>
              <p style={{ margin: '0.3rem 0 0', fontSize: '1.6rem', fontWeight: 800, color: color ?? '#0D1B2E', lineHeight: 1 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Per-property summary table */}
        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0D1B2E', margin: '0 0 0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Property Summary
        </h2>
        <table style={{ marginBottom: '2rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Property</th>
              <th style={{ textAlign: 'center' }}>Inspections</th>
              <th style={{ textAlign: 'center' }}>Avg Score</th>
              <th style={{ textAlign: 'center' }}>Pass Rate</th>
              <th style={{ textAlign: 'center' }}>Deficiencies</th>
              <th style={{ textAlign: 'left' }}>Last Inspection</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(byProperty.values()).map(({ property, inspections: insps }) => {
              const propScores = insps.map(i => computeScore(i.fm_checklist_item_responses))
              const propScored = propScores.filter((s): s is number => s !== null)
              const propAvg = propScored.length > 0
                ? Math.round(propScored.reduce((s, v) => s + v, 0) / propScored.length * 10) / 10
                : null
              const propPass = propScored.filter(s => s >= 80).length
              const propPassRate = insps.length > 0 ? Math.round((propPass / insps.length) * 100) : null
              const defCount = insps.flatMap((i) =>
                (i.fm_checklist_item_responses ?? []).filter((r) => r.rating !== null && r.rating <= 2)
              ).length
              const lastDate = insps.reduce<string | null>(
                (latest, i) => (!latest || (i.completed_at ?? '') > latest ? i.completed_at : latest),
                null
              )
              return (
                <tr key={property.id}>
                  <td style={{ fontWeight: 600 }}>
                    {property.name}
                    {property.code && <span style={{ marginLeft: 6, fontSize: '0.72rem', color: '#94a3b8', fontWeight: 400 }}>{property.code}</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>{insps.length}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: scoreColor(propAvg) }}>
                    {propAvg !== null ? `${propAvg}%` : '—'}
                  </td>
                  <td style={{ textAlign: 'center', color: scoreColor(propPassRate) }}>
                    {propPassRate !== null ? `${propPassRate}%` : '—'}
                  </td>
                  <td style={{ textAlign: 'center', color: defCount > 0 ? '#ef4444' : '#10b981', fontWeight: defCount > 0 ? 700 : 400 }}>
                    {defCount}
                  </td>
                  <td style={{ color: '#64748b' }}>{fmtDate(lastDate)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Deficiencies across portfolio — grouped by property */}
        {allDeficiencies.length > 0 && (
          <>
            <div className="page-break" />
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0D1B2E', margin: '0 0 0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Open Deficiencies ({allDeficiencies.length})
            </h2>
            {Array.from(
              allDeficiencies.reduce((map, def) => {
                const pid = def.property.id
                if (!map.has(pid)) map.set(pid, { property: def.property, items: [] })
                map.get(pid)!.items.push(def)
                return map
              }, new Map<string, { property: Property; items: typeof allDeficiencies }>())
              .values()
            ).map(({ property, items }) => (
              <div key={property.id} style={{ marginBottom: '1.75rem' }}>
                {/* Property header */}
                <div style={{ background: '#f1f5f9', padding: '0.4rem 0.75rem', borderRadius: '6px 6px 0 0', borderBottom: '2px solid #0D1B2E', marginBottom: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0D1B2E' }}>{property.name}</span>
                  {property.code && <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: '#64748b' }}>{property.code}</span>}
                  <span style={{ marginLeft: '0.75rem', fontSize: '0.72rem', color: '#64748b' }}>{items.length} deficienc{items.length !== 1 ? 'ies' : 'y'}</span>
                </div>
                <table style={{ marginBottom: 0, fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Component</th>
                      <th style={{ textAlign: 'center' }}>Rating</th>
                      <th style={{ textAlign: 'left' }}>Notes</th>
                      <th style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>Inspection Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items
                      .sort((a, b) => (a.rating ?? 5) - (b.rating ?? 5))
                      .map((def, idx) => (
                        <tr key={`${def.id}-${idx}`}>
                          <td>{def.label}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', padding: '1px 8px', borderRadius: 12,
                              background: ratingColor(def.rating) + '22',
                              color: ratingColor(def.rating), fontWeight: 700, fontSize: '0.72rem',
                            }}>
                              {def.rating} — {ratingLabel(def.rating)}
                            </span>
                          </td>
                          <td style={{ color: def.notes ? '#1e293b' : '#94a3b8', fontStyle: def.notes ? 'normal' : 'italic' }}>
                            {def.notes ?? 'No notes recorded'}
                          </td>
                          <td style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(def.completedAt)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#94a3b8' }}>
          <span>{orgName} · Facilities Management · Portfolio Compliance Report</span>
          <span>Generated {fmtDate(report.created_at)}</span>
        </div>
      </div>
    )
  }

  // ── Single inspection report ─────────────────────────────────────────────
  if (!report.inspection_id) notFound()

  const { data: insp } = await supabase
    .from('fm_inspections')
    .select(`
      id, status, score, completed_at, started_at,
      fm_properties!inner(id, name, code, address),
      fm_templates:template_id(name),
      inspector:inspector_id(full_name),
      fm_checklist_item_responses(id, key, label, rating, result, notes, severity)
    `)
    .eq('id', report.inspection_id)
    .single()

  if (!insp) notFound()

  const inspection = insp as unknown as {
    id: string
    status: string
    score: number | null
    completed_at: string | null
    started_at: string | null
    fm_properties: Property
    fm_templates: { name: string } | null
    inspector: { full_name: string } | null
    fm_checklist_item_responses: ChecklistItem[]
  }

  const items = inspection.fm_checklist_item_responses ?? []
  const rated = items.filter((i) => i.rating !== null)
  const deficiencies = items.filter((i) => i.rating !== null && i.rating <= 2)
  const passing_items = items.filter((i) => i.rating !== null && i.rating >= 4)
  const inspScore = computeScore(items)

  return (
    <div style={{ fontFamily: 'Georgia, serif', color: '#1e293b', maxWidth: 900, margin: '0 auto', padding: '2rem' }}>
      <style>{`
        @page { size: A4; margin: 18mm 15mm; }
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
        body { font-family: Georgia, serif; }
        table { border-collapse: collapse; width: 100%; }
        th, td { padding: 6px 10px; border: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
        td { font-size: 0.82rem; }
      `}</style>

      {/* Print button */}
      <div className="no-print" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
        <PrintButton />
      </div>

      {/* Header */}
      <div style={{ borderBottom: '3px solid #0D1B2E', paddingBottom: '1.5rem', marginBottom: '1.75rem' }}>
        <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>
          {orgName} — Facilities Management
        </p>
        <h1 style={{ margin: '0.4rem 0 0', fontSize: '1.6rem', fontWeight: 800, color: '#0D1B2E', lineHeight: 1.2 }}>
          Inspection Report
        </h1>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: '#64748b' }}>
          {inspection.fm_templates?.name ?? 'Inspection'} &nbsp;·&nbsp; {inspection.fm_properties.name}
        </p>
      </div>

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1.75rem', fontSize: '0.82rem' }}>
        {[
          ['Property', inspection.fm_properties.name + (inspection.fm_properties.code ? ` (${inspection.fm_properties.code})` : '')],
          ['Address', inspection.fm_properties.address ?? '—'],
          ['Inspector', inspection.inspector?.full_name ?? '—'],
          ['Status', inspection.status],
          ['Started', fmtDate(inspection.started_at)],
          ['Completed', fmtDate(inspection.completed_at)],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: '#94a3b8', fontWeight: 600, minWidth: 90 }}>{label}:</span>
            <span style={{ color: '#1e293b' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Score KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.75rem' }}>
        {[
          { label: 'Overall Score', value: inspScore !== null ? `${inspScore}%` : '—', color: scoreColor(inspScore) },
          { label: 'Items Assessed', value: rated.length },
          { label: 'Deficiencies', value: deficiencies.length, color: deficiencies.length > 0 ? '#ef4444' : '#10b981' },
          { label: 'Good / Excellent', value: passing_items.length, color: '#10b981' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.875rem 1rem', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8' }}>{label}</p>
            <p style={{ margin: '0.3rem 0 0', fontSize: '1.5rem', fontWeight: 800, color: color ?? '#0D1B2E', lineHeight: 1 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Deficiencies */}
      {deficiencies.length > 0 && (
        <>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0D1B2E', margin: '0 0 0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Deficiencies ({deficiencies.length})
          </h2>
          <table style={{ marginBottom: '1.75rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Component</th>
                <th style={{ textAlign: 'center' }}>Rating</th>
                <th style={{ textAlign: 'left' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {deficiencies
                .sort((a, b) => (a.rating ?? 5) - (b.rating ?? 5))
                .map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>{item.label}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '1px 8px', borderRadius: 12,
                        background: ratingColor(item.rating) + '22',
                        color: ratingColor(item.rating), fontWeight: 700, fontSize: '0.72rem',
                      }}>
                        {item.rating} — {ratingLabel(item.rating)}
                      </span>
                    </td>
                    <td style={{ color: '#475569' }}>{item.notes ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}

      {/* Full checklist */}
      {rated.length > 0 && (
        <>
          <div className="page-break" />
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0D1B2E', margin: '0 0 0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Full Checklist ({rated.length} items)
          </h2>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Component</th>
                <th style={{ textAlign: 'center' }}>Rating</th>
                <th style={{ textAlign: 'left' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rated
                .sort((a, b) => (a.rating ?? 5) - (b.rating ?? 5))
                .map((item) => (
                  <tr key={item.id}>
                    <td>{item.label}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '1px 8px', borderRadius: 12,
                        background: ratingColor(item.rating) + '15',
                        color: ratingColor(item.rating), fontWeight: 600, fontSize: '0.72rem',
                      }}>
                        {item.rating} — {ratingLabel(item.rating)}
                      </span>
                    </td>
                    <td style={{ color: '#475569' }}>{item.notes ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem', marginTop: '2rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#94a3b8' }}>
        <span>{orgName} · {inspection.fm_properties.name} · Inspection Report</span>
        <span>Generated {fmtDate(report.created_at)}</span>
      </div>
    </div>
  )
}
