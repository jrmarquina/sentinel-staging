'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, AlertTriangle, ArrowLeft, Save, CheckCircle2,
  ChevronLeft, ClipboardCheck, Zap,
} from 'lucide-react'
import { FmButton } from '@/components/fm'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TemplateField {
  id:       string
  label:    string
  type:     string
  show_if?: { field: string; answer: string }
}

interface ItemResponse {
  id:       string
  key:      string
  label:    string
  result:   string | null
  severity: string | null
  notes:    string | null
  rating:   number | null
}

interface PropertyData {
  name:              string
  address?:          string | null
  year_built?:       number | null
  gross_area_sqft?:  number | null
  num_stories?:      number | null
  construction_type?: string | null
  occupancy_type?:   string | null
}

interface FmInspection {
  id:                   string
  status:               string
  fm_properties:        PropertyData | null
  template:             { json_schema: { fields: TemplateField[] } } | null
  fm_inspection_items:  ItemResponse[]
}

interface ResponseDraft {
  result:   string | null
  severity: string | null
  notes:    string | null
  rating:   number | null
}

interface FcaComponent {
  compKey: string
  cField:  TemplateField
  dField?: TemplateField
  uField?: TemplateField
  eField?: TemplateField
}

interface FcaSection {
  id:         string
  prefix:     string
  label:      string
  isProfile:  boolean
  infoFields: TemplateField[]
  components: FcaComponent[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTION_DEFS = [
  { id: '0', prefix: 'fp', label: 'Facility Profile',            isProfile: true  },
  { id: 'A', prefix: 'gi', label: 'General Building Information', isProfile: false },
  { id: 'B', prefix: 'si', label: 'Site & Grounds',              isProfile: false },
  { id: 'C', prefix: 'be', label: 'Building Envelope',           isProfile: false },
  { id: 'D', prefix: 'st', label: 'Structural Systems',          isProfile: false },
  { id: 'E', prefix: 'hv', label: 'Mechanical — HVAC',           isProfile: false },
  { id: 'F', prefix: 'pl', label: 'Plumbing',                    isProfile: false },
  { id: 'G', prefix: 'el', label: 'Electrical',                  isProfile: false },
  { id: 'H', prefix: 'ls', label: 'Life Safety Systems',         isProfile: false },
  { id: 'I', prefix: 'in', label: 'Interior Finishes',           isProfile: false },
  { id: 'J', prefix: 'ad', label: 'ADA / Accessibility',         isProfile: false },
  { id: 'K', prefix: 'sp', label: 'Special Spaces',              isProfile: false },
  { id: 'L', prefix: 'oa', label: 'Overall Assessment',          isProfile: false },
]

const RATING_CFG = [
  { v: 1, label: 'Critical',  bg: '#fef2f2', border: '#fca5a5', fg: '#991b1b' },
  { v: 2, label: 'Poor',      bg: '#fff7ed', border: '#fdba74', fg: '#9a3412' },
  { v: 3, label: 'Fair',      bg: '#fefce8', border: '#fde047', fg: '#854d0e' },
  { v: 4, label: 'Good',      bg: '#f0fdf4', border: '#86efac', fg: '#166534' },
  { v: 5, label: 'Excellent', bg: '#dcfce7', border: '#4ade80', fg: '#14532d' },
]

const URGENCY_OPTIONS = [
  { value: 'LOW',    label: 'Low',    sublabel: 'Can wait',         bg: '#dcfce7', border: '#86efac', color: '#166534' },
  { value: 'MEDIUM', label: 'Medium', sublabel: 'Schedule soon',    bg: '#fefce8', border: '#fde047', color: '#854d0e' },
  { value: 'HIGH',   label: 'High',   sublabel: 'Immediate action', bg: '#fef2f2', border: '#fca5a5', color: '#991b1b' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function compRole(fieldId: string): 'c' | 'd' | 'u' | 'e' | null {
  const last = fieldId[fieldId.length - 1]
  if (
    (last === 'c' || last === 'd' || last === 'u' || last === 'e') &&
    /^[a-z]+_\d{2}[cdue]$/.test(fieldId)
  ) return last as 'c' | 'd' | 'u' | 'e'
  return null
}

function buildSections(fields: TemplateField[]): FcaSection[] {
  return SECTION_DEFS.map(def => {
    const sectionFields = fields.filter(f => f.id.startsWith(def.prefix + '_'))
    const infoFields: TemplateField[] = []
    const compMap = new Map<string, Partial<Record<'c' | 'd' | 'u' | 'e', TemplateField>>>()

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

    const components: FcaComponent[] = []
    for (const [ck, roles] of compMap) {
      if (!roles.c) continue
      components.push({ compKey: ck, cField: roles.c, dField: roles.d, uField: roles.u, eField: roles.e })
    }
    components.sort((a, b) => a.compKey.localeCompare(b.compKey))

    return { ...def, infoFields, components }
  })
}

function isVisible(field: TemplateField, responses: Record<string, ResponseDraft>): boolean {
  if (!field.show_if) return true
  const parentResult = responses[field.show_if.field]?.result
  return parentResult?.toUpperCase() === field.show_if.answer
}

function scoreColor(score: number): string {
  if (score >= 4) return '#16a34a'
  if (score >= 3) return '#ca8a04'
  if (score >= 2) return '#ea580c'
  return '#dc2626'
}

function scoreBg(score: number): string {
  if (score >= 4) return '#dcfce7'
  if (score >= 3) return '#fefce8'
  if (score >= 2) return '#fff7ed'
  return '#fef2f2'
}

function calcSectionScore(
  section: FcaSection,
  responses: Record<string, ResponseDraft>
): { score: number; answered: number; visible: number } | null {
  const visible  = section.components.filter(c => isVisible(c.cField, responses))
  const rated    = visible.filter(c => responses[c.cField.id]?.rating != null)
  if (rated.length === 0) return null
  const sum = rated.reduce((acc, c) => acc + (responses[c.cField.id]?.rating ?? 0), 0)
  return { score: Math.round((sum / rated.length) * 10) / 10, answered: rated.length, visible: visible.length }
}

function buildPropertyPrefill(
  prop: PropertyData | null,
  existing: Record<string, ResponseDraft>
): Record<string, string> {
  if (!prop) return {}
  const map: Record<string, string> = {
    gi_01: [prop.name, prop.address].filter(Boolean).join(' — '),
    gi_02: prop.year_built?.toString() ?? '',
    gi_03: prop.occupancy_type ?? '',
    gi_04: prop.gross_area_sqft?.toString() ?? '',
    gi_05: prop.num_stories?.toString() ?? '',
    gi_06: prop.construction_type ?? '',
  }
  const prefill: Record<string, string> = {}
  for (const [key, val] of Object.entries(map)) {
    if (val && !existing[key]?.notes?.trim()) prefill[key] = val
  }
  return prefill
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FCAFillPage({ params }: { params: { id: string } }) {
  const router = useRouter()

  const [insp, setInsp]                       = useState<FmInspection | null>(null)
  const [sections, setSections]               = useState<FcaSection[]>([])
  const [responses, setResponses]             = useState<Record<string, ResponseDraft>>({})
  const [activeSection, setActiveSection]     = useState('0')
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [saveState, setSaveState]             = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [sidebarOpen, setSidebarOpen]         = useState(true)
  const [generating, setGenerating]           = useState(false)

  const dirtyRef     = useRef<Set<string>>(new Set())
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const responsesRef = useRef(responses)
  responsesRef.current = responses

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/fm/inspections/${params.id}`)
        if (!res.ok) throw new Error('Not found')
        const data = await res.json() as FmInspection

        const fields = data.template?.json_schema?.fields ?? []
        setSections(buildSections(fields))

        const init: Record<string, ResponseDraft> = {}
        for (const item of data.fm_inspection_items ?? []) {
          init[item.key] = { result: item.result, severity: item.severity, notes: item.notes, rating: item.rating }
        }
        for (const f of fields) {
          if (!init[f.id]) init[f.id] = { result: null, severity: null, notes: null, rating: null }
        }

        // Pre-fill Section A from property profile
        const prefill = buildPropertyPrefill(data.fm_properties, init)
        for (const [key, val] of Object.entries(prefill)) {
          init[key] = { ...init[key], notes: val }
          dirtyRef.current.add(key)
        }

        setResponses(init)
        setInsp(data)
      } catch {
        setError('Failed to load assessment')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [params.id])

  // ── Auto-save ─────────────────────────────────────────────────────────────

  const flush = useCallback(async () => {
    if (dirtyRef.current.size === 0) return
    const keys = Array.from(dirtyRef.current)
    dirtyRef.current.clear()
    setSaveState('saving')
    const items = keys.map(key => {
      const r = responsesRef.current[key]
      return { key, result: r?.result ?? null, severity: r?.severity ?? null, notes: r?.notes ?? null, rating: r?.rating ?? null }
    })
    try {
      const res = await fetch(`/api/fm/inspections/${params.id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      setSaveState(res.ok ? 'saved' : 'error')
      setTimeout(() => setSaveState('idle'), 2500)
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }, [params.id])

  function markDirty(key: string) {
    dirtyRef.current.add(key)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, 1500)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  // ── Updaters ──────────────────────────────────────────────────────────────

  function setResult(fieldId: string, result: string | null) {
    setResponses(prev => ({ ...prev, [fieldId]: { ...prev[fieldId], result } }))
    markDirty(fieldId)
  }

  function setRating(fieldId: string, rating: number | null) {
    setResponses(prev => ({ ...prev, [fieldId]: { ...prev[fieldId], rating } }))
    markDirty(fieldId)
  }

  function setSeverityField(fieldId: string, severity: string | null) {
    setResponses(prev => ({ ...prev, [fieldId]: { ...prev[fieldId], severity } }))
    markDirty(fieldId)
  }

  function setNotes(fieldId: string, notes: string) {
    setResponses(prev => ({ ...prev, [fieldId]: { ...prev[fieldId], notes: notes || null } }))
    markDirty(fieldId)
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function goNextSection() {
    const idx = SECTION_DEFS.findIndex(s => s.id === activeSection)
    if (idx < SECTION_DEFS.length - 1) setActiveSection(SECTION_DEFS[idx + 1].id)
  }

  function goPrevSection() {
    const idx = SECTION_DEFS.findIndex(s => s.id === activeSection)
    if (idx > 0) setActiveSection(SECTION_DEFS[idx - 1].id)
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function complete() {
    await flush()
    const res = await fetch(`/api/fm/inspections/${params.id}/complete`, { method: 'POST' })
    if (res.ok) router.push('/dashboard/fm/fca')
    else setSaveState('error')
  }

  async function generateInspection() {
    await flush()
    setGenerating(true)
    try {
      const res = await fetch(`/api/fm/fca/${params.id}/generate-inspection`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        alert(body.error ?? 'Failed to generate inspection')
        return
      }
      const { inspection_id } = await res.json() as { inspection_id: string }
      router.push(`/dashboard/fm/inspections/${inspection_id}/run`)
    } catch {
      alert('Failed to generate inspection')
    } finally {
      setGenerating(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const hasDeficiencies = sections.some(sec =>
    sec.components.some(c => {
      const r = responses[c.cField.id]?.rating ?? null
      return isVisible(c.cField, responses) && r !== null && r <= 2
    })
  )

  // ── Guards ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '0.75rem', color: 'var(--muted)' }}>
        <Loader2 size={24} className="animate-spin" />
        <span>Loading assessment…</span>
      </div>
    )
  }

  if (error || !insp) {
    return (
      <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--red)' }}>
        <AlertTriangle size={20} />
        <span>{error ?? 'Assessment not found'}</span>
      </div>
    )
  }

  const currentSection = sections.find(s => s.id === activeSection)!
  const sectionIdx     = SECTION_DEFS.findIndex(s => s.id === activeSection)
  const isCompleted    = insp.status === 'COMPLETED'

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--card)', minHeight: '100vh' }}>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '0.875rem 1.25rem',
        background: 'var(--card-b)', borderBottom: '1px solid var(--border)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <button
          onClick={() => router.push('/dashboard/fm/fca')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', padding: '0.25rem' }}
        >
          <ArrowLeft size={16} />
          FCAs
        </button>

        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
          <ClipboardCheck size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, color: 'var(--fg)', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            FCA — {insp.fm_properties?.name ?? 'Unknown Property'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          <span style={{
            fontSize: '0.78rem', fontWeight: 500, opacity: saveState === 'idle' ? 0 : 1, transition: 'opacity 0.3s',
            color: saveState === 'saving' ? 'var(--muted)' : saveState === 'saved' ? 'var(--teal)' : saveState === 'error' ? 'var(--red)' : 'var(--muted)',
          }}>
            {saveState === 'saving' ? '↑ Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'error' ? '✕ Save failed' : ''}
          </span>

          <FmButton size="sm" variant="secondary" icon={<Save size={14} />} onClick={flush}>Save</FmButton>

          {hasDeficiencies && !isCompleted && (
            <FmButton
              size="sm" variant="secondary"
              icon={generating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              onClick={generateInspection}
              disabled={generating}
            >
              {generating ? 'Generating…' : 'Generate Inspection'}
            </FmButton>
          )}

          {!isCompleted && (
            <FmButton size="sm" variant="primary" icon={<CheckCircle2 size={14} />} onClick={complete}>
              Complete
            </FmButton>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{
          width: sidebarOpen ? 230 : 64, flexShrink: 0,
          background: 'var(--card-b)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          transition: 'width 0.2s ease',
        }}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{ padding: '0.75rem', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'flex-end' : 'center', color: 'var(--muted)' }}
            aria-label="Toggle sidebar"
          >
            <ChevronLeft size={16} style={{ transform: sidebarOpen ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
          </button>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
            {sections.map(sec => {
              const active  = sec.id === activeSection
              const scoring = calcSectionScore(sec, responses)

              // Section 0: track YES_NO completion
              const fp0total    = sec.isProfile ? sec.infoFields.filter(f => f.type === 'YES_NO').length : 0
              const fp0answered = sec.isProfile ? sec.infoFields.filter(f => f.type === 'YES_NO' && responses[f.id]?.result != null).length : 0
              const profileDone = sec.isProfile && fp0total > 0 && fp0answered === fp0total

              const visibleCount  = sec.components.filter(c => isVisible(c.cField, responses)).length
              const answeredCount = scoring?.answered ?? 0
              const done = !sec.isProfile && visibleCount > 0 && answeredCount === visibleCount

              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  style={{
                    width: '100%', padding: sidebarOpen ? '0.625rem 1rem' : '0.625rem 0',
                    display: 'flex', alignItems: 'center', gap: '0.625rem',
                    background: active ? 'rgba(var(--primary-rgb, 99,102,241), 0.12)' : 'none',
                    border: 'none', borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
                    cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
                    justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  }}
                >
                  <span style={{
                    flexShrink: 0, width: 28, height: 28, borderRadius: 6,
                    background: (done || profileDone) ? 'var(--teal)' : active ? 'var(--primary)' : 'var(--card)',
                    color: (done || profileDone || active) ? '#fff' : 'var(--fg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--border)',
                  }}>
                    {sec.id}
                  </span>

                  {sidebarOpen && (
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: active ? 600 : 400, color: active ? 'var(--fg)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sec.label}
                      </div>
                      {scoring !== null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: scoreColor(scoring.score), background: scoreBg(scoring.score), padding: '0.1rem 0.35rem', borderRadius: 4 }}>
                            {scoring.score.toFixed(1)}
                          </span>
                          <span style={{ fontSize: '0.67rem', color: 'var(--muted)' }}>
                            {scoring.answered}/{scoring.visible}
                          </span>
                        </div>
                      ) : sec.isProfile ? (
                        <div style={{ fontSize: '0.67rem', color: 'var(--muted)', marginTop: '0.15rem' }}>
                          {fp0answered}/{fp0total} answered
                        </div>
                      ) : null}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>

          {/* Section heading */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--primary)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                Section {activeSection}
              </div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)' }}>
                {currentSection.label}
              </h2>
              {(() => {
                const sc = calcSectionScore(currentSection, responses)
                if (!sc) return null
                return (
                  <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Section score:</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: scoreColor(sc.score), background: scoreBg(sc.score), padding: '0.15rem 0.5rem', borderRadius: 6 }}>
                      {sc.score.toFixed(1)} / 5.0
                    </span>
                    <span style={{ fontSize: '0.73rem', color: 'var(--muted)' }}>
                      ({sc.answered} of {sc.visible} rated)
                    </span>
                  </div>
                )
              })()}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={goPrevSection} disabled={sectionIdx === 0} style={{ padding: '0.5rem 0.75rem', background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: sectionIdx === 0 ? 'not-allowed' : 'pointer', fontSize: '0.8rem', opacity: sectionIdx === 0 ? 0.4 : 1 }}>← Prev</button>
              <button onClick={goNextSection} disabled={sectionIdx === SECTION_DEFS.length - 1} style={{ padding: '0.5rem 0.75rem', background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: sectionIdx === SECTION_DEFS.length - 1 ? 'not-allowed' : 'pointer', fontSize: '0.8rem', opacity: sectionIdx === SECTION_DEFS.length - 1 ? 0.4 : 1 }}>Next →</button>
            </div>
          </div>

          {/* Section 0: Facility Profile */}
          {currentSection.isProfile && (
            <FacilityProfileSection
              fields={currentSection.infoFields}
              responses={responses}
              disabled={isCompleted}
              onResult={setResult}
              onNotes={setNotes}
            />
          )}

          {/* Info fields (Section A, HVAC header, Overall Assessment) */}
          {!currentSection.isProfile && currentSection.infoFields.length > 0 && (
            <div style={{ background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem', marginBottom: currentSection.components.length > 0 ? '1.5rem' : 0 }}>
              <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {currentSection.infoFields
                  .filter(f => isVisible(f, responses))
                  .map(field => (
                    <InfoField
                      key={field.id}
                      field={field}
                      value={responses[field.id]?.notes ?? ''}
                      onChange={v => setNotes(field.id, v)}
                      disabled={isCompleted}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* RATING_5 component cards */}
          {!currentSection.isProfile && currentSection.components.length > 0 && (() => {
            const visible = currentSection.components.filter(c => isVisible(c.cField, responses))
            if (visible.length === 0) {
              return (
                <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--card-b)', borderRadius: 10, border: '1px dashed var(--border)' }}>
                  <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 500 }}>No components apply to this facility.</p>
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                    Go to <button onClick={() => setActiveSection('0')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, fontSize: '0.8rem', fontWeight: 600 }}>Section 0 — Facility Profile</button> and answer YES for the applicable features.
                  </p>
                </div>
              )
            }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {visible.map((comp, idx) => (
                  <Rating5Card
                    key={comp.compKey}
                    comp={comp}
                    sectionId={activeSection}
                    index={idx + 1}
                    rating={responses[comp.cField.id]?.rating ?? null}
                    onRating={r => {
                      setRating(comp.cField.id, r)
                      if (r !== null && r > 2) {
                        if (comp.dField) setNotes(comp.dField.id, '')
                        if (comp.uField) setSeverityField(comp.uField.id, null)
                        if (comp.eField) setNotes(comp.eField.id, '')
                      }
                    }}
                    descValue={comp.dField ? (responses[comp.dField.id]?.notes ?? '') : ''}
                    onDescChange={v => comp.dField && setNotes(comp.dField.id, v)}
                    urgency={comp.uField ? (responses[comp.uField.id]?.severity ?? null) : null}
                    onUrgency={v => comp.uField && setSeverityField(comp.uField.id, v)}
                    costValue={comp.eField ? (responses[comp.eField.id]?.notes ?? '') : ''}
                    onCostChange={v => comp.eField && setNotes(comp.eField.id, v)}
                    disabled={isCompleted}
                  />
                ))}
              </div>
            )
          })()}

          {/* Bottom nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
            <button onClick={goPrevSection} disabled={sectionIdx === 0} style={{ padding: '0.75rem 1.25rem', background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: sectionIdx === 0 ? 'not-allowed' : 'pointer', fontSize: '0.875rem', opacity: sectionIdx === 0 ? 0.4 : 1 }}>
              ← Previous section
            </button>
            {sectionIdx < SECTION_DEFS.length - 1 ? (
              <button onClick={goNextSection} style={{ padding: '0.75rem 1.5rem', background: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                Next section →
              </button>
            ) : !isCompleted ? (
              <FmButton variant="primary" icon={<CheckCircle2 size={16} />} onClick={complete}>
                Complete Assessment
              </FmButton>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FacilityProfileSection({
  fields, responses, disabled, onResult, onNotes,
}: {
  fields:     TemplateField[]
  responses:  Record<string, ResponseDraft>
  disabled:   boolean
  onResult:   (id: string, v: string | null) => void
  onNotes:    (id: string, v: string) => void
}) {
  const textFields  = fields.filter(f => f.type !== 'YES_NO')
  const yesNoFields = fields.filter(f => f.type === 'YES_NO')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {textFields.length > 0 && (
        <div style={{ background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Assessment Information
          </div>
          <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {textFields.map(field => (
              <InfoField key={field.id} field={field} value={responses[field.id]?.notes ?? ''} onChange={v => onNotes(field.id, v)} disabled={disabled} />
            ))}
          </div>
        </div>
      )}

      {yesNoFields.length > 0 && (
        <div style={{ background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Facility Features
            </div>
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              Answer YES for every feature present at this facility. Assessment sections will adapt automatically.
            </p>
          </div>
          <div>
            {yesNoFields.map((field, idx) => {
              const result = responses[field.id]?.result ?? null
              const isYes  = result === 'yes'
              const isNo   = result === 'no'
              return (
                <div
                  key={field.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem', borderBottom: idx < yesNoFields.length - 1 ? '1px solid var(--border)' : 'none', background: isYes ? 'rgba(34,197,94,0.04)' : 'none' }}
                >
                  <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--fg)', lineHeight: 1.45 }}>
                    {field.label}
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    <button
                      onClick={() => !disabled && onResult(field.id, isYes ? null : 'yes')}
                      disabled={disabled}
                      style={{ padding: '0.35rem 0.9rem', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700, border: `2px solid ${isYes ? '#86efac' : 'var(--border)'}`, background: isYes ? '#dcfce7' : 'var(--card)', color: isYes ? '#166534' : 'var(--muted)', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}
                    >
                      YES
                    </button>
                    <button
                      onClick={() => !disabled && onResult(field.id, isNo ? null : 'no')}
                      disabled={disabled}
                      style={{ padding: '0.35rem 0.9rem', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700, border: `2px solid ${isNo ? '#fca5a5' : 'var(--border)'}`, background: isNo ? '#fef2f2' : 'var(--card)', color: isNo ? '#991b1b' : 'var(--muted)', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}
                    >
                      NO
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoField({
  field, value, onChange, disabled,
}: {
  field:    TemplateField
  value:    string
  onChange: (v: string) => void
  disabled: boolean
}) {
  const isNumber = field.type === 'NUMBER'
  const isLong   = field.id.startsWith('oa_') || (field.type === 'TEXT' && value.length > 100)

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--fg)', marginBottom: '0.4rem' }}>
        {field.label}
      </label>
      {isLong ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} disabled={disabled} rows={4}
          style={{ width: '100%', padding: '0.6rem 0.75rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg)', fontSize: '0.875rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
          placeholder="Enter notes…"
        />
      ) : (
        <input type={isNumber ? 'number' : 'text'} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
          style={{ width: '100%', padding: '0.6rem 0.75rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
          placeholder={isNumber ? '0' : 'Enter…'}
        />
      )}
    </div>
  )
}

function Rating5Card({
  comp, sectionId, index, rating, onRating,
  descValue, onDescChange, urgency, onUrgency,
  costValue, onCostChange, disabled,
}: {
  comp:          FcaComponent
  sectionId:     string
  index:         number
  rating:        number | null
  onRating:      (v: number | null) => void
  descValue:     string
  onDescChange:  (v: string) => void
  urgency:       string | null
  onUrgency:     (v: string | null) => void
  costValue:     string
  onCostChange:  (v: string) => void
  disabled:      boolean
}) {
  const isDeficient = rating !== null && rating <= 2
  const ratingCfg   = RATING_CFG.find(r => r.v === rating)

  return (
    <div style={{
      background: 'var(--card-b)',
      border: `1.5px solid ${ratingCfg?.border ?? 'var(--border)'}`,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: isDeficient ? '0 0 0 2px rgba(239,68,68,0.08)' : 'none',
      transition: 'border-color 0.2s',
    }}>
      {/* Header */}
      <div style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <span style={{
            flexShrink: 0, width: 28, height: 28, borderRadius: 6,
            background: ratingCfg?.bg ?? 'var(--card)', color: ratingCfg?.fg ?? 'var(--muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 700,
            border: `1px solid ${ratingCfg?.border ?? 'var(--border)'}`,
            marginTop: '0.1rem',
          }}>
            {sectionId}.{index}
          </span>
          <p style={{ flex: 1, margin: 0, fontSize: '0.9rem', fontWeight: 500, color: 'var(--fg)', lineHeight: 1.5 }}>
            {comp.cField.label}
          </p>
        </div>

        {/* 1–5 + N/A rating buttons */}
        <div style={{ display: 'flex', gap: '0.45rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          {RATING_CFG.map(cfg => {
            const selected = rating === cfg.v
            return (
              <button key={cfg.v} onClick={() => !disabled && onRating(selected ? null : cfg.v)} disabled={disabled}
                style={{
                  flex: '1 1 auto', minWidth: 56, padding: '0.55rem 0.3rem',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem',
                  background: selected ? cfg.bg : 'var(--card)',
                  border: `2px solid ${selected ? cfg.border : 'var(--border)'}`,
                  borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: '1.15rem', fontWeight: 900, color: selected ? cfg.fg : 'var(--muted)', lineHeight: 1 }}>
                  {cfg.v}
                </span>
                <span style={{ fontSize: '0.66rem', fontWeight: selected ? 700 : 400, color: selected ? cfg.fg : 'var(--muted)', lineHeight: 1 }}>
                  {cfg.label}
                </span>
              </button>
            )
          })}
          <button onClick={() => !disabled && onRating(null)} disabled={disabled}
            style={{
              flex: '0 0 auto', width: 46, padding: '0.55rem 0.3rem',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: rating === null ? 'var(--card-b)' : 'var(--card)',
              border: `2px solid ${rating === null ? 'var(--border)' : 'var(--border)'}`,
              borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
              opacity: rating === null ? 0.5 : 0.8,
            }}
          >
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>N/A</span>
          </button>
        </div>
      </div>

      {/* Deficiency detail — only when rating ≤ 2 */}
      {isDeficient && (
        <div style={{ padding: '1rem 1.25rem', borderTop: `1px solid ${ratingCfg?.border ?? 'var(--border)'}`, background: 'rgba(239,68,68,0.025)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {comp.dField && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', marginBottom: '0.4rem' }}>
                {comp.dField.label}
              </label>
              <textarea value={descValue} onChange={e => onDescChange(e.target.value)} disabled={disabled} rows={3}
                style={{ width: '100%', padding: '0.6rem 0.75rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg)', fontSize: '0.875rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Describe the deficiency, location, and extent…"
              />
            </div>
          )}

          {comp.uField && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', marginBottom: '0.5rem' }}>Repair urgency</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {URGENCY_OPTIONS.map(opt => {
                  const sel = urgency === opt.value
                  return (
                    <button key={opt.value} disabled={disabled} onClick={() => onUrgency(urgency === opt.value ? null : opt.value)}
                      style={{ flex: '1 1 auto', minWidth: 90, padding: '0.6rem 0.5rem', background: sel ? opt.bg : 'var(--card)', border: `2px solid ${sel ? opt.border : 'var(--border)'}`, borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'center', transition: 'all 0.15s' }}
                    >
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: sel ? opt.color : 'var(--fg)' }}>{opt.label}</div>
                      <div style={{ fontSize: '0.68rem', color: sel ? opt.color : 'var(--muted)', marginTop: '0.1rem' }}>{opt.sublabel}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {comp.eField && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', marginBottom: '0.4rem' }}>
                {comp.eField.label}
              </label>
              <input type="text" value={costValue} onChange={e => onCostChange(e.target.value)} disabled={disabled}
                placeholder="e.g. $5,000 – $10,000"
                style={{ width: '100%', padding: '0.6rem 0.75rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
