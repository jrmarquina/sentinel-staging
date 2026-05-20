import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'
import { redirect } from 'next/navigation'
import PrintButton from './PrintButton'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvidencePhoto {
  id:       string
  url:      string
  file_key: string
  name?:    string
}

interface LocationPin {
  floor_plan_id:  string
  floor_plan_url: string
  x: number
  y: number
}

interface TemplateField {
  id:       string
  label:    string
  type:     string
  show_if?: { field: string; answer: string }
}

interface ItemResponse {
  id:            string
  key:           string
  label:         string
  result:        string | null
  severity:      string | null
  notes:         string | null
  rating:        number | null
  evidence:      EvidencePhoto[] | null
  location_data: LocationPin | null
}

interface FmInspection {
  id:                  string
  status:              string
  created_at:          string
  updated_at:          string
  completed_at?:       string | null
  property_id:         string
  fm_properties: {
    name:               string
    address?:           string | null
    year_built?:        number | null
    gross_area_sqft?:   number | null
    num_stories?:       number | null
    construction_type?: string | null
    occupancy_type?:    string | null
  } | null
  inspector?: { full_name?: string } | null
  template:  { json_schema: { fields: TemplateField[] } } | null
  fm_inspection_items: ItemResponse[]
}

// ── Section definitions (mirrors main FCA page) ───────────────────────────────

const SECTION_DEFS = [
  { id: '0', prefix: 'fp', label: 'Facility Profile',             isProfile: true  },
  { id: 'A', prefix: 'gi', label: 'General Building Information', isProfile: false },
  { id: 'B', prefix: 'si', label: 'Site & Grounds',               isProfile: false },
  { id: 'C', prefix: 'be', label: 'Building Envelope',            isProfile: false },
  { id: 'D', prefix: 'st', label: 'Structural Systems',           isProfile: false },
  { id: 'E', prefix: 'hv', label: 'Mechanical — HVAC',            isProfile: false },
  { id: 'F', prefix: 'pl', label: 'Plumbing',                     isProfile: false },
  { id: 'G', prefix: 'el', label: 'Electrical',                   isProfile: false },
  { id: 'H', prefix: 'ls', label: 'Life Safety Systems',          isProfile: false },
  { id: 'I', prefix: 'in', label: 'Interior Finishes',            isProfile: false },
  { id: 'J', prefix: 'ad', label: 'ADA / Accessibility',          isProfile: false },
  { id: 'K', prefix: 'sp', label: 'Special Spaces',               isProfile: false },
  { id: 'L', prefix: 'oa', label: 'Overall Assessment',           isProfile: false },
]

const RATING_CFG = [
  { v: 1, label: 'Critical',  bg: '#fef2f2', border: '#fca5a5', fg: '#991b1b' },
  { v: 2, label: 'Poor',      bg: '#fff7ed', border: '#fdba74', fg: '#9a3412' },
  { v: 3, label: 'Fair',      bg: '#fefce8', border: '#fde047', fg: '#854d0e' },
  { v: 4, label: 'Good',      bg: '#f0fdf4', border: '#86efac', fg: '#166534' },
  { v: 5, label: 'Excellent', bg: '#dcfce7', border: '#4ade80', fg: '#14532d' },
]

