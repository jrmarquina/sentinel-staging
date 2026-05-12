'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertTriangle,
  Camera, X, Plus, MapPin, ZoomIn, ZoomOut,
} from 'lucide-react'
import { useFmT } from '@/lib/locale'

// ── Types ──────────────────────────────────────────────────────────────────

interface EvidencePhoto {
  id: string
  url: string
  file_key: string
  name?: string
}

interface LocationPin {
  floor_plan_id: string
  floor_plan_url: string
  x: number   // 0–1 fraction of image width
  y: number   // 0–1 fraction of image height
}

interface ChecklistItem {
  id: string
  key: string
  label: string
  result: string | null
  severity: string | null
  notes: string | null
  evidence: EvidencePhoto[] | null
  location_data: LocationPin | null
}

interface FloorPlan {
  id: string
  name: string
  floor_name: string
  url: string
}

interface FmInspection {
  id: string
  status: string
  property_id?: string
  fm_properties?: { id: string; name: string } | null
  fm_checklist_item_responses?: ChecklistItem[]
  // alias used by the API
  fm_inspection_items?: ChecklistItem[]
}

interface TeamMember {
  user_id:    string
  full_name:  string
  capability: string
  is_me:      boolean
}

type Result   = 'PASS' | 'FAIL' | 'NA'
type Severity = 'LOW' | 'MEDIUM' | 'HIGH'

interface ItemState {
  result:    string | null
  severity:  string | null
  notes:     string | null
  evidence:  EvidencePhoto[]
  pin:       LocationPin | null
}

// ── Result / Severity button styles ───────────────────────────────────────

const RESULT_CONFIG: { value: Result; label: string; activeColor: string; activeBg: string }[] = [
  { value: 'PASS', label: 'PASS',  activeColor: '#fff',        activeBg: 'var(--teal)' },
  { value: 'FAIL', label: 'FAIL',  activeColor: '#fff',        activeBg: 'var(--red)' },
  { value: 'NA',   label: 'N / A', activeColor: 'var(--card)', activeBg: 'var(--muted)' },
]

const SEVERITY_CONFIG: { value: Severity; label: string; color: string; bg: string }[] = [
  { value: 'LOW',    label: 'Low',    color: 'var(--amber)', bg: 'var(--amber-c)' },
  { value: 'MEDIUM', label: 'Medium', color: 'var(--red)',   bg: 'var(--red-c)' },
  { value: 'HIGH',   label: 'High',   color: '#fff',         bg: 'var(--red)' },
]

// ── Image compression ─────────────────────────────────────────────────────

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
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file),
        'image/jpeg', 0.85,
      )
    }
    img.src = url
  })
}

// ── Work Order Modal ───────────────────────────────────────────────────────

