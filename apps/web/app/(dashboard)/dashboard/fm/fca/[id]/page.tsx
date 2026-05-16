'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, AlertTriangle, ArrowLeft, Save, CheckCircle2,
  ChevronLeft, ClipboardCheck, Zap, BookOpen, Camera, X,
} from 'lucide-react'
import { FmButton } from '@/components/fm'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvidencePhoto {
  id:       string
  url:      string
  file_key: string
  name?:    string
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
  evidence: EvidencePhoto[]
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

// ── Image compression ─────────────────────────────────────────────────────────

async function compressImage(file: File, maxBytes = 1.5 * 1024 * 1024): Promise<File> {
  if (file.size <= maxBytes) return file
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      const scale = Math.sqrt(maxBytes / file.size)
      width  = Math.round(width  * scale)
      height = Math.round(height * scale)
      canvas.width  = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file),
        'image/jpeg', 0.85,
      )
    }
    img.src = url
  })
}

// ── Rating guide ─────────────────────────────────────────────────────────────

interface GuideEntry {
  category: string
  note?:    string
  levels:   string[]   // index 0 = rating 1, index 4 = rating 5
}

const GUIDE: Record<string, GuideEntry> = {
  'safety-structural': {
    category: 'Structural & Life Safety',
    note: 'Ratings 1–2 require immediate action. Never defer structural or egress deficiencies.',
    levels: [
      'Structural failure or imminent collapse risk. Stop use immediately. Emergency repair required before reopening.',
      'Major cracking, spalling, or egress obstruction. Restrict occupancy. Repair within 30 days.',
      'Visible deficiency (minor cracking, worn hardware) with no immediate safety risk. Schedule within 90 days.',
      'Minor cosmetic wear or isolated issue. Fully structural. Monitor at next inspection.',
      'New or like-new. No deficiencies observed. Meets all applicable code.',
    ],
  },
  'safety-equipment': {
    category: 'Safety Equipment — Playground, Stairs & Exit Paths',
    note: 'Playground equipment and stair/exit conditions directly affect occupant safety.',
    levels: [
      'Unsafe for use. Broken equipment, missing guardrail, or blocked exit. Close area immediately.',
      'Significant damage, loose hardware, or non-compliant clearances. Restrict use. Repair within 30 days.',
      'Functional with noticeable wear, fading, or isolated defects. Schedule repair within 90 days.',
      'Minor surface wear only. Safe and fully functional. Routine maintenance due.',
      'New or recently inspected. Fully safe. No deficiencies.',
    ],
  },
  'weatherproofing': {
    category: 'Building Envelope & Weatherproofing',
    note: 'Rate based on water intrusion risk, not just visible surface condition.',
    levels: [
      'Active leaks causing interior damage. Emergency repair required to prevent further deterioration.',
      'Multiple membrane failures, failed sealants, or high infiltration risk. Repair within 60 days.',
      'Localized cracks or sealant failure. No active leaks but vulnerable. Schedule repair.',
      'Minor surface wear, isolated hairline cracks. No moisture intrusion detected.',
      'Fully intact. No deficiencies. Recently installed or re-sealed.',
    ],
  },
  'mechanical': {
    category: 'Mechanical / HVAC',
    note: 'Consider both comfort impact and equipment remaining useful life.',
    levels: [
      'System non-functional or poses a safety risk (e.g., refrigerant leak, electrical fault). Emergency service required.',
      'Significantly degraded performance. Equipment near end of life or major components failing. Repair within 30 days.',
      'Operational with noticeable issues (reduced capacity, noisy operation, controls erratic). Schedule service.',
      'Functional with normal wear. Routine service or filter replacement due.',
      'Fully operational. Recently serviced or installed. Meets design capacity.',
    ],
  },
  'plumbing': {
    category: 'Plumbing',
    note: 'Backflow or cross-connection risks must be treated as Critical regardless of visible damage.',
    levels: [
      'Active leaks, sewage backup, backflow risk, or water contamination. Stop use. Emergency repair.',
      'Significant leaks, persistent clogs, or major pressure loss. Repair within 30 days.',
      'Functional with slow drains, minor corrosion, dripping fixtures, or aging water heater.',
      'Functional with minor wear. Fixtures operational. Routine maintenance due.',
      'All systems fully functional. No leaks, adequate pressure, code-compliant fixtures.',
    ],
  },
  'electrical': {
    category: 'Electrical Systems',
    note: 'Exposed conductors, overloaded panels, or missing GFCI always rate 1 — take offline.',
    levels: [
      'Immediate hazard: exposed wiring, overloaded panel, or missing GFCI in wet areas. Take offline immediately.',
      'Code violations, tripped breakers not resetting, or inadequate service capacity. Repair within 30 days.',
      'Functional with aging distribution, insufficient lighting levels, or unlabeled panels.',
      'Functional with minor wear. Panel labels complete. Plan for future upgrade.',
      'Fully code-compliant. Recently upgraded or installed. Proper GFCI and labeling throughout.',
    ],
  },
  'site': {
    category: 'Site & Civil Infrastructure',
    note: 'Consider drainage impact alongside surface condition — pooling water accelerates deterioration.',
    levels: [
      'Impassable or dangerous (severe potholes, undermining, collapsed drainage). Close area. Immediate repair.',
      'Significant cracking, trip hazards, or drainage failure. Repair within 60 days.',
      'Noticeable wear, surface cracking, or localized damage. Functional. Schedule repair.',
      'Generally good condition. Minor surface cracks or isolated wear. Seal coat or patch maintenance due.',
      'New or recently resurfaced. No deficiencies. Drainage functioning as designed.',
    ],
  },
  'interior': {
    category: 'Interior Finishes',
    note: 'Water staining on ceilings indicates a leak — rate the stain source, not just the finish.',
    levels: [
      'Major damage, mold growth, or safety hazard (falling ACT tiles, severe trip hazard). Repair immediately.',
      'Widespread damage, staining, or surface failure. Replace or remediate within 60–90 days.',
      'Noticeable wear, isolated damage, or staining. Functional. Schedule repair.',
      'Minor cosmetic wear. Surfaces intact and cleanable. Touch-up maintenance due.',
      'New or recently renovated. No deficiencies.',
    ],
  },
  'accessibility': {
    category: 'ADA / Accessibility',
    note: 'Any condition that blocks or discourages accessible use is at minimum a rating 2.',
    levels: [
      'Accessible route completely blocked or non-existent. Immediate remediation required by law.',
      'Significant non-compliance (slope, clear-width, reach-range, hardware). Correct within 60 days.',
      'Route functional but with notable defects (surface gaps, worn detectable warning strips).',
      'Compliant with minor surface wear. Maintain to prevent further deterioration.',
      'Fully ADA-compliant. Recently inspected or upgraded. No barriers.',
    ],
  },
  'special-spaces': {
    category: 'Special-Use Spaces',
    note: 'Rate the space as a whole system — equipment, finishes, utilities, and code compliance together.',
    levels: [
      'Space unsafe or closed. Major equipment failure or code violation. Immediate repair required.',
      'Operational with significant deficiencies affecting safety or function. Repair within 30–60 days.',
      'Functional with noticeable issues (worn equipment, aging finishes, minor utility defects).',
      'Good condition with minor wear. Routine maintenance or equipment service due.',
      'Excellent condition. Fully functional, recently maintained, and code-compliant.',
    ],
  },
}

