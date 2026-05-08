'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, MapPin, Loader2, AlertTriangle, Plus, ClipboardCheck, Wrench, Info, Camera, X } from 'lucide-react'
import { FmCard, FmBadge, FmButton, FmModal, FmModalFooter, statusVariant } from '@/components/fm'
import PropertyGallery from '@/components/fm/PropertyGallery'
import { useFmT, useLocale } from '@/lib/locale'

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

type SubTab = 'overview' | 'assets' | 'inspections' | 'work-orders' | 'gallery'

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

  const [property, setProperty]     = useState<FmProperty | null>(null)
  const [workOrders, setWorkOrders] = useState<FmWorkOrderSummary[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [activeTab, setActiveTab]   = useState<SubTab>('overview')
  const [showAddAsset, setShowAddAsset] = useState(false)
  const [integrity, setIntegrity]   = useState<IntegrityData | null>(null)
  const [scoreWidth, setScoreWidth] = useState(0)

  // Cover image upload
  const [coverUploading, setCoverUploading] = useState(false)
  const [coverError, setCoverError]         = useState<string | null>(null)

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

  useEffect(() => { load() }, [id])

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
    { value: 'overview',     label: t('prop.detail.tab.overview'), count: 0 },
    { value: 'assets',       label: t('prop.detail.tab.assets'),   count: assets.length },
    { value: 'inspections',  label: t('prop.detail.tab.insp'),     count: inspections.length },
    { value: 'work-orders',  label: t('prop.detail.tab.wo'),       count: workOrders.length },
    { value: 'gallery',      label: t('prop.detail.tab.gallery'),  count: 0 },
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
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)' }} />
            {/* Property name + address overlay */}
            <div style={{ position: 'absolute', bottom: '1.25rem', left: '1.25rem' }}>
              <p style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{property.name}</p>
              {property.address && (
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>{property.address}</p>
              )}
            </div>
            {/* Status badge top-right */}
            <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', backdropFilter: 'blur(8px)' }}>
              <FmBadge variant={propVariant}>{property.status}</FmBadge>
            </div>
            {/* Cover image upload controls — top-left */}
            <div style={{ position: 'absolute', top: '0.75rem', left: '0.75rem', display: 'flex', gap: '0.4rem' }}>
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
                  <div style={{ height: 280, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                    <MapView
                      markers={mapMarkers}
                      center={{ lat: property.latitude, lng: property.longitude }}
                      zoom={15}
                      showOutsideOverlay={false}
                    />
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
                <PropertyGallery propertyId={id as string} />
              </FmCard>
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

      {showAddAsset && <AddAssetModal propertyId={property.id} onClose={() => setShowAddAsset(false)} onSaved={load} />}
    </div>
  )
}
