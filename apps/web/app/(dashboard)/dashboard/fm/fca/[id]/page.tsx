'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, XCircle, MinusCircle, Loader2, AlertTriangle,
  ChevronLeft, Save, ClipboardCheck, ArrowLeft,
} from 'lucide-react'
import { FmButton } from '@/components/fm'

// ── Types ──────────────────────────────────────────────────────────────────

interface TemplateField {
  id: string
  label: string
  type: string
  show_if?: { field: string; answer: string }
}

interface ItemResponse {
  id: string
  key: string
  label: string
  result: string | null
  severity: string | null
  notes: string | null
}

interface FmInspection {
  id: string
  status: string
  fm_properties: { name: string } | null
  template: { json_schema: { fields: TemplateField[] } } | null
  fm_inspection_items: ItemResponse[]
}

interface ResponseDraft {
  result: string | null
  severity: string | null
  notes: string | null
}

// Component = one assessable system (e.g., si_01 = Paving & Parking)
interface FcaComponent {
  compKey: string       // e.g., "si_01"
  cField: TemplateField
  dField?: TemplateField
  uField?: TemplateField
  eField?: TemplateField
}

interface FcaSection {
  id: string            // A–K
  prefix: string        // gi, si, be, …
  label: string
  infoFields: TemplateField[]
  components: FcaComponent[]
}

// ── Static section definitions ─────────────────────────────────────────────

const SECTION_DEFS: { id: string; prefix: string; label: string }[] = [
  { id: 'A', prefix: 'gi', label: 'General Building Information' },
  { id: 'B', prefix: 'si', label: 'Site & Grounds' },
  { id: 'C', prefix: 'be', label: 'Building Envelope' },
  { id: 'D', prefix: 'st', label: 'Structural Systems' },
  { id: 'E', prefix: 'hv', label: 'Mechanical — HVAC' },
  { id: 'F', prefix: 'pl', label: 'Plumbing' },
  { id: 'G', prefix: 'el', label: 'Electrical' },
  { id: 'H', prefix: 'ls', label: 'Life Safety Systems' },
  { id: 'I', prefix: 'in', label: 'Interior Finishes' },
  { id: 'J', prefix: 'ad', label: 'ADA / Accessibility' },
  { id: 'K', prefix: 'oa', label: 'Overall Assessment' },
]

// ── Field parsing helpers ──────────────────────────────────────────────────

// Returns "c" | "d" | "u" | "e" | null for component role fields; null for info fields
function compRole(fieldId: string): 'c' | 'd' | 'u' | 'e' | null {
  const last = fieldId[fieldId.length - 1]
  if (last === 'c' || last === 'd' || last === 'u' || last === 'e') {
    // Confirm the preceding part is prefix_NN
    if (/^[a-z]+_\d{2}[cdue]$/.test(fieldId)) return last as 'c' | 'd' | 'u' | 'e'
  }
  return null
}

function compKey(fieldId: string): string {
  return fieldId.slice(0, -1)  // strip last char (role)
}

function buildSections(fields: TemplateField[]): FcaSection[] {
  return SECTION_DEFS.map(def => {
    const sectionFields = fields.filter(f => f.id.startsWith(def.prefix + '_'))
    const infoFields: TemplateField[] = []
    const compMap = new Map<string, Partial<Record<'c' | 'd' | 'u' | 'e', TemplateField>>>()

    for (const f of sectionFields) {
      const role = compRole(f.id)
      if (role) {
        const ck = compKey(f.id)
        if (!compMap.has(ck)) compMap.set(ck, {})
        compMap.get(ck)![role] = f
      } else {
        infoFields.push(f)
      }
    }

    const components: FcaComponent[] = []
    for (const [ck, roles] of compMap) {
      if (!roles.c) continue
      components.push({
        compKey: ck,
        cField: roles.c,
        dField: roles.d,
        uField: roles.u,
        eField: roles.e,
      })
    }
    // Sort components by key (si_01, si_02, …)
    components.sort((a, b) => a.compKey.localeCompare(b.compKey))

    return { ...def, infoFields, components }
  })
}

// ── STOPLIGHT config ───────────────────────────────────────────────────────

const URGENCY_OPTIONS = [
  { value: 'LOW',    emoji: '🟢', label: 'Low',    sublabel: 'Can wait',           bg: '#dcfce7', border: '#86efac', color: '#166534' },
  { value: 'MEDIUM', emoji: '🟡', label: 'Medium', sublabel: 'Schedule soon',      bg: '#fefce8', border: '#fde047', color: '#854d0e' },
  { value: 'HIGH',   emoji: '🔴', label: 'High',   sublabel: 'Immediate action',   bg: '#fef2f2', border: '#fca5a5', color: '#991b1b' },
]