const URGENCY_CFG: Record<string, { label: string; color: string }> = {
  LOW:    { label: 'Low',    color: '#166534' },
  MEDIUM: { label: 'Medium', color: '#854d0e' },
  HIGH:   { label: 'High',   color: '#991b1b' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ratingCfg(r: number) {
  return RATING_CFG.find(c => c.v === r) ?? RATING_CFG[2]
}

function scoreColor(score: number): string {
  if (score >= 4) return '#166534'
  if (score >= 3) return '#854d0e'
  if (score >= 2) return '#ea580c'
  return '#dc2626'
}

function scoreBg(score: number): string {
  if (score >= 4) return '#dcfce7'
  if (score >= 3) return '#fefce8'
  if (score >= 2) return '#fff7ed'
  return '#fef2f2'
}

function compRole(id: string): 'c' | 'd' | 'u' | 'e' | null {
  if (id.endsWith('c')) return 'c'
  if (id.endsWith('d')) return 'd'
  if (id.endsWith('u')) return 'u'
  if (id.endsWith('e')) return 'e'
  return null
}

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ── Report page (Server Component) ────────────────────────────────────────────

export default async function FcaReportPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const supabase = createClient()
  const { data: insp, error } = await supabase
    .from('fm_inspections')
    .select(`
      *,
      fm_properties(*),
      inspector:inspector_id(full_name),
      template:template_id(*),
      fm_inspection_items:fm_checklist_item_responses(*)
    `)
    .eq('id', params.id)
    .eq('org_id', session.orgId)
    .single() as { data: FmInspection | null; error: unknown }

  if (error || !insp) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif', color: '#dc2626' }}>
        FCA not found or access denied.
      </div>
    )
  }

  const fields   = insp.template?.json_schema?.fields ?? []
  const itemMap  = new Map(insp.fm_inspection_items.map(i => [i.key, i]))

  // Build sections + components
  type CompData = { compKey: string; cField: TemplateField; dField?: TemplateField; uField?: TemplateField; eField?: TemplateField }
  type SecData  = { id: string; prefix: string; label: string; isProfile: boolean; infoFields: TemplateField[]; components: CompData[] }

  const sections: SecData[] = SECTION_DEFS.map(def => {
    const sectionFields = fields.filter(f => f.id.startsWith(def.prefix + '_'))
    const infoFields: TemplateField[] = []
    const compMap = new Map<string, Record<string, TemplateField>>()

    for (const f of sectionFields) {
      const role = compRole(f.id)
      if (role) {
        const ck = f.id.slice(0, -1)
        if (!compMap.has(ck)) compMap.set(ck, {})
        compMap.get(ck)![role] = f
      } else {
        infoFields.push(f)
      }
    }

    const components: CompData[] = []
    for (const [ck, roles] of compMap) {
      if (!roles['c']) continue
      components.push({ compKey: ck, cField: roles['c'], dField: roles['d'], uField: roles['u'], eField: roles['e'] })
    }
    components.sort((a, b) => a.compKey.localeCompare(b.compKey))
    return { ...def, infoFields, components }
  })

  // Calculate section scores
  function calcScore(sec: SecData): { score: number; answered: number; total: number } | null {
    const rated = sec.components.filter(c => itemMap.get(c.cField.id)?.rating != null)
    if (rated.length === 0) return null
    const sum = rated.reduce((acc, c) => acc + (itemMap.get(c.cField.id)?.rating ?? 0), 0)
    return { score: Math.round((sum / rated.length) * 10) / 10, answered: rated.length, total: sec.components.length }
  }

  // All deficiencies (rating 1 or 2)
  const deficiencies = sections
    .filter(s => !s.isProfile)
    .flatMap(s => s.components
      .map(c => ({ section: s.label, field: c.cField, item: itemMap.get(c.cField.id) }))
      .filter(({ item }) => item?.rating != null && item.rating <= 2)
    )

  // Overall FCI score (average of all rated components)
  const allRated = sections
    .filter(s => !s.isProfile)
    .flatMap(s => s.components)
    .map(c => itemMap.get(c.cField.id)?.rating)
    .filter((r): r is number => r != null)

  const overallScore = allRated.length > 0
    ? Math.round((allRated.reduce((a, b) => a + b, 0) / allRated.length) * 10) / 10
    : null

  const prop    = insp.fm_properties
  const dateStr = fmt(insp.completed_at ?? insp.updated_at)

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh' }}>

      {/* Print toolbar — hidden when printing */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#0f172a', color: '#fff',
        padding: '0.75rem 1.5rem',
        display: 'flex', alignItems: 'center', gap: '1rem',
      }}>
        <a
          href={`/dashboard/fm/fca/${params.id}`}
          style={{ color: '#94a3b8', fontSize: '0.85rem', textDecoration: 'none' }}
        >
          ← Back to FCA
        </a>
        <span style={{ flex: 1 }} />
        <PrintButton />
      </div>

      {/* Report */}
      <div style={{
        maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        color: '#1e293b',
      }}>

        {/* ── Cover ── */}
        <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '2px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
                Sentinel Management Group
              </div>
              <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                Facility Condition Assessment
              </h1>
              <div style={{ marginTop: '0.4rem', fontSize: '1.1rem', color: '#475569' }}>
                {prop?.name ?? 'Unknown Property'}
              </div>
              {prop?.address && (
                <div style={{ marginTop: '0.2rem', fontSize: '0.875rem', color: '#64748b' }}>
                  {prop.address}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.875rem', color: '#475569' }}>
              <div style={{ marginBottom: '0.25rem' }}>
                <strong>Date:</strong> {dateStr}
              </div>
              <div style={{ marginBottom: '0.25rem' }}>
                <strong>Inspector:</strong> {(insp.inspector as { full_name?: string } | null)?.full_name ?? '—'}
              </div>
              <div>
                <strong>Status:</strong>&nbsp;
                <span style={{
                  display: 'inline-block', padding: '0.1rem 0.5rem',
                  borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
                  background: insp.status === 'COMPLETED' ? '#dcfce7' : '#fefce8',
                  color: insp.status === 'COMPLETED' ? '#166534' : '#854d0e',
                }}>
                  {insp.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Property summary row ── */}
        {prop && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.75rem', marginBottom: '2rem',
          }}>
            {[
              { label: 'Year Built',       value: prop.year_built?.toString() },
              { label: 'Gross Area (sqft)', value: prop.gross_area_sqft ? prop.gross_area_sqft.toLocaleString() : undefined },
              { label: 'Stories',          value: prop.num_stories?.toString() },
              { label: 'Construction',     value: prop.construction_type },
              { label: 'Occupancy Type',   value: prop.occupancy_type },
            ].map(({ label, value }) => value ? (
              <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', marginTop: '0.25rem' }}>{value}</div>
              </div>
            ) : null)}
          </div>
        )}

        {/* ── Overall score ── */}
        {overallScore !== null && (
          <div style={{
            background: scoreBg(overallScore), border: `2px solid`,
            borderColor: scoreColor(overallScore),
            borderRadius: 12, padding: '1.25rem 1.5rem',
            display: 'flex', alignItems: 'center', gap: '1.5rem',
            marginBottom: '2rem',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.75rem', fontWeight: 800, color: scoreColor(overallScore), lineHeight: 1 }}>
                {overallScore.toFixed(1)}
              </div>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: scoreColor(overallScore), textTransform: 'uppercase' }}>
                / 5.0
              </div>
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Overall Facility Condition Index</div>
              <div style={{ fontSize: '0.875rem', color: '#475569', marginTop: '0.2rem' }}>
                Based on {allRated.length} rated component{allRated.length !== 1 ? 's' : ''} across {sections.filter(s => !s.isProfile).length} sections
              </div>
              {deficiencies.length > 0 && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.875rem', fontWeight: 600, color: '#991b1b' }}>
                  {deficiencies.length} deficien{deficiencies.length !== 1 ? 'cies' : 'cy'} require attention (rated Critical or Poor)
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Section scores grid ── */}
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>Section Scores</h2>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '0.75rem', marginBottom: '2.5rem',
        }}>
          {sections.filter(s => !s.isProfile).map(sec => {
            const s = calcScore(sec)
            return (
              <div key={sec.id} style={{
                background: s ? scoreBg(s.score) : '#f8fafc',
                border: '1px solid', borderColor: s ? scoreColor(s.score) : '#e2e8f0',
                borderRadius: 8, padding: '0.75rem 1rem',
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Section {sec.id}
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b', margin: '0.25rem 0' }}>
                  {sec.label}
                </div>
                {s ? (
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: scoreColor(s.score) }}>
                    {s.score.toFixed(1)}
                    <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#64748b', marginLeft: 4 }}>
                      ({s.answered}/{s.total} rated)
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Not assessed</div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Deficiencies summary ── */}
        {deficiencies.length > 0 && (
          <>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#991b1b', marginBottom: '1rem' }}>
              Deficiencies Requiring Attention ({deficiencies.length})
            </h2>
            <div style={{ marginBottom: '2.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#fef2f2' }}>
                    <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', borderBottom: '2px solid #fca5a5', color: '#991b1b', fontWeight: 600 }}>Section</th>
                    <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', borderBottom: '2px solid #fca5a5', color: '#991b1b', fontWeight: 600 }}>Component</th>
                    <th style={{ textAlign: 'center', padding: '0.6rem 0.75rem', borderBottom: '2px solid #fca5a5', color: '#991b1b', fontWeight: 600 }}>Rating</th>
                    <th style={{ textAlign: 'center', padding: '0.6rem 0.75rem', borderBottom: '2px solid #fca5a5', color: '#991b1b', fontWeight: 600 }}>Urgency</th>
                    <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', borderBottom: '2px solid #fca5a5', color: '#991b1b', fontWeight: 600 }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {deficiencies.map(({ section, field, item }, idx) => {
                    const rc = item?.rating ? ratingCfg(item.rating) : null
                    const uc = item?.severity ? URGENCY_CFG[item.severity] : null
                    return (
                      <tr key={field.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #f1f5f9', color: '#475569', fontSize: '0.8rem' }}>{section}</td>
                        <td style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #f1f5f9', fontWeight: 500 }}>{field.label}</td>
                        <td style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                          {rc && (
                            <span style={{
                              display: 'inline-block', padding: '0.15rem 0.5rem',
                              background: rc.bg, border: `1px solid ${rc.border}`,
                              borderRadius: 4, color: rc.fg, fontWeight: 700, fontSize: '0.8rem',
                            }}>
                              {item?.rating} — {rc.label}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                          {uc && (
                            <span style={{ fontWeight: 600, color: uc.color, fontSize: '0.8rem' }}>{uc.label}</span>
                          )}
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #f1f5f9', color: '#475569', fontSize: '0.8rem' }}>
                          {item?.notes ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Section-by-section detail ── */}
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.5rem' }}>Full Assessment Detail</h2>

        {sections.filter(s => !s.isProfile && s.components.length > 0).map(sec => {
          const score = calcScore(sec)
          const ratedComps = sec.components.filter(c => itemMap.get(c.cField.id)?.rating != null)
          if (ratedComps.length === 0) return null

          return (
            <div key={sec.id} style={{ marginBottom: '2.5rem', pageBreakInside: 'avoid' }}>
              {/* Section header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#0f172a', color: '#fff',
                borderRadius: '8px 8px 0 0', padding: '0.7rem 1rem',
              }}>
                <div style={{ fontWeight: 700 }}>Section {sec.id} — {sec.label}</div>
                {score && (
                  <div style={{
                    background: scoreBg(score.score), color: scoreColor(score.score),
                    borderRadius: 6, padding: '0.15rem 0.6rem',
                    fontWeight: 800, fontSize: '0.9rem',
                  }}>
                    {score.score.toFixed(1)} / 5.0
                  </div>
                )}
              </div>

              {/* Component rows */}
              <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                {sec.components.map((comp, ci) => {
                  const item   = itemMap.get(comp.cField.id)
                  if (!item?.rating && !item?.notes) return null
                  const rc     = item?.rating ? ratingCfg(item.rating) : null
                  const dItem  = comp.dField ? itemMap.get(comp.dField.id) : null
                  const uItem  = comp.uField ? itemMap.get(comp.uField.id) : null
                  const photos = Array.isArray(item?.evidence) ? item.evidence : []

                  return (
                    <div key={comp.compKey} style={{
                      padding: '1rem',
                      borderBottom: ci < sec.components.length - 1 ? '1px solid #f1f5f9' : 'none',
                      background: ci % 2 === 0 ? '#fff' : '#fafafa',
                    }}>
                      {/* Component header row */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>
                            {comp.cField.label}
                          </div>
                          {dItem?.notes && (
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                              <strong>Description:</strong> {dItem.notes}
                            </div>
                          )}
                          {item?.notes && (
                            <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '0.35rem' }}>
                              {item.notes}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem', flexShrink: 0 }}>
                          {rc && (
                            <span style={{
                              display: 'inline-block', padding: '0.2rem 0.65rem',
                              background: rc.bg, border: `1px solid ${rc.border}`,
                              borderRadius: 5, color: rc.fg, fontWeight: 700, fontSize: '0.8rem',
                              whiteSpace: 'nowrap',
                            }}>
                              {item?.rating} — {rc.label}
                            </span>
                          )}
                          {uItem?.severity && URGENCY_CFG[uItem.severity] && (
                            <span style={{
                              fontSize: '0.75rem', fontWeight: 600,
                              color: URGENCY_CFG[uItem.severity].color,
                            }}>
                              {URGENCY_CFG[uItem.severity].label} urgency
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Photos */}
                      {photos.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                          {photos.map(photo => (
                            <img
                              key={photo.id}
                              src={photo.url}
                              alt={photo.name ?? 'Evidence photo'}
                              style={{
                                width: 100, height: 100, objectFit: 'cover',
                                borderRadius: 6, border: '1px solid #e2e8f0',
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Location pin indicator */}
                      {item?.location_data && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                          📍 Location pinned on floor plan
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8' }}>
          Sentinel Management Group — Facility Condition Assessment Report — Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; margin: 0 !important; }
          @page { margin: 1.5cm 1.5cm; size: A4; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          h2 { page-break-after: avoid; }
          table { page-break-inside: avoid; }
          img { page-break-inside: avoid; max-width: 100% !important; }
        }
      `}</style>
    </div>
  )
}
