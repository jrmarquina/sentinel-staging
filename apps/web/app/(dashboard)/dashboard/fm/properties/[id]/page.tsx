'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, MapPin, Loader2, AlertTriangle, Plus, ClipboardCheck, Wrench, Info, Camera, X, Navigation, Maximize2, Pencil, Trash2, LayoutTemplate } from 'lucide-react'
import { FmCard, FmBadge, FmButton, FmModal, FmModalFooter, statusVariant } from '@/components/fm'
import PropertyGallery from '@/components/fm/PropertyGallery'
import { useFmT, useLocale } from '@/lib/locale'
import { isPlusCodeLike, parsePlusCode } from '@/lib/plus-code'
import { useIsAdmin, useCanManage } from '@/hooks/useRole'

// ── MapView (SSR-disabled) ────────────────────────────────────────────────

const MapView = dynamic(
  () => import('@/components/map/MapView').then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: '100%', background: 'var(--card-b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
      </div>
    ),
  }
)

// ── Types ──────────────────────────────────────────────────────────────────

interface FmFloor       { id: string; name: string }
interface FmAssetSummary { id: string; name: string; code: string; category: string; condition: string; location: string | null; updated_at: string }
interface FmInspectionSummary { id: string; status: string; score: number | null; started_at: string | null; completed_at: string | null; fm_inspection_templates: { name: string } | null }
interface FmWorkOrderSummary  { id: string; title: string; status: string; priority: string; due_date: string | null }
interface FmAttachment { id: string; name: string; file_url: string | null; type: string }
interface FmProperty {
  id: string
  name: string
  code: string
  address: string | null
  status: string
  risk_level: string | null
  latitude: number | null
  longitude: number | null
  cover_image_url?: string | null
  fm_floors?: FmFloor[]
  fm_assets?: FmAssetSummary[]
  fm_inspections?: FmInspectionSummary[]
  fm_attachments?: FmAttachment[]
}

interface IntegrityData {
  score: number
  gaps: Array<{ type: string; message: string; severity: 'CRITICAL' | 'WARNING'; tab: string }>
}

type SubTab = 'overview' | 'assets' | 'inspections' | 'work-orders' | 'gallery' | 'floor-plans'

interface FloorPlan {
  id: string
  name: string
  floor_id?: string
  floor_name: string
  floor_level: number | null
  is_default: boolean
  url: string
  file_key: string
}

// ── Gradient helper ────────────────────────────────────────────────────────

const PROP_GRADIENTS = [
  'linear-gradient(145deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  'linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  'linear-gradient(145deg, #0d1b2a 0%, #1b263b 50%, #415a77 100%)',
  'linear-gradient(145deg, #10002b 0%, #240046 50%, #3c096c 100%)',
  'linear-gradient(145deg, #03071e 0%, #370617 50%, #6a040f 100%)',
  'linear-gradient(145deg, #004e92 0%, #000428 100%)',
  'linear-gradient(145deg, #134e5e 0%, #71b280 100%)',
]
function propGradient(id: string) {
  const n = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return PROP_GRADIENTS[n % PROP_GRADIENTS.length]
}

// ── Add Asset Modal ────────────────────────────────────────────────────────