function WorkOrderModal({
  itemLabel,
  itemId,
  inspectionId,
  propertyId,
  team,
  onClose,
  onCreated,
}: {
  itemLabel:    string
  itemId:       string
  inspectionId: string
  propertyId:   string
  team:         TeamMember[]
  onClose:      () => void
  onCreated:    () => void
}) {
  const [title, setTitle]       = useState(`${itemLabel} – Maintenance Required`)
  const [desc,  setDesc]        = useState('')
  const [dueDate, setDueDate]   = useState('')
  const [assignee, setAssignee] = useState('')
  const [pending, setPending]   = useState(false)
  const [error, setError]       = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError('Title is required'); return }
    if (desc.trim().length < 10) { setError('Please describe the issue (min 10 characters)'); return }

    setPending(true)
    try {
      const res = await fetch('/api/fm/work-orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:             title.trim(),
          description:       desc.trim(),
          property_id:       propertyId,
          inspection_id:     inspectionId,
          checklist_item_id: itemId,
          due_date:          dueDate ? new Date(dueDate).toISOString() : null,
          assigned_to_id:    assignee || null,
          priority:          'MEDIUM',
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to create work order')
      }
      onCreated()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setPending(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520,
        padding: '1.5rem', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
            Create Work Order
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Title */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="fm-input"
              style={{ fontSize: '0.9rem' }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>
              Description
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Describe the issue and any relevant details…"
              className="fm-input"
              style={{ resize: 'vertical', fontSize: '0.9rem', minHeight: 70 }}
            />
          </div>

          {/* Due date + Assign to */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="fm-input"
                style={{ fontSize: '0.9rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>
                Assign To
              </label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="fm-input"
                style={{ fontSize: '0.9rem' }}
              >
                <option value="">Unassigned</option>
                {team.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p style={{ fontSize: '0.8rem', color: 'var(--red)', background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.5rem 0.75rem', margin: 0 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', paddingTop: '0.25rem' }}>
            <button type="button" onClick={onClose} style={{
              padding: '0.875rem', background: 'var(--card-b)', border: '1px solid var(--border)',
              borderRadius: 14, color: 'var(--fg)', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button type="submit" disabled={pending} style={{
              padding: '0.875rem', background: pending ? 'var(--primary-c)' : 'var(--primary)',
              border: 'none', borderRadius: 14, color: '#fff',
              fontSize: '0.9rem', fontWeight: 800, cursor: pending ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              opacity: pending ? 0.7 : 1, transition: 'opacity 0.15s',
            }}>
              {pending ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</> : 'Create Work Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Floor Plan Pin Modal ───────────────────────────────────────────────────

function FloorPlanModal({
  floorPlans,
  currentPin,
  onClose,
  onSave,
}: {
  floorPlans: FloorPlan[]
  currentPin: LocationPin | null
  onClose:    () => void
  onSave:     (pin: LocationPin | null) => void
}) {
  const [selectedPlan, setSelectedPlan] = useState<FloorPlan>(
    currentPin
      ? (floorPlans.find((p) => p.id === currentPin.floor_plan_id) ?? floorPlans[0])
      : floorPlans[0]
  )
  const [pin, setPin] = useState<{ x: number; y: number } | null>(
    currentPin && currentPin.floor_plan_id === selectedPlan?.id
      ? { x: currentPin.x, y: currentPin.y }
      : null
  )
  const imgRef = useRef<HTMLImageElement>(null)

  function handleImgClick(e: React.MouseEvent<HTMLImageElement>) {
    const img = imgRef.current
    if (!img) return
    const rect = img.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top)  / rect.height
    setPin({ x, y })
  }

  function handleSave() {
    if (!pin || !selectedPlan) { onSave(null); return }
    onSave({
      floor_plan_id:  selectedPlan.id,
      floor_plan_url: selectedPlan.url,
      x: pin.x,
      y: pin.y,
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1.25rem',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
      }}>
        <div>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff', margin: 0 }}>
            Mark Location on Floor Plan
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', margin: '0.2rem 0 0' }}>
            Tap the image to place a pin
          </p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex', padding: 6 }}>
          <X size={20} />
        </button>
      </div>

      {/* Floor plan selector (if multiple) */}
      {floorPlans.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.25rem', flexShrink: 0, overflowX: 'auto' }}>
          {floorPlans.map((fp) => (
            <button
              key={fp.id}
              onClick={() => { setSelectedPlan(fp); setPin(null) }}
              style={{
                padding: '0.4rem 0.875rem', borderRadius: 999, flexShrink: 0,
                fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                background: selectedPlan.id === fp.id ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                border: 'none', color: '#fff',
              }}
            >
              {fp.floor_name} — {fp.name}
            </button>
          ))}
        </div>
      )}

      {/* Floor plan image */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '1rem' }}>
        <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={selectedPlan?.url}
            alt="Floor plan"
            onClick={handleImgClick}
            style={{
              maxWidth: '100%', maxHeight: '70vh',
              display: 'block', cursor: 'crosshair',
              borderRadius: 12, userSelect: 'none',
              border: '2px solid rgba(255,255,255,0.15)',
            }}
            draggable={false}
          />
          {/* Pin marker */}
          {pin && (
            <div style={{
              position: 'absolute',
              left:   `${pin.x * 100}%`,
              top:    `${pin.y * 100}%`,
              transform: 'translate(-50%, -100%)',
              pointerEvents: 'none',
            }}>
              <MapPin size={32} style={{ color: 'var(--red)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' }} />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', gap: '0.75rem', padding: '1rem 1.25rem',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => setPin(null)}
          style={{
            flex: 1, padding: '0.875rem',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 14, color: '#fff', fontSize: '0.9rem', fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Clear Pin
        </button>
        <button
          onClick={handleSave}
          style={{
            flex: 2, padding: '0.875rem',
            background: 'var(--primary)', border: 'none',
            borderRadius: 14, color: '#fff', fontSize: '0.9rem', fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {pin ? 'Save Location' : 'Remove Location'}
        </button>
      </div>
    </div>
  )
}

// ── Photo Thumbnail ────────────────────────────────────────────────────────

function PhotoThumbnail({ photo, onRemove }: { photo: EvidencePhoto; onRemove: () => void }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.name ?? 'Photo'}
        style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, display: 'block', border: '1px solid var(--border)' }}
      />
      <button
        onClick={onRemove}
        style={{
          position: 'absolute', top: -6, right: -6,
          width: 20, height: 20, borderRadius: '50%',
          background: 'var(--red)', border: 'none',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}
        aria-label="Remove photo"
      >
        <X size={11} />
      </button>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function InspectionRunPage() {
  const params = useParams()
  const router = useRouter()
  const t = useFmT()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [items, setItems]         = useState<ChecklistItem[]>([])
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [itemState, setItemState] = useState<Record<string, ItemState>>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // New state
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([])
  const [team, setTeam]             = useState<TeamMember[]>([])
  const [showWO, setShowWO]         = useState(false)
  const [showFP, setShowFP]         = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [woCreated, setWoCreated]   = useState<Set<string>>(new Set())

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dirty        = useRef<Set<string>>(new Set())
  const saveTimeout  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load inspection ────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/fm/inspections/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(t('insp.run.notFound'))
        return r.json() as Promise<FmInspection>
      })
      .then((data) => {
        const fetched = data.fm_inspection_items ?? []
        const pid = data.fm_properties?.id ?? data.property_id ?? null
        setItems(fetched)
        setPropertyId(pid)

        const state: Record<string, ItemState> = {}
        for (const item of fetched) {
          // DB stores result lowercase ('pass','fail') — normalise to uppercase for the UI
          state[item.key] = {
            result:   item.result ? item.result.toUpperCase() : null,
            severity: item.severity,
            notes:    item.notes,
            evidence: Array.isArray(item.evidence) ? item.evidence : [],
            pin:      item.location_data ?? null,
          }
        }
        setItemState(state)

        // Load floor plans for property
        if (pid) {
          fetch(`/api/fm/properties/${pid}/floor-plans`)
            .then((r) => r.json() as Promise<FloorPlan[]>)
            .then(setFloorPlans)
            .catch(() => { /* non-fatal */ })
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [id, t])

  // ── Load team for WO assignment ────────────────────────────────────────
  useEffect(() => {
    fetch('/api/fm/team')
      .then((r) => r.json() as Promise<TeamMember[]>)
      .then((members) => setTeam(members.filter((m) => !m.is_me)))
      .catch(() => { /* non-fatal */ })
  }, [])

  // ── Check which items already have WOs ─────────────────────────────────
  useEffect(() => {
    if (!items.length) return
    fetch(`/api/fm/work-orders?inspectionId=${id}`)
      .then((r) => r.json() as Promise<Array<{ checklist_item_id: string | null }>>)
      .then((wos) => {
        const ids = new Set(wos.map((w) => w.checklist_item_id).filter(Boolean) as string[])
        setWoCreated(ids)
      })
      .catch(() => { /* non-fatal */ })
  }, [id, items.length])

  // ── Auto-save dirty items ──────────────────────────────────────────────
  const saveDirty = useCallback(async () => {
    if (dirty.current.size === 0) return
    const keysToSave = Array.from(dirty.current)
    dirty.current.clear()
    setSaving(true)
    try {
      const updates = keysToSave.map((key) => ({
        key,
        ...(itemState[key] ?? { result: null, severity: null, notes: null, evidence: [], pin: null }),
      })).map(({ pin, evidence, ...rest }) => ({
        ...rest,
        evidence: evidence.length ? evidence : null,
        pin,
      }))
      await fetch(`/api/fm/inspections/${id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updates }),
      })
    } finally {
      setSaving(false)
    }
  }, [id, itemState])

  useEffect(() => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => { void saveDirty() }, 1500)
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current) }
  }, [itemState, saveDirty])

  // ── Item state helpers ─────────────────────────────────────────────────
  function updateItem(key: string, patch: Partial<ItemState>) {
    setItemState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
    dirty.current.add(key)
  }

  // ── Photo upload ───────────────────────────────────────────────────────
  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''   // reset so same file can be re-selected

    setUploadingPhoto(true)
    try {
      const compressed = await compressImage(file)
      const form = new FormData()
      form.append('file', compressed)
      form.append('item_key', currentKey)

      const res = await fetch(`/api/fm/inspections/${id}/photo`, { method: 'POST', body: form })
      if (!res.ok) throw new Error('Upload failed')
      const photo = await res.json() as EvidencePhoto

      const current = itemState[currentKey]
      updateItem(currentKey, { evidence: [...(current?.evidence ?? []), photo] })
    } catch {
      // silently ignore — could show a toast here
    } finally {
      setUploadingPhoto(false)
    }
  }

  function removePhoto(key: string, photoId: string) {
    const current = itemState[key]
    updateItem(key, { evidence: (current?.evidence ?? []).filter((p) => p.id !== photoId) })
  }

  // ── Navigation ─────────────────────────────────────────────────────────
  async function navigate(delta: number) {
    await saveDirty()
    setCurrentIndex((i) => Math.max(0, Math.min(items.length - 1, i + delta)))
  }

  async function handleComplete() {
    await saveDirty()
    setCompleting(true)
    try {
      const res = await fetch(`/api/fm/inspections/${id}/complete`, { method: 'POST' })
      if (res.ok) router.push(`/dashboard/fm/inspections/${id}`)
    } finally {
      setCompleting(false)
    }
  }

  // ── Loading / error states ─────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: '0.75rem' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>{t('loading')}</p>
      </div>
    )
  }

  if (error || items.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: '0.75rem', color: 'var(--red)' }}>
        <AlertTriangle size={28} />
        <p style={{ fontSize: '1rem', fontWeight: 600 }}>{error ?? t('insp.run.notFound')}</p>
        <button
          onClick={() => router.push('/dashboard/fm/inspections')}
          style={{ fontSize: '0.875rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          {t('insp.run.back')}
        </button>
      </div>
    )
  }

  const currentItem = items[currentIndex]
  const currentKey  = currentItem.key
  const currentId   = currentItem.id
  const state       = itemState[currentKey] ?? { result: null, severity: null, notes: null, evidence: [], pin: null }
  const isLast      = currentIndex === items.length - 1
  const progress    = ((currentIndex + 1) / items.length) * 100
  const hasWO       = woCreated.has(currentId)

  return (
    <>
      {/* Hidden file input for camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handlePhotoSelected}
      />

      <div style={{
        display: 'flex', flexDirection: 'column',
        minHeight: 'calc(100vh - 8rem)',
        maxWidth: 480, margin: '0 auto',
      }}>
        {/* Progress bar */}
        <div style={{ height: 4, background: 'var(--border)', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: 'var(--primary)',
            width: `${progress}%`, transition: 'width 0.3s ease',
            borderRadius: 9999,
          }} />
        </div>

        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.875rem 0.25rem',
        }}>
          <button
            onClick={() => router.push(`/dashboard/fm/inspections/${id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              fontSize: '0.875rem', color: 'var(--muted)',
              background: 'none', border: 'none', cursor: 'pointer',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
          >
            <ArrowLeft size={16} />
            {t('insp.run.exit')}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            {saving && (
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> {t('insp.run.saving')}
              </span>
            )}
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--muted)' }}>
              {currentIndex + 1} <span style={{ fontWeight: 400 }}>{t('insp.run.of')}</span> {items.length}
            </span>
          </div>

          <button
            onClick={saveDirty}
            disabled={saving}
            style={{
              fontSize: '0.875rem', color: 'var(--primary)',
              background: 'none', border: 'none', cursor: 'pointer',
              fontWeight: 600, opacity: saving ? 0.5 : 1,
            }}
          >
            {t('save')}
          </button>
        </div>

        {/* Item card */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0.5rem 0.25rem' }}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '1.5rem',
            boxShadow: 'var(--shadow)',
            display: 'flex', flexDirection: 'column', gap: '1.25rem',
          }}>
            {/* Label row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                  {t('insp.run.item')} {currentIndex + 1}
                </p>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--fg)', lineHeight: 1.3, margin: 0 }}>
                  {currentItem.label}
                </h2>
              </div>

              {/* Work order button */}
              {propertyId && (
                <button
                  onClick={() => setShowWO(true)}
                  title={hasWO ? 'Work order already created' : 'Create work order for this item'}
                  style={{
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.4rem 0.7rem', borderRadius: 10,
                    background: hasWO ? 'var(--teal-c)' : 'var(--card-b)',
                    border: `1px solid ${hasWO ? 'var(--teal)' : 'var(--border)'}`,
                    color: hasWO ? 'var(--teal)' : 'var(--muted)',
                    fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <Plus size={13} />
                  WO{hasWO ? ' ✓' : ''}
                </button>
              )}
            </div>

            {/* PASS / FAIL / NA buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              {RESULT_CONFIG.map((btn) => {
                const isActive = state.result === btn.value
                return (
                  <button
                    key={btn.value}
                    onClick={() => updateItem(currentKey, {
                      result: btn.value,
                      ...(btn.value !== 'FAIL' ? { severity: null } : {}),
                    })}
                    style={{
                      padding: '1rem 0.5rem',
                      borderRadius: 14,
                      border: `2px solid ${isActive ? btn.activeBg : 'var(--border)'}`,
                      background: isActive ? btn.activeBg : 'var(--card-b)',
                      color: isActive ? btn.activeColor : 'var(--fg)',
                      fontSize: '1rem', fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      touchAction: 'manipulation',
                    }}
                  >
                    {btn.label}
                  </button>
                )
              })}
            </div>

            {/* Severity (on FAIL) */}
            {state.result === 'FAIL' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>{t('insp.run.severity')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  {SEVERITY_CONFIG.map((btn) => {
                    const isActive = state.severity === btn.value
                    return (
                      <button
                        key={btn.value}
                        onClick={() => updateItem(currentKey, { severity: btn.value })}
                        style={{
                          padding: '0.75rem 0.5rem', borderRadius: 12,
                          border: `2px solid ${isActive ? btn.bg : 'var(--border)'}`,
                          background: isActive ? btn.bg : 'var(--card-b)',
                          color: isActive ? btn.color : 'var(--fg)',
                          fontSize: '0.875rem', fontWeight: 700,
                          cursor: 'pointer', transition: 'all 0.15s ease', touchAction: 'manipulation',
                        }}
                      >
                        {btn.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Notes (on FAIL) */}
            {state.result === 'FAIL' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>{t('insp.run.notes')}</p>
                <textarea
                  value={state.notes ?? ''}
                  onChange={(e) => updateItem(currentKey, { notes: e.target.value })}
                  rows={3}
                  placeholder={t('insp.run.notesPlaceholder')}
                  className="fm-input"
                  style={{ resize: 'vertical', fontSize: '0.9rem', minHeight: 70 }}
                />
              </div>
            )}

            {/* ── Photo section ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                  Photos {state.evidence.length > 0 ? `(${state.evidence.length})` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {state.evidence.map((photo) => (
                  <PhotoThumbnail
                    key={photo.id}
                    photo={photo}
                    onRemove={() => removePhoto(currentKey, photo.id)}
                  />
                ))}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  style={{
                    width: 72, height: 72, borderRadius: 10,
                    background: 'var(--card-b)', border: '2px dashed var(--border)',
                    color: 'var(--muted)', cursor: uploadingPhoto ? 'wait' : 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: '0.25rem', flexShrink: 0, transition: 'border-color 0.15s',
                    opacity: uploadingPhoto ? 0.6 : 1,
                  }}
                  aria-label="Add photo"
                >
                  {uploadingPhoto
                    ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    : <><Camera size={20} /><span style={{ fontSize: '0.6rem', fontWeight: 700 }}>ADD</span></>
                  }
                </button>
              </div>
            </div>

            {/* ── Floor plan section (only if floor plans exist) ── */}
            {floorPlans.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                  Location
                </p>
                {state.pin ? (
                  <button
                    onClick={() => setShowFP(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.6rem 0.875rem', borderRadius: 12,
                      background: 'var(--teal-c)', border: '1px solid var(--teal)',
                      color: 'var(--teal)', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <MapPin size={15} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Location marked — tap to edit</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowFP(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.6rem 0.875rem', borderRadius: 12,
                      background: 'var(--card-b)', border: '2px dashed var(--border)',
                      color: 'var(--muted)', cursor: 'pointer',
                    }}
                  >
                    <MapPin size={15} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Mark location on floor plan</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ padding: '0.5rem 0.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {isLast && (
            <button
              onClick={handleComplete}
              disabled={completing}
              style={{
                width: '100%', padding: '1.1rem',
                background: completing ? 'var(--teal-c)' : 'var(--teal)',
                border: 'none', borderRadius: 16,
                color: '#fff', fontSize: '1.05rem', fontWeight: 800,
                cursor: completing ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                opacity: completing ? 0.8 : 1,
                transition: 'opacity 0.15s ease',
                touchAction: 'manipulation',
              }}
            >
              {completing
                ? <><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> {t('insp.run.completing')}</>
                : <><CheckCircle2 size={20} /> {t('insp.run.complete')}</>
              }
            </button>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
            <button
              onClick={() => navigate(-1)}
              disabled={currentIndex === 0}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                padding: '0.9rem',
                background: 'var(--card-b)', border: '1px solid var(--border)',
                borderRadius: 14, color: 'var(--fg)', fontSize: '0.95rem', fontWeight: 700,
                cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
                opacity: currentIndex === 0 ? 0.4 : 1,
                transition: 'opacity 0.15s ease', touchAction: 'manipulation',
              }}
            >
              <ArrowLeft size={18} /> {t('insp.run.prev')}
            </button>
            <button
              onClick={() => navigate(1)}
              disabled={isLast}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                padding: '0.9rem',
                background: isLast ? 'var(--card-b)' : 'var(--primary)',
                border: isLast ? '1px solid var(--border)' : 'none',
                borderRadius: 14, color: isLast ? 'var(--muted)' : '#fff',
                fontSize: '0.95rem', fontWeight: 700,
                cursor: isLast ? 'not-allowed' : 'pointer',
                opacity: isLast ? 0.4 : 1,
                transition: 'all 0.15s ease', touchAction: 'manipulation',
              }}
            >
              {t('insp.run.next')} <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Work Order Modal */}
      {showWO && propertyId && (
        <WorkOrderModal
          itemLabel={currentItem.label}
          itemId={currentId}
          inspectionId={id}
          propertyId={propertyId}
          team={team}
          onClose={() => setShowWO(false)}
          onCreated={() => {
            setShowWO(false)
            setWoCreated((prev) => new Set([...prev, currentId]))
          }}
        />
      )}

      {/* Floor Plan Modal */}
      {showFP && floorPlans.length > 0 && (
        <FloorPlanModal
          floorPlans={floorPlans}
          currentPin={state.pin}
          onClose={() => setShowFP(false)}
          onSave={(pin) => {
            setShowFP(false)
            updateItem(currentKey, { pin })
          }}
        />
      )}
    </>
  )
}