function getGuideKey(compKey: string): string {
  const prefix = compKey.split('_')[0]
  // Safety-critical by prefix
  if (prefix === 'st' || prefix === 'ls') return 'safety-structural'
  // Safety-critical specific components
  if (compKey === 'si_06' || compKey === 'in_05') return 'safety-equipment'
  if (prefix === 'be') return 'weatherproofing'
  if (prefix === 'hv') return 'mechanical'
  if (prefix === 'pl') return 'plumbing'
  if (prefix === 'el') return 'electrical'
  if (prefix === 'in') return 'interior'
  if (prefix === 'ad') return 'accessibility'
  if (prefix === 'sp') return 'special-spaces'
  return 'site' // si_ default
}

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
          init[item.key] = {
            result:   item.result,
            severity: item.severity,
            notes:    item.notes,
            rating:   item.rating,
            evidence: Array.isArray(item.evidence) ? item.evidence : [],
          }
        }
        for (const f of fields) {
          if (!init[f.id]) init[f.id] = { result: null, severity: null, notes: null, rating: null, evidence: [] }
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
      return {
        key,
        result:   r?.result ?? null,
        severity: r?.severity ?? null,
        notes:    r?.notes ?? null,
        rating:   r?.rating ?? null,
        evidence: r?.evidence?.length ? r.evidence : null,
      }
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

  async function addPhoto(fieldId: string, file: File) {
    const compressed = await compressImage(file)
    const form = new FormData()
    form.append('file', compressed)
    form.append('item_key', fieldId)
    const res = await fetch(`/api/fm/inspections/${params.id}/photo`, { method: 'POST', body: form })
    if (!res.ok) return
    const photo = await res.json() as EvidencePhoto
    setResponses(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], evidence: [...(prev[fieldId]?.evidence ?? []), photo] },
    }))
    markDirty(fieldId)
  }

  function removePhoto(fieldId: string, photoId: string) {
    setResponses(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], evidence: (prev[fieldId]?.evidence ?? []).filter(p => p.id !== photoId) },
    }))
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
                    evidence={responses[comp.cField.id]?.evidence ?? []}
                    onAddPhoto={file => addPhoto(comp.cField.id, file)}
                    onRemovePhoto={photoId => removePhoto(comp.cField.id, photoId)}
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
  evidence, onAddPhoto, onRemovePhoto,
  descValue, onDescChange, urgency, onUrgency,
  costValue, onCostChange, disabled,
}: {
  comp:           FcaComponent
  sectionId:      string
  index:          number
  rating:         number | null
  onRating:       (v: number | null) => void
  evidence:       EvidencePhoto[]
  onAddPhoto:     (file: File) => Promise<void>
  onRemovePhoto:  (photoId: string) => void
  descValue:      string
  onDescChange:   (v: string) => void
  urgency:        string | null
  onUrgency:      (v: string | null) => void
  costValue:      string
  onCostChange:   (v: string) => void
  disabled:       boolean
}) {
  const [guideOpen, setGuideOpen]     = useState(false)
  const [uploading, setUploading]     = useState(false)
  const fileInputRef                  = useRef<HTMLInputElement>(null)
  const isDeficient = rating !== null && rating <= 2
  const ratingCfg   = RATING_CFG.find(r => r.v === rating)
  const guide       = GUIDE[getGuideKey(comp.compKey)]

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try { await onAddPhoto(file) } finally { setUploading(false) }
  }

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
          {/* Rating scale guide toggle */}
          <button
            onClick={() => setGuideOpen(o => !o)}
            title={guideOpen ? 'Hide rating guide' : 'Show rating guide'}
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.3rem 0.6rem', borderRadius: 6,
              background: guideOpen ? 'rgba(var(--primary-rgb,99,102,241),0.1)' : 'none',
              border: `1px solid ${guideOpen ? 'var(--primary)' : 'var(--border)'}`,
              color: guideOpen ? 'var(--primary)' : 'var(--muted)',
              cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            <BookOpen size={12} />
            Scale
          </button>
        </div>

        {/* Inline rating guide — expands per card, context-aware */}
        {guideOpen && (
          <div style={{
            margin: '0.875rem 0 0',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8, overflow: 'hidden',
          }}>
            {/* Guide header */}
            <div style={{
              padding: '0.6rem 0.875rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
              background: 'rgba(var(--primary-rgb,99,102,241),0.05)',
            }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                {guide.category}
              </span>
              {guide.note && (
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.35, textAlign: 'right' }}>
                  {guide.note}
                </span>
              )}
            </div>
            {/* One row per rating level */}
            {RATING_CFG.map((cfg, i) => (
              <div
                key={cfg.v}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.55rem 0.875rem',
                  borderBottom: i < RATING_CFG.length - 1 ? '1px solid var(--border)' : 'none',
                  background: rating === cfg.v ? cfg.bg : 'none',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{
                  flexShrink: 0, width: 22, height: 22, borderRadius: 5,
                  background: cfg.bg, border: `1.5px solid ${cfg.border}`,
                  color: cfg.fg, fontSize: '0.75rem', fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: '0.1rem',
                }}>
                  {cfg.v}
                </span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: cfg.fg, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '0.4rem' }}>
                    {cfg.label} —
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--fg)', lineHeight: 1.5 }}>
                    {guide.levels[i]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

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

          {/* Photo evidence */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', marginBottom: '0.6rem' }}>
              Photo evidence
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {evidence.map(photo => (
                <div key={photo.id} style={{ position: 'relative', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.name ?? 'Photo'}
                    style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: 8, display: 'block', border: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => window.open(photo.url, '_blank')}
                  />
                  {!disabled && (
                    <button
                      onClick={() => onRemovePhoto(photo.id)}
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'var(--red)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.35)' }}
                      aria-label="Remove photo"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              ))}
              {!disabled && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      width: 76, height: 76, borderRadius: 8, flexShrink: 0,
                      border: '2px dashed var(--border)',
                      background: 'var(--card)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                      cursor: uploading ? 'not-allowed' : 'pointer',
                      color: 'var(--muted)', transition: 'all 0.15s',
                    }}
                  >
                    {uploading
                      ? <Loader2 size={18} className="animate-spin" />
                      : <Camera size={18} />
                    }
                    <span style={{ fontSize: '0.65rem', fontWeight: 600, lineHeight: 1 }}>
                      {uploading ? 'Uploading…' : evidence.length === 0 ? 'Add photo' : 'Add more'}
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>

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