function AddAssetModal({ propertyId, onClose, onSaved }: { propertyId: string; onClose: () => void; onSaved: () => void }) {
  const t = useFmT()
  const [form, setForm] = useState({ name: '', code: '', category: 'OTHER', condition: 'GOOD' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.code.trim()) { setErr('El nombre y el código son obligatorios'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/fm/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, code: form.code.toUpperCase(), property_id: propertyId }),
      })
      if (res.ok) { onSaved(); onClose() }
      else { const b = await res.json() as { error?: string }; setErr(b.error ?? t('error.generic')) }
    } finally { setSaving(false) }
  }

  return (
    <FmModal open onClose={onClose} title={t('prop.detail.addAsset')} subtitle="Registrar un activo en esta propiedad">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {err && <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--red)' }}>{err}</div>}
        <input className="fm-input" type="text" placeholder="Nombre *" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
        <input className="fm-input" type="text" placeholder="Código *" style={{ fontFamily: 'monospace', textTransform: 'uppercase' }} value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
        <select className="fm-input" style={{ appearance: 'none' }} value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
          {['ELECTRICAL','PLUMBING','HVAC','STRUCTURAL','FIRE_SAFETY','OTHER'].map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
        </select>
        <select className="fm-input" style={{ appearance: 'none' }} value={form.condition} onChange={(e) => setForm(f => ({ ...f, condition: e.target.value }))}>
          {['GOOD','FAIR','POOR'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <FmModalFooter>
          <FmButton type="button" variant="secondary" size="sm" onClick={onClose}>{t('cancel')}</FmButton>
          <FmButton type="submit" size="sm" loading={saving}>{t('prop.detail.addAsset')}</FmButton>
        </FmModalFooter>
      </form>
    </FmModal>
  )
}

// ── Edit Property Modal ────────────────────────────────────────────────────

function EditPropertyModal({ property, onClose, onSaved }: {
  property: FmProperty
  onClose: () => void
  onSaved: () => void
}) {
  const t = useFmT()
  const [form, setForm] = useState({
    name:       property.name,
    code:       property.code,
    address:    property.address ?? '',
    status:     property.status,
    risk_level: property.risk_level ?? '',
    latitude:   property.latitude  != null ? String(property.latitude)  : '',
    longitude:  property.longitude != null ? String(property.longitude) : '',
  })
  const [saving, setSaving]           = useState(false)
  const [err, setErr]                 = useState<string | null>(null)
  const [plusCode, setPlusCode]       = useState('')
  const [plusDecoding, setPlusDecoding] = useState(false)
  const [plusErr, setPlusErr]         = useState<string | null>(null)

  async function decodePlus() {
    const input = plusCode.trim()
    if (!input) return
    setPlusErr(null)
    setPlusDecoding(true)
    try {
      const result = await parsePlusCode(input)
      if (!result) throw new Error('Could not decode — check the plus code and try again')
      setForm(f => ({
        ...f,
        latitude:  result.lat.toFixed(7),
        longitude: result.lng.toFixed(7),
      }))
      setPlusCode('')
    } catch (e: unknown) {
      setPlusErr(e instanceof Error ? e.message : 'Decode failed')
    } finally {
      setPlusDecoding(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.code.trim()) { setErr('Name and code are required'); return }
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/fm/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       form.name.trim(),
          code:       form.code.trim().toUpperCase(),
          address:    form.address.trim() || null,
          status:     form.status,
          risk_level: form.risk_level || null,
          latitude:   form.latitude  ? parseFloat(form.latitude)  : null,
          longitude:  form.longitude ? parseFloat(form.longitude) : null,
        }),
      })
      if (!res.ok) {
        const b = await res.json() as { error?: string }
        throw new Error(b.error ?? t('error.generic'))
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t('error.generic'))
    } finally {
      setSaving(false)
    }
  }

  const inputLabel = (text: string) => (
    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>{text}</label>
  )

  return (
    <FmModal open onClose={onClose} title="Edit Property" subtitle="Update property information">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {err && (
          <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--red)' }}>
            {err}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            {inputLabel('Name *')}
            <input className="fm-input" type="text" value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            {inputLabel('Code *')}
            <input className="fm-input" type="text"
              style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
              value={form.code}
              onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} required />
          </div>
        </div>

        <div>
          {inputLabel('Address')}
          <input className="fm-input" type="text" value={form.address}
            onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            {inputLabel('Status')}
            <select className="fm-input" style={{ appearance: 'none' }} value={form.status}
              onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}>
              {['ACTIVE', 'MAINTENANCE', 'INACTIVE'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            {inputLabel('Risk Level')}
            <select className="fm-input" style={{ appearance: 'none' }} value={form.risk_level}
              onChange={(e) => setForm(f => ({ ...f, risk_level: e.target.value }))}>
              <option value="">— None —</option>
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {/* Plus Code decoder */}
        <div>
          {inputLabel('Plus Code')}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              className="fm-input"
              type="text"
              placeholder="e.g. VGGW+4W Guaynabo  or  J828VGGW+4W"
              value={plusCode}
              onChange={(e) => {
                setPlusCode(e.target.value)
                setPlusErr(null)
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); decodePlus() } }}
              style={{ flex: 1, fontFamily: 'monospace' }}
            />
            <button
              type="button"
              onClick={decodePlus}
              disabled={plusDecoding || !plusCode.trim()}
              style={{
                padding: '0 0.875rem',
                background: isPlusCodeLike(plusCode) ? 'var(--primary)' : 'var(--card-b)',
                color:      isPlusCodeLike(plusCode) ? '#fff'           : 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: 8, fontWeight: 600, fontSize: '0.8rem',
                cursor: plusDecoding || !plusCode.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {plusDecoding
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : '→ Decode'}
            </button>
          </div>
          {plusErr && (
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: 'var(--red)' }}>{plusErr}</p>
          )}
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.68rem', color: 'var(--muted)' }}>
            Decodes to lat / lng below. Short codes without a location suffix default to Guaynabo.
          </p>
        </div>

        {/* Lat / Lng */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            {inputLabel('Latitude')}
            <input className="fm-input" type="number" step="any" placeholder="18.3830"
              value={form.latitude}
              onChange={(e) => setForm(f => ({ ...f, latitude: e.target.value }))} />
          </div>
          <div>
            {inputLabel('Longitude')}
            <input className="fm-input" type="number" step="any" placeholder="-66.0858"
              value={form.longitude}
              onChange={(e) => setForm(f => ({ ...f, longitude: e.target.value }))} />
          </div>
        </div>

        <FmModalFooter>
          <FmButton type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</FmButton>
          <FmButton type="submit" size="sm" loading={saving}>Save Changes</FmButton>
        </FmModalFooter>
      </form>
    </FmModal>
  )
}