// ── Section completion ─────────────────────────────────────────────────────

function sectionCompletion(section: FcaSection, responses: Record<string, ResponseDraft>) {
  if (section.components.length === 0) {
    // Info / summary section: count filled info fields
    const total = section.infoFields.length
    const filled = section.infoFields.filter(f => responses[f.id]?.notes?.trim()).length
    return { total, answered: filled, issues: 0 }
  }
  const total    = section.components.length
  const answered = section.components.filter(c => responses[c.cField.id]?.result != null).length
  const issues   = section.components.filter(c => responses[c.cField.id]?.result === 'fail').length
  return { total, answered, issues }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FCAFillPage({ params }: { params: { id: string } }) {
  const router = useRouter()

  const [insp, setInsp]             = useState<FmInspection | null>(null)
  const [sections, setSections]     = useState<FcaSection[]>([])
  const [responses, setResponses]   = useState<Record<string, ResponseDraft>>({})
  const [activeSection, setActiveSection] = useState('A')
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [saveState, setSaveState]   = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const dirtyRef   = useRef<Set<string>>(new Set())
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const responsesRef = useRef(responses)
  responsesRef.current = responses

  // ── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/fm/inspections/${params.id}`)
        if (!res.ok) throw new Error('Not found')
        const data = await res.json() as FmInspection

        const fields = data.template?.json_schema?.fields ?? []
        setSections(buildSections(fields))

        // Build initial responses map from existing items
        const init: Record<string, ResponseDraft> = {}
        for (const item of data.fm_inspection_items ?? []) {
          init[item.key] = {
            result: item.result,
            severity: item.severity,
            notes: item.notes,
          }
        }
        // Fill missing entries with null defaults
        for (const f of fields) {
          if (!init[f.id]) init[f.id] = { result: null, severity: null, notes: null }
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
      return { key, result: r?.result ?? null, severity: r?.severity ?? null, notes: r?.notes ?? null }
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

  function setSeverity(fieldId: string, severity: string | null) {
    setResponses(prev => ({ ...prev, [fieldId]: { ...prev[fieldId], severity } }))
    markDirty(fieldId)
  }

  function setNotes(fieldId: string, notes: string) {
    setResponses(prev => ({ ...prev, [fieldId]: { ...prev[fieldId], notes: notes || null } }))
    markDirty(fieldId)
  }

  function skipSection(section: FcaSection) {
    const updates: Record<string, ResponseDraft> = {}
    for (const comp of section.components) {
      updates[comp.cField.id] = { result: null, severity: null, notes: null }
      if (comp.dField) updates[comp.dField.id] = { result: null, severity: null, notes: null }
      if (comp.uField) updates[comp.uField.id] = { result: null, severity: null, notes: null }
      if (comp.eField) updates[comp.eField.id] = { result: null, severity: null, notes: null }
      dirtyRef.current.add(comp.cField.id)
    }
    for (const f of section.infoFields) {
      updates[f.id] = { result: null, severity: null, notes: null }
      dirtyRef.current.add(f.id)
    }
    setResponses(prev => ({ ...prev, ...updates }))
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, 1500)
  }

  // ── Section navigation ────────────────────────────────────────────────────

  function goNextSection() {
    const idx = SECTION_DEFS.findIndex(s => s.id === activeSection)
    if (idx < SECTION_DEFS.length - 1) setActiveSection(SECTION_DEFS[idx + 1].id)
  }

  function goPrevSection() {
    const idx = SECTION_DEFS.findIndex(s => s.id === activeSection)
    if (idx > 0) setActiveSection(SECTION_DEFS[idx - 1].id)
  }

  // ── Complete inspection ───────────────────────────────────────────────────

  async function complete() {
    await flush()
    const res = await fetch(`/api/fm/inspections/${params.id}/complete`, { method: 'POST' })
    if (res.ok) router.push('/dashboard/fm/fca')
    else setSaveState('error')
  }

  // ── Render guards ─────────────────────────────────────────────────────────

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

  // ── Full page layout ───────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--card)', minHeight: '100vh' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '0.875rem 1.25rem',
        background: 'var(--card-b)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        flexWrap: 'wrap',
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
          {/* Save indicator */}
          <span style={{
            fontSize: '0.78rem', fontWeight: 500,
            color: saveState === 'saving' ? 'var(--muted)' : saveState === 'saved' ? 'var(--teal)' : saveState === 'error' ? 'var(--red)' : 'var(--muted)',
            opacity: saveState === 'idle' ? 0 : 1,
            transition: 'opacity 0.3s',
          }}>
            {saveState === 'saving' ? '↑ Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'error' ? '✕ Save failed' : ''}
          </span>

          <FmButton size="sm" variant="secondary" icon={<Save size={14} />} onClick={flush}>
            Save
          </FmButton>

          {!isCompleted && (
            <FmButton size="sm" variant="primary" icon={<CheckCircle2 size={14} />} onClick={complete}>
              Complete
            </FmButton>
          )}
        </div>
      </div>

      {/* ── Main two-column layout ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Section sidebar ── */}
        <div style={{
          width: sidebarOpen ? 220 : 64,
          flexShrink: 0,
          background: 'var(--card-b)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 0.2s ease',
        }}>
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{
              padding: '0.75rem',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarOpen ? 'flex-end' : 'center',
              color: 'var(--muted)',
              fontSize: '0.75rem',
            }}
            aria-label="Toggle sidebar"
          >
            <ChevronLeft size={16} style={{ transform: sidebarOpen ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
          </button>

          {/* Section list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
            {sections.map(sec => {
              const compl  = sectionCompletion(sec, responses)
              const active = sec.id === activeSection
              const pct    = compl.total > 0 ? Math.round((compl.answered / compl.total) * 100) : 0
              const done   = compl.total > 0 && compl.answered === compl.total

              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  style={{
                    width: '100%',
                    padding: sidebarOpen ? '0.75rem 1rem' : '0.75rem 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    background: active ? 'rgba(var(--primary-rgb, 99,102,241), 0.12)' : 'none',
                    border: 'none',
                    borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                    justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  }}
                >
                  {/* Section letter bubble */}
                  <span style={{
                    flexShrink: 0,
                    width: 28, height: 28,
                    borderRadius: 6,
                    background: done ? 'var(--teal)' : active ? 'var(--primary)' : 'var(--card)',
                    color: (done || active) ? '#fff' : 'var(--fg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.78rem', fontWeight: 700,
                    border: '1px solid var(--border)',
                    position: 'relative',
                  }}>
                    {sec.id}
                    {compl.issues > 0 && (
                      <span style={{
                        position: 'absolute', top: -4, right: -4,
                        width: 10, height: 10,
                        borderRadius: '50%',
                        background: 'var(--red)',
                        border: '1.5px solid var(--card-b)',
                      }} />
                    )}
                  </span>

                  {sidebarOpen && (
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: active ? 600 : 400, color: active ? 'var(--fg)' : 'var(--muted)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
                        {sec.label}
                      </div>
                      {compl.total > 0 && (
                        <div style={{ fontSize: '0.7rem', color: compl.issues > 0 ? 'var(--red)' : done ? 'var(--teal)' : 'var(--muted)', marginTop: '0.1rem' }}>
                          {done ? 'Complete' : `${compl.answered}/${compl.total}`}
                          {compl.issues > 0 ? ` · ${compl.issues} issue${compl.issues > 1 ? 's' : ''}` : ''}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Skip section button */}
          {sidebarOpen && currentSection.components.length > 0 && !isCompleted && (
            <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => skipSection(currentSection)}
                style={{
                  width: '100%', padding: '0.6rem',
                  background: 'none',
                  border: '1px dashed var(--border)',
                  borderRadius: 6,
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  textAlign: 'center',
                }}
              >
                Skip section
              </button>
            </div>
          )}
        </div>

        {/* ── Section content ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>

          {/* Section heading */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                Section {activeSection}
              </div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--fg)' }}>
                {currentSection.label}
              </h2>
            </div>

            {/* Prev / Next nav */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={goPrevSection}
                disabled={sectionIdx === 0}
                style={{ padding: '0.5rem 0.75rem', background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: sectionIdx === 0 ? 'not-allowed' : 'pointer', fontSize: '0.8rem', opacity: sectionIdx === 0 ? 0.4 : 1 }}
              >
                ← Prev
              </button>
              <button
                onClick={goNextSection}
                disabled={sectionIdx === SECTION_DEFS.length - 1}
                style={{ padding: '0.5rem 0.75rem', background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: sectionIdx === SECTION_DEFS.length - 1 ? 'not-allowed' : 'pointer', fontSize: '0.8rem', opacity: sectionIdx === SECTION_DEFS.length - 1 ? 0.4 : 1 }}
              >
                Next →
              </button>
            </div>
          </div>

          {/* Standalone info fields (Section A, K, or HVAC header) */}
          {currentSection.infoFields.length > 0 && (
            <div style={{
              background: 'var(--card-b)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '1.25rem',
              marginBottom: currentSection.components.length > 0 ? '1.5rem' : 0,
            }}>
              <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {currentSection.infoFields.map(field => (
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

          {/* Component assessment cards */}
          {currentSection.components.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {currentSection.components.map((comp, idx) => {
                const condResult = responses[comp.cField.id]?.result ?? null
                const isFail     = condResult === 'fail'

                return (
                  <ComponentCard
                    key={comp.compKey}
                    comp={comp}
                    sectionId={activeSection}
                    index={idx + 1}
                    condResult={condResult}
                    onCondResult={result => {
                      setResult(comp.cField.id, result)
                      // If switching to pass, clear the sub-fields
                      if (result !== 'fail') {
                        if (comp.dField) setNotes(comp.dField.id, '')
                        if (comp.uField) setSeverity(comp.uField.id, null)
                        if (comp.eField) setNotes(comp.eField.id, '')
                      }
                    }}
                    isFail={isFail}
                    descValue={comp.dField ? (responses[comp.dField.id]?.notes ?? '') : ''}
                    onDescChange={v => comp.dField && setNotes(comp.dField.id, v)}
                    urgency={comp.uField ? (responses[comp.uField.id]?.severity ?? null) : null}
                    onUrgency={v => comp.uField && setSeverity(comp.uField.id, v)}
                    costValue={comp.eField ? (responses[comp.eField.id]?.notes ?? '') : ''}
                    onCostChange={v => comp.eField && setNotes(comp.eField.id, v)}
                    disabled={isCompleted}
                  />
                )
              })}
            </div>
          )}

          {/* Bottom nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={goPrevSection}
              disabled={sectionIdx === 0}
              style={{ padding: '0.75rem 1.25rem', background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: sectionIdx === 0 ? 'not-allowed' : 'pointer', fontSize: '0.875rem', opacity: sectionIdx === 0 ? 0.4 : 1 }}
            >
              ← Previous section
            </button>
            {sectionIdx < SECTION_DEFS.length - 1 ? (
              <button
                onClick={goNextSection}
                style={{ padding: '0.75rem 1.5rem', background: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
              >
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

// ── Sub-components ─────────────────────────────────────────────────────────

function InfoField({
  field, value, onChange, disabled,
}: {
  field: TemplateField
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  const isNumber = field.type === 'NUMBER'
  const isLong   = field.type === 'TEXT' && field.id.startsWith('oa_')

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--fg)', marginBottom: '0.4rem' }}>
        {field.label}
      </label>
      {isLong ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          rows={4}
          style={{
            width: '100%', padding: '0.6rem 0.75rem',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--fg)', fontSize: '0.875rem',
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          }}
          placeholder="Enter notes…"
        />
      ) : (
        <input
          type={isNumber ? 'number' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          style={{
            width: '100%', padding: '0.6rem 0.75rem',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--fg)', fontSize: '0.875rem',
            outline: 'none', boxSizing: 'border-box',
          }}
          placeholder={isNumber ? '0' : 'Enter…'}
        />
      )}
    </div>
  )
}

function ComponentCard({
  comp, sectionId, index, condResult, onCondResult,
  isFail, descValue, onDescChange, urgency, onUrgency,
  costValue, onCostChange, disabled,
}: {
  comp: FcaComponent
  sectionId: string
  index: number
  condResult: string | null
  onCondResult: (v: string | null) => void
  isFail: boolean
  descValue: string
  onDescChange: (v: string) => void
  urgency: string | null
  onUrgency: (v: string | null) => void
  costValue: string
  onCostChange: (v: string) => void
  disabled: boolean
}) {
  const isPass = condResult === 'pass'
  const isNA   = condResult === null

  // Determine highlight color for card border
  const highlight = isFail ? 'var(--red)' : isPass ? 'var(--teal)' : 'var(--border)'

  return (
    <div style={{
      background: 'var(--card-b)',
      border: `1.5px solid ${highlight}`,
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: isFail ? '0 0 0 1px rgba(239,68,68,0.1)' : 'none',
      transition: 'border-color 0.2s',
    }}>
      {/* Card header */}
      <div style={{
        padding: '1rem 1.25rem',
        borderBottom: isFail ? '1px solid var(--border)' : 'none',
        background: isFail ? 'rgba(239,68,68,0.04)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          {/* Index badge */}
          <span style={{
            flexShrink: 0,
            width: 28, height: 28,
            borderRadius: 6,
            background: isFail ? 'var(--red)' : isPass ? 'var(--teal)' : 'var(--card)',
            color: (isFail || isPass) ? '#fff' : 'var(--muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 700,
            border: '1px solid var(--border)',
            marginTop: '0.1rem',
          }}>
            {sectionId}.{index}
          </span>

          {/* Condition statement */}
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '0.925rem', fontWeight: 500, color: 'var(--fg)', lineHeight: 1.45 }}>
              {comp.cField.label}
            </p>
          </div>
        </div>

        {/* Pass / Fail / N-A toggle */}
        <div style={{ display: 'flex', gap: '0.625rem', marginTop: '1rem' }}>
          <CondButton
            label="Acceptable"
            icon={<CheckCircle2 size={18} />}
            active={condResult === 'pass'}
            disabled={disabled}
            color={{ active: 'var(--teal)', activeBg: '#f0fdf4', border: '#86efac' }}
            onClick={() => onCondResult(condResult === 'pass' ? null : 'pass')}
          />
          <CondButton
            label="Issue Found"
            icon={<XCircle size={18} />}
            active={condResult === 'fail'}
            disabled={disabled}
            color={{ active: 'var(--red)', activeBg: '#fef2f2', border: '#fca5a5' }}
            onClick={() => onCondResult(condResult === 'fail' ? null : 'fail')}
          />
          <CondButton
            label="N/A"
            icon={<MinusCircle size={18} />}
            active={condResult === 'na'}
            disabled={disabled}
            color={{ active: 'var(--muted)', activeBg: 'var(--card)', border: 'var(--border)' }}
            onClick={() => onCondResult(condResult === 'na' ? null : 'na')}
          />
        </div>
      </div>

      {/* Issue detail panel — only when FAIL */}
      {isFail && (
        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Description */}
          {comp.dField && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', marginBottom: '0.4rem' }}>
                {comp.dField.label}
              </label>
              <textarea
                value={descValue}
                onChange={e => onDescChange(e.target.value)}
                disabled={disabled}
                rows={3}
                style={{
                  width: '100%', padding: '0.6rem 0.75rem',
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--fg)', fontSize: '0.875rem',
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                }}
                placeholder="Describe the deficiency, location, and extent…"
              />
            </div>
          )}

          {/* Urgency */}
          {comp.uField && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', marginBottom: '0.6rem' }}>
                Repair urgency
              </label>
              <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
                {URGENCY_OPTIONS.map(opt => {
                  const selected = urgency === opt.value
                  return (
                    <button
                      key={opt.value}
                      disabled={disabled}
                      onClick={() => onUrgency(urgency === opt.value ? null : opt.value)}
                      style={{
                        flex: '1 1 auto',
                        minWidth: 100,
                        padding: '0.75rem 0.5rem',
                        background: selected ? opt.bg : 'var(--card)',
                        border: `2px solid ${selected ? opt.border : 'var(--border)'}`,
                        borderRadius: 8,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontSize: '1.3rem' }}>{opt.emoji}</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: selected ? opt.color : 'var(--fg)', marginTop: '0.2rem' }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: selected ? opt.color : 'var(--muted)', marginTop: '0.1rem' }}>
                        {opt.sublabel}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Cost estimate */}
          {comp.eField && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', marginBottom: '0.4rem' }}>
                {comp.eField.label}
              </label>
              <input
                type="text"
                value={costValue}
                onChange={e => onCostChange(e.target.value)}
                disabled={disabled}
                placeholder="e.g. $5,000 – $10,000"
                style={{
                  width: '100%', padding: '0.6rem 0.75rem',
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--fg)', fontSize: '0.875rem',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CondButton({
  label, icon, active, disabled, color, onClick,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  disabled: boolean
  color: { active: string; activeBg: string; border: string }
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: '1 1 auto',
        minHeight: 52,
        padding: '0.6rem 0.5rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
        background: active ? color.activeBg : 'var(--card)',
        border: `2px solid ${active ? color.border : 'var(--border)'}`,
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: active ? color.active : 'var(--muted)',
        fontWeight: active ? 700 : 400,
        fontSize: '0.78rem',
        transition: 'all 0.15s',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {icon}
      {label}
    </button>
  )
}