// ── Tab Button ─────────────────────────────────────────────────────────────

function Tab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.5rem 1rem', background: 'none', border: 'none',
        borderBottom: `2px solid ${active ? 'var(--primary)' : 'transparent'}`,
        color: active ? 'var(--primary)' : 'var(--muted)',
        fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
        transition: 'color 0.15s ease, border-color 0.15s ease',
        whiteSpace: 'nowrap', marginBottom: -1,
      }}
    >
      {label}
      <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', opacity: 0.7 }}>({count})</span>
    </button>
  )
}

// ── Info Tile ──────────────────────────────────────────────────────────────

function InfoTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.875rem 1rem' }}>
      <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: '0.3rem' }}>{label}</p>
      <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--fg)', margin: 0 }}>{value}</p>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FMPropertyDetailPage() {
  const t = useFmT()
  const { locale } = useLocale()
  const params   = useParams()
  const router   = useRouter()
  const id       = Array.isArray(params.id) ? params.id[0] : (params.id as string)
  const isAdmin     = useIsAdmin()
  const canManage   = useCanManage()

  const [property, setProperty]     = useState<FmProperty | null>(null)
  const [workOrders, setWorkOrders] = useState<FmWorkOrderSummary[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [activeTab, setActiveTab]   = useState<SubTab>('overview')
  const [showAddAsset, setShowAddAsset]   = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [integrity, setIntegrity]   = useState<IntegrityData | null>(null)
  const [scoreWidth, setScoreWidth] = useState(0)

  // Floor plans
  const [floorPlans, setFloorPlans]           = useState<FloorPlan[]>([])
  const [floorPlansLoaded, setFloorPlansLoaded] = useState(false)
  const [floorPlansLoading, setFloorPlansLoading] = useState(false)
  const [fpUploadName, setFpUploadName]       = useState('')
  const [fpUploadLevel, setFpUploadLevel]     = useState('')
  const [fpUploading, setFpUploading]         = useState(false)
  const [fpError, setFpError]                 = useState<string | null>(null)
  const fpFileRef = useRef<HTMLInputElement>(null)

  // Cover image upload
  const [coverUploading, setCoverUploading]     = useState(false)
  const [coverError, setCoverError]             = useState<string | null>(null)
  const [coverLightboxOpen, setCoverLightboxOpen] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([
      fetch(`/api/fm/properties/${id}`).then((r) => {
        if (!r.ok) throw new Error(t('prop.detail.notFound'))
        return r.json() as Promise<FmProperty>
      }),
      fetch(`/api/fm/work-orders?propertyId=${id}`).then((r) =>
        r.ok ? (r.json() as Promise<FmWorkOrderSummary[]>) : Promise.resolve([])
      ),
    ])
      .then(([prop, wos]) => { setProperty(prop); setWorkOrders(wos) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t('error.generic')))
      .finally(() => setLoading(false))
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/fm/properties/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete property')
      router.push('/dashboard/fm/properties')
    } catch {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  useEffect(() => { load() }, [id])

  // Refresh counts when the tab regains focus (e.g. user returns from a
  // detail page where they added an asset / inspection / WO).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Close cover lightbox on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCoverLightboxOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverError(null)
    setCoverUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/fm/properties/${id}/image`, { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? t('error.generic'))
      }
      load() // refresh property to show new cover_image_url
    } catch (err: unknown) {
      setCoverError(err instanceof Error ? err.message : t('error.generic'))
    } finally {
      setCoverUploading(false)
      e.target.value = ''
    }
  }

  async function handleCoverDelete() {
    setCoverError(null)
    setCoverUploading(true)
    try {
      await fetch(`/api/fm/properties/${id}/image`, { method: 'DELETE' })
      load()
    } catch {
      setCoverError(t('error.generic'))
    } finally {
      setCoverUploading(false)
    }
  }

  async function loadFloorPlans() {
    setFloorPlansLoading(true)
    try {
      const r = await fetch(`/api/fm/properties/${id}/floor-plans`)
      if (r.ok) setFloorPlans(await r.json() as FloorPlan[])
    } finally {
      setFloorPlansLoading(false)
      setFloorPlansLoaded(true)
    }
  }

  async function handleFloorPlanUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !fpUploadName.trim()) return
    setFpError(null)
    setFpUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('floor_name', fpUploadName.trim())
      if (fpUploadLevel.trim()) fd.append('floor_level', fpUploadLevel.trim())
      const r = await fetch(`/api/fm/properties/${id}/floor-plans`, { method: 'POST', body: fd })
      if (!r.ok) {
        const b = await r.json() as { error?: string }
        throw new Error(b.error ?? t('error.generic'))
      }
      const plan = await r.json() as FloorPlan
      setFloorPlans(prev => [...prev, plan])
      setFpUploadName('')
      setFpUploadLevel('')
    } catch (err: unknown) {
      setFpError(err instanceof Error ? err.message : t('error.generic'))
    } finally {
      setFpUploading(false)
      if (fpFileRef.current) fpFileRef.current.value = ''
    }
  }

  async function handleFloorPlanDelete(planId: string) {
    setFpError(null)
    try {
      const r = await fetch(`/api/fm/properties/${id}/floor-plans?planId=${planId}`, { method: 'DELETE' })
      if (!r.ok) {
        const b = await r.json() as { error?: string }
        throw new Error(b.error ?? t('error.generic'))
      }
      setFloorPlans(prev => prev.filter(p => p.id !== planId))
    } catch (err: unknown) {
      setFpError(err instanceof Error ? err.message : t('error.generic'))
    }
  }

  // Load integrity data separately
  useEffect(() => {
    fetch(`/api/fm/properties/${id}/integrity`)
      .then((r) => r.ok ? (r.json() as Promise<IntegrityData>) : null)
      .then((d) => { if (d) setIntegrity(d) })
      .catch(() => { /* integrity is optional */ })
  }, [id])

  // Animate the integrity score bar
  useEffect(() => {
    if (integrity) {
      const timer = setTimeout(() => setScoreWidth(integrity.score), 100)
      return () => clearTimeout(timer)
    }
  }, [integrity])

  // Lazy-load floor plans when the tab is first activated
  useEffect(() => {
    if (activeTab === 'floor-plans' && !floorPlansLoaded) {
      loadFloorPlans()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}><Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} /></div>
  }

  if (error || !property) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 0' }}>
        <AlertTriangle size={28} style={{ color: 'var(--red)', margin: '0 auto 0.75rem' }} />
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>{error ?? t('prop.detail.notFound')}</p>
        <FmButton variant="secondary" size="sm" onClick={() => router.push('/dashboard/fm/properties')}>
          {t('prop.detail.backBtn')}
        </FmButton>
      </div>
    )
  }

  const assets      = property.fm_assets      ?? []
  const inspections = property.fm_inspections ?? []
  const attachments = property.fm_attachments ?? []

  const TABS: { value: SubTab; label: string; count: number }[] = [
    { value: 'overview',     label: t('prop.detail.tab.overview'),    count: 0 },
    { value: 'assets',       label: t('prop.detail.tab.assets'),      count: assets.length },
    { value: 'inspections',  label: t('prop.detail.tab.insp'),        count: inspections.length },
    { value: 'work-orders',  label: t('prop.detail.tab.wo'),          count: workOrders.length },
    { value: 'gallery',      label: t('prop.detail.tab.gallery'),     count: attachments.length },
    { value: 'floor-plans',  label: 'Floor Plans',                    count: floorPlansLoaded ? floorPlans.length : 0 },
  ]

  const propVariant = statusVariant(property.status)
  const heroBg = property.cover_image_url
    ? `url(${property.cover_image_url}) center/cover no-repeat`
    : propGradient(property.id)

  const mapMarkers = (property.latitude != null && property.longitude != null) ? [{
    id: property.id,
    lat: property.latitude,
    lng: property.longitude,
    color: property.status === 'ACTIVE' ? '#34d399' : property.status === 'INACTIVE' ? '#fb7185' : '#fbbf24',
    label: property.name,
  }] : []

  const dateLocale = locale === 'es' ? 'es-PR' : 'en-US'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Back + title */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
        <button onClick={() => router.push('/dashboard/fm/properties')}
          style={{ marginTop: 3, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', transition: 'color 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>{property.name}</h1>
            <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', fontWeight: 700, background: 'var(--primary-c)', color: 'var(--primary)', padding: '0.2rem 0.5rem', borderRadius: 9999 }}>
              {property.code}
            </span>
            <FmBadge variant={propVariant}>{property.status}</FmBadge>
            <button
              onClick={() => setShowEditModal(true)}
              title="Edit property"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.3rem 0.65rem',
                background: 'var(--card-b)', border: '1px solid var(--border)',
                borderRadius: 7, color: 'var(--muted)', cursor: 'pointer',
                fontSize: '0.72rem', fontWeight: 600,
                transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)'; e.currentTarget.style.borderColor = 'var(--primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <Pencil size={11} /> Edit
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete property"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.3rem 0.65rem',
                  background: 'var(--card-b)', border: '1px solid var(--border)',
                  borderRadius: 7, color: 'var(--muted)', cursor: 'pointer',
                  fontSize: '0.72rem', fontWeight: 600,
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <Trash2 size={11} /> Delete
              </button>
            )}
          </div>
          {property.address && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
              <MapPin size={13} /> {property.address}
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>

        {/* Left column */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Hero */}
          <div style={{ height: 260, borderRadius: 16, overflow: 'hidden', position: 'relative', background: heroBg, flexShrink: 0 }}>
            {/* Dark overlay at bottom */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)', pointerEvents: 'none' }} />
            {/* Property name + address overlay */}
            <div style={{ position: 'absolute', bottom: '1.25rem', left: '1.25rem', pointerEvents: 'none' }}>
              <p style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{property.name}</p>
              {property.address && (
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>{property.address}</p>
              )}
            </div>
            {/* Top-right: zoom button (when image exists) + status badge */}
            <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', zIndex: 2 }}>
              {property.cover_image_url && (
                <button
                  onClick={() => setCoverLightboxOpen(true)}
                  title="View full image"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 30, height: 30,
                    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                    color: '#fff', borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer', transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.75)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.55)' }}
                >
                  <Maximize2 size={13} />
                </button>
              )}
              <FmBadge variant={propVariant}>{property.status}</FmBadge>
            </div>
            {/* Cover image upload controls — top-left */}
            <div style={{ position: 'absolute', top: '0.75rem', left: '0.75rem', display: 'flex', gap: '0.4rem', zIndex: 2 }}>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.35rem 0.65rem',
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                color: '#fff', borderRadius: 8, fontSize: '0.72rem', fontWeight: 600,
                cursor: coverUploading ? 'wait' : 'pointer', border: '1px solid rgba(255,255,255,0.2)',
                transition: 'background 0.15s ease',
              }}>
                {coverUploading
                  ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Camera size={12} />}
                {property.cover_image_url ? t('prop.detail.changePhoto') : t('prop.detail.uploadPhoto')}
                <input
                  type="file" accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleCoverUpload}
                  disabled={coverUploading}
                />
              </label>
              {property.cover_image_url && !coverUploading && (
                <button
                  onClick={handleCoverDelete}
                  title={t('prop.detail.removePhoto')}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 30, height: 30,
                    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                    color: 'rgba(255,255,255,0.8)', borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer', transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220,38,38,0.7)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.55)' }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {/* Upload error */}
            {coverError && (
              <div style={{ position: 'absolute', bottom: '1.25rem', right: '0.75rem', background: 'rgba(220,38,38,0.85)', color: '#fff', fontSize: '0.72rem', fontWeight: 600, padding: '0.3rem 0.6rem', borderRadius: 6, maxWidth: 240 }}>
                {coverError}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div>
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '1.25rem', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex' }}>
                {TABS.map((tab) => <Tab key={tab.value} label={tab.label} count={tab.count} active={activeTab === tab.value} onClick={() => setActiveTab(tab.value)} />)}
              </div>
              <div style={{ paddingBottom: '0.5rem' }}>
                {activeTab === 'assets' && (
                  <FmButton icon={<Plus size={13} />} size="sm" onClick={() => setShowAddAsset(true)}>
                    {t('prop.detail.addAsset')}
                  </FmButton>
                )}
                {activeTab === 'inspections' && (
                  <Link href="/dashboard/fm/inspections" style={{ textDecoration: 'none' }}>
                    <FmButton icon={<Plus size={13} />} size="sm">{t('prop.detail.startInsp')}</FmButton>
                  </Link>
                )}
              </div>
            </div>

            {/* Overview tab */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Info tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
                  <InfoTile label={t('prop.detail.tile.assets')}  value={assets.length} />
                  <InfoTile label={t('prop.detail.tile.insp')}    value={inspections.length} />
                  <InfoTile label={t('prop.detail.tile.wo')}      value={workOrders.length} />
                  <InfoTile label={t('prop.detail.tile.docs')}    value={attachments.length} />
                  {property.risk_level && <InfoTile label={t('prop.detail.tile.risk')} value={<FmBadge variant={statusVariant(property.risk_level)}>{property.risk_level}</FmBadge>} />}
                  {property.latitude != null && property.longitude != null && (
                    <InfoTile label="GPS" value={<span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{property.latitude.toFixed(4)}, {property.longitude.toFixed(4)}</span>} />
                  )}
                </div>

                {/* MapView */}
                {property.latitude != null && property.longitude != null && (
                  <div style={{ position: 'relative', height: 280, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                    <MapView
                      markers={mapMarkers}
                      center={{ lat: property.latitude, lng: property.longitude }}
                      zoom={15}
                      showOutsideOverlay={false}
                    />
                    {/* "Get Directions" button — opens Google Maps in the
                        appropriate app (native on iOS/Android, web on
                        desktop). Falls back gracefully on any browser. */}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${property.latitude},${property.longitude}&travelmode=driving`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t('prop.detail.directions')}
                      style={{
                        position: 'absolute', top: 10, right: 10, zIndex: 5,
                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.5rem 0.75rem',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        color: 'var(--fg)',
                        textDecoration: 'none',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                      }}
                    >
                      <Navigation size={14} style={{ color: 'var(--primary)' }} />
                      {t('prop.detail.directions')}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Assets tab */}
            {activeTab === 'assets' && (
              <FmCard style={{ padding: 0, overflow: 'hidden' }}>
                {assets.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
                    <Wrench size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
                    {t('prop.detail.assetEmpty')}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="fm-table">
                      <thead><tr><th>{t('asset.col.name')}</th><th>{t('asset.col.category')}</th><th>{t('asset.form.location')}</th><th>{t('asset.col.condition')}</th></tr></thead>
                      <tbody>
                        {assets.map((a) => (
                          <tr key={a.id} onClick={() => router.push(`/dashboard/fm/assets/${a.id}`)} style={{ cursor: 'pointer' }}>
                            <td><p style={{ fontWeight: 600, color: 'var(--fg)', margin: 0 }}>{a.name}</p><p style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--muted)', margin: 0 }}>{a.code}</p></td>
                            <td><span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{a.category.replace(/_/g,' ')}</span></td>
                            <td><span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{a.location ?? '—'}</span></td>
                            <td><FmBadge variant={statusVariant(a.condition)}>{a.condition}</FmBadge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </FmCard>
            )}

            {/* Inspections tab */}
            {activeTab === 'inspections' && (
              <FmCard style={{ padding: 0, overflow: 'hidden' }}>
                {inspections.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
                    <ClipboardCheck size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
                    {t('prop.detail.inspEmpty')}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="fm-table">
                      <thead><tr><th>{t('insp.fm.col.template')}</th><th>{t('insp.fm.col.status')}</th><th>{t('insp.fm.col.score')}</th><th>{t('insp.fm.col.date')}</th></tr></thead>
                      <tbody>
                        {inspections.map((insp) => (
                          <tr key={insp.id} onClick={() => router.push(`/dashboard/fm/inspections/${insp.id}`)} style={{ cursor: 'pointer' }}>
                            <td style={{ fontWeight: 500, color: 'var(--fg)' }}>{insp.fm_inspection_templates?.name ?? '—'}</td>
                            <td><FmBadge variant={statusVariant(insp.status)}>{insp.status.replace(/_/g,' ')}</FmBadge></td>
                            <td style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>{insp.score != null ? `${insp.score}%` : '—'}</td>
                            <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{insp.started_at ? new Date(insp.started_at).toLocaleDateString(dateLocale) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </FmCard>
            )}

            {/* Work Orders tab */}
            {activeTab === 'work-orders' && (
              <FmCard style={{ padding: 0, overflow: 'hidden' }}>
                {workOrders.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
                    <Wrench size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
                    {t('prop.detail.woEmpty')}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="fm-table">
                      <thead><tr><th>{t('wo.fm.form.title')}</th><th>{t('wo.fm.form.priority')}</th><th>{t('insp.fm.col.status')}</th><th>{t('wo.fm.form.dueDate')}</th></tr></thead>
                      <tbody>
                        {workOrders.map((wo) => {
                          const isOverdue = wo.due_date && new Date(wo.due_date) < new Date() && wo.status !== 'COMPLETED'
                          return (
                            <tr key={wo.id}
                              onClick={() => router.push(`/dashboard/fm/work-orders?focus=${wo.id}`)}
                              style={{ cursor: 'pointer', background: isOverdue ? 'var(--red-c)' : undefined }}>
                              <td style={{ fontWeight: 600, color: isOverdue ? 'var(--red)' : 'var(--fg)' }}>{wo.title}</td>
                              <td><FmBadge variant={statusVariant(wo.priority)}>{wo.priority}</FmBadge></td>
                              <td><FmBadge variant={statusVariant(wo.status)}>{wo.status.replace(/_/g,' ')}</FmBadge></td>
                              <td style={{ fontSize: '0.8rem', color: isOverdue ? 'var(--red)' : 'var(--muted)', fontWeight: isOverdue ? 700 : 400 }}>
                                {wo.due_date ? new Date(wo.due_date).toLocaleDateString(dateLocale) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </FmCard>
            )}

            {/* Gallery tab */}
            {activeTab === 'gallery' && (
              <FmCard style={{ padding: '1.25rem' }}>
                <PropertyGallery propertyId={id as string} onChange={load} />
              </FmCard>
            )}

            {/* Floor Plans tab */}
            {activeTab === 'floor-plans' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                {/* Upload form */}
                {canManage && (
                  <FmCard style={{ padding: '1.25rem' }}>
                    <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', margin: '0 0 0.875rem' }}>
                      Upload Floor Plan
                    </p>
                    {fpError && (
                      <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--red)', marginBottom: '0.75rem' }}>
                        {fpError}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                          Floor Name <span style={{ color: 'var(--red)' }}>*</span>
                        </label>
                        <input
                          className="fm-input"
                          type="text"
                          placeholder="e.g. Ground Floor"
                          value={fpUploadName}
                          onChange={(e) => setFpUploadName(e.target.value)}
                          disabled={fpUploading}
                        />
                      </div>
                      <div style={{ flex: '0 1 100px', minWidth: 80 }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                          Level #
                        </label>
                        <input
                          className="fm-input"
                          type="number"
                          placeholder="0"
                          value={fpUploadLevel}
                          onChange={(e) => setFpUploadLevel(e.target.value)}
                          disabled={fpUploading}
                        />
                      </div>
                      <div>
                        <label style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                          padding: '0.45rem 0.875rem',
                          background: fpUploadName.trim() ? 'var(--primary)' : 'var(--card-b)',
                          color: fpUploadName.trim() ? '#fff' : 'var(--muted)',
                          border: '1px solid var(--border)',
                          borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                          cursor: fpUploading || !fpUploadName.trim() ? 'not-allowed' : 'pointer',
                          transition: 'background 0.15s, color 0.15s',
                          opacity: fpUploadName.trim() ? 1 : 0.6,
                          whiteSpace: 'nowrap',
                        }}>
                          {fpUploading
                            ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Uploading…</>
                            : <><Camera size={13} /> Choose Image</>}
                          <input
                            ref={fpFileRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            style={{ display: 'none' }}
                            disabled={fpUploading || !fpUploadName.trim()}
                            onChange={handleFloorPlanUpload}
                          />
                        </label>
                      </div>
                    </div>
                    <p style={{ fontSize: '0.68rem', color: 'var(--muted)', margin: '0.5rem 0 0' }}>
                      JPEG, PNG or WebP · max 20 MB. Multiple plans per floor are supported.
                    </p>
                  </FmCard>
                )}

                {/* Existing floor plans */}
                {floorPlansLoading ? (
                  <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--muted)' }}>
                    <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem', display: 'block' }} />
                  </div>
                ) : floorPlans.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--muted)', fontSize: '0.875rem' }}>
                    <LayoutTemplate size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
                    No floor plans uploaded yet. Use the form above to add one.
                  </div>
                ) : (
                  (() => {
                    // Group by floor_name
                    const groups = floorPlans.reduce<Record<string, FloorPlan[]>>((acc, plan) => {
                      const key = plan.floor_name
                      if (!acc[key]) acc[key] = []
                      acc[key].push(plan)
                      return acc
                    }, {})
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {Object.entries(groups)
                          .sort(([, a], [, b]) => (a[0].floor_level ?? 0) - (b[0].floor_level ?? 0))
                          .map(([floorName, plans]) => (
                            <FmCard key={floorName} style={{ padding: '1rem' }}>
                              <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', margin: '0 0 0.75rem' }}>
                                {floorName}
                                {plans[0].floor_level != null && (
                                  <span style={{ marginLeft: '0.4rem', fontWeight: 400 }}>— Level {plans[0].floor_level}</span>
                                )}
                              </p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                {plans.map((plan) => (
                                  <div key={plan.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--card-b)' }}>
                                    <a href={plan.url} target="_blank" rel="noopener noreferrer">
                                      <img
                                        src={plan.url}
                                        alt={plan.name}
                                        style={{ width: 200, height: 140, objectFit: 'cover', display: 'block' }}
                                      />
                                    </a>
                                    <div style={{ padding: '0.4rem 0.6rem', fontSize: '0.7rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{plan.name}</span>
                                      {canManage && (
                                        <button
                                          onClick={() => handleFloorPlanDelete(plan.id)}
                                          title="Delete floor plan"
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'inline-flex', padding: 0, flexShrink: 0, transition: 'color 0.15s' }}
                                          onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </FmCard>
                          ))}
                      </div>
                    )
                  })()
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column — Integrity Sidebar */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--primary)30',
            borderRadius: 16,
            padding: '1.25rem',
            boxShadow: 'var(--shadow)',
          }}>
            {/* Header */}
            <p style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--primary)', margin: '0 0 1rem' }}>
              {t('prop.detail.integrity')}
            </p>

            {integrity == null ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--muted)', fontSize: '0.8rem' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem', display: 'block' }} />
                {t('loading')}
              </div>
            ) : (
              <>
                {/* Score */}
                <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--fg)', margin: '0 0 0.5rem', lineHeight: 1 }}>
                  {integrity.score}%
                </p>

                {/* Progress bar */}
                <div style={{ height: 8, borderRadius: 9999, background: 'var(--card-b)', marginBottom: '1.25rem', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    borderRadius: 9999,
                    background: integrity.score >= 70 ? 'var(--primary)' : 'var(--red)',
                    width: `${scoreWidth}%`,
                    transition: 'width 1s ease-out',
                  }} />
                </div>

                {/* Gap items */}
                {integrity.gaps.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', padding: '0.75rem 0' }}>{t('prop.detail.noIssues')}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {integrity.gaps.map((gap, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                        padding: '0.625rem 0.75rem',
                        background: gap.severity === 'CRITICAL' ? 'var(--red-c)' : 'var(--amber-c)',
                        border: `1px solid ${gap.severity === 'CRITICAL' ? 'var(--red)' : 'var(--amber)'}30`,
                        borderRadius: 10,
                      }}>
                        {gap.severity === 'CRITICAL'
                          ? <AlertTriangle size={14} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
                          : <Info size={14} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.75rem', color: 'var(--fg)', margin: '0 0 0.35rem', lineHeight: 1.4 }}>{gap.message}</p>
                          <button
                            onClick={() => setActiveTab(gap.tab as SubTab)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: '0.68rem', fontWeight: 700,
                              color: gap.severity === 'CRITICAL' ? 'var(--red)' : 'var(--amber)',
                              padding: 0, textDecoration: 'underline',
                            }}
                          >
                            {t('prop.detail.fix')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showAddAsset  && <AddAssetModal propertyId={property.id} onClose={() => setShowAddAsset(false)} onSaved={load} />}
      {showEditModal && <EditPropertyModal property={property} onClose={() => setShowEditModal(false)} onSaved={load} />}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <FmModal open onClose={() => !deleting && setShowDeleteConfirm(false)} title="Delete Property" subtitle="This action cannot be undone">
          <div style={{ padding: '0.25rem 0 1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={16} style={{ color: '#ef4444' }} />
              </div>
              <div>
                <p style={{ margin: '0 0 0.35rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--fg)' }}>
                  Delete &ldquo;{property.name}&rdquo;?
                </p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                  The property record will be archived and removed from all lists. Associated assets, inspections, and work orders will remain in the database but will no longer be accessible through this property.
                </p>
              </div>
            </div>
          </div>
          <FmModalFooter>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-b)', color: 'var(--fg)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ padding: '0.5rem 1.1rem', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem', opacity: deleting ? 0.7 : 1 }}
            >
              {deleting ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</> : <><Trash2 size={13} /> Delete Property</>}
            </button>
          </FmModalFooter>
        </FmModal>
      )}

      {/* Cover image lightbox — rendered into document.body via portal so it
          escapes any parent transform/overflow stacking context */}
      {coverLightboxOpen && property.cover_image_url && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
          onClick={() => setCoverLightboxOpen(false)}
        >
          {/* Close button */}
          <button
            onClick={() => setCoverLightboxOpen(false)}
            style={{
              position: 'absolute', top: '1.25rem', right: '1.25rem',
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8, color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 40, height: 40,
              backdropFilter: 'blur(8px)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
          {/* Full image — stop propagation so clicking it doesn't close */}
          <img
            src={property.cover_image_url}
            alt={property.name}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: 8,
              boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              cursor: 'default',
            }}
          />
        </div>,
        document.body
      )}
    </div>
  )
}
