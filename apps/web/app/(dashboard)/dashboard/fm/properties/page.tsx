'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  Plus, Search, MapPin,
  Loader2, AlertTriangle, X, Building2,
} from 'lucide-react'
import {
  FmCard, FmBadge, FmButton, FmModal,
  FmModalFooter, FmInput,
} from '@/components/fm'
import { useFmT } from '@/lib/locale'

// ── Types ──────────────────────────────────────────────────────────────────

interface FmProperty {
  id: string
  name: string
  code: string
  address: string | null
  status: string
  latitude: number | null
  longitude: number | null
  cover_image_url?: string | null
  fm_assets?: Array<{ id: string }>
  fm_inspections?: Array<{ id: string }>
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

interface NewPropertyForm {
  name: string; code: string; address: string; coordinates: string
}

const EMPTY_FORM: NewPropertyForm = { name: '', code: '', address: '', coordinates: '' }

const STATUS_FILTERS = ['ALL', 'ACTIVE', 'MAINTENANCE', 'INACTIVE'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

// ── Property Card ──────────────────────────────────────────────────────────

function PropertyCard({ prop }: { prop: FmProperty }) {
  const t = useFmT()
  const assetCount  = prop.fm_assets?.length      ?? 0
  const inspCount   = prop.fm_inspections?.length ?? 0
  const [hovered, setHovered] = useState(false)

  const badgeVariant =
    prop.status === 'ACTIVE'      ? 'success' as const :
    prop.status === 'MAINTENANCE' ? 'warning' as const : 'danger' as const

  const bgImage = prop.cover_image_url
    ? `url(${prop.cover_image_url}) center/cover no-repeat`
    : propGradient(prop.id)

  return (
    <Link
      href={`/dashboard/fm/properties/${prop.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        overflow: 'hidden',
        borderRadius: 16,
        border: '1px solid var(--border)',
        background: 'var(--card)',
        cursor: 'pointer',
        transform: hovered ? 'translateY(-4px)' : 'none',
        boxShadow: hovered ? 'var(--shadow-lg)' : 'var(--shadow)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}>
        {/* Image / gradient header */}
        <div style={{ height: 160, background: bgImage, position: 'relative' }}>
          {/* Status badge — top right */}
          <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', backdropFilter: 'blur(8px)' }}>
            <FmBadge variant={badgeVariant}>{prop.status}</FmBadge>
          </div>
          {/* Code badge — bottom left */}
          <div style={{
            position: 'absolute', bottom: '0.75rem', left: '0.75rem',
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
            borderRadius: 6, padding: '0.15rem 0.5rem',
            fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.85)',
          }}>
            {prop.code}
          </div>
          {/* Building icon texture (no-image only) */}
          {!prop.cover_image_url && (
            <div style={{ position: 'absolute', bottom: '0.5rem', right: '0.75rem', opacity: 0.1 }}>
              <Building2 size={48} color="#fff" />
            </div>
          )}
        </div>

        {/* Content area */}
        <div style={{ padding: '1rem 1.25rem' }}>
          {/* Name + address */}
          <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {prop.name}
          </p>
          {prop.address && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <MapPin size={11} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prop.address}</span>
            </div>
          )}

          {/* Stats row */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', paddingTop: '0.625rem', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'var(--card-b)', color: 'var(--muted)', padding: '0.2rem 0.5rem', borderRadius: 9999, border: '1px solid var(--border)' }}>
              {assetCount} {assetCount !== 1 ? t('prop.assets_plural') : t('prop.assets')}
            </span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'var(--card-b)', color: 'var(--muted)', padding: '0.2rem 0.5rem', borderRadius: 9999, border: '1px solid var(--border)' }}>
              {inspCount} {inspCount !== 1 ? t('prop.inspections_plural') : t('prop.inspections')}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FMPropertiesPage() {
  const t = useFmT()
  const [properties, setProperties] = useState<FmProperty[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [showModal, setShowModal]   = useState(false)
  const [form, setForm]             = useState<NewPropertyForm>(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  function load() {
    setLoading(true)
    fetch('/api/fm/properties')
      .then((r) => {
        if (!r.ok) throw new Error(t('prop.error'))
        return r.json() as Promise<FmProperty[]>
      })
      .then(setProperties)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Refresh when the user returns to this tab — covers cases where they
  // edited a property in detail view and come back to the list.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (showModal) setTimeout(() => nameRef.current?.focus(), 50) }, [showModal])

  // Filter
  const filtered = properties.filter((p) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.address ?? '').toLowerCase().includes(q)
    const matchStatus = statusFilter === 'ALL' || p.status === statusFilter
    return matchSearch && matchStatus
  })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.name.trim()) { setFormError(t('prop.err.name')); return }
    if (!form.code.trim()) { setFormError(t('prop.err.code')); return }

    let latitude: number | null = null
    let longitude: number | null = null
    if (form.coordinates.trim()) {
      const parts = form.coordinates.split(',').map((s) => s.trim())
      if (parts.length !== 2 || isNaN(Number(parts[0])) || isNaN(Number(parts[1]))) {
        setFormError(t('prop.err.coords'))
        return
      }
      latitude  = Number(parts[0])
      longitude = Number(parts[1])
    }

    setSaving(true)
    try {
      const res = await fetch('/api/fm/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          address: form.address.trim() || null,
          latitude, longitude,
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Error al crear la propiedad')
      }
      setForm(EMPTY_FORM)
      setShowModal(false)
      load()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  // ── Status counts for filter pills ────────────────────────────────────
  const counts = properties.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>{t('prop.title')}</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
            {properties.length} {t('prop.title').toLowerCase()}
          </p>
        </div>
        <FmButton icon={<Plus size={15} />} onClick={() => setShowModal(true)} size="sm">
          {t('prop.newBtn')}
        </FmButton>
      </div>

      {/* Search + Status filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder={t('prop.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="fm-input"
            style={{ paddingLeft: '2.25rem' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s
            const count  = s === 'ALL' ? properties.length : (counts[s] ?? 0)
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: 9999,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                  background: active ? 'var(--primary-c)' : 'var(--card-b)',
                  color: active ? 'var(--primary)' : 'var(--muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                }}
              >
                {t(`prop.status.${s}` as Parameters<typeof t>[0])}
                <span style={{ opacity: 0.7, fontWeight: 800 }}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
          <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--red)' }}>
          <AlertTriangle size={28} style={{ margin: '0 auto 0.75rem' }} />
          <p style={{ fontSize: '0.875rem' }}>{error}</p>
          <FmButton variant="secondary" size="sm" onClick={load} style={{ marginTop: '1rem' }}>{t('retry')}</FmButton>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--muted)' }}>
          <Building2 size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
          <p style={{ fontSize: '0.875rem' }}>
            {search || statusFilter !== 'ALL' ? t('prop.emptyFiltered') : t('prop.empty')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {filtered.map((prop) => <PropertyCard key={prop.id} prop={prop} />)}
        </div>
      )}

      {/* Create Modal */}
      <FmModal
        open={showModal}
        onClose={() => { setShowModal(false); setForm(EMPTY_FORM); setFormError(null) }}
        title={t('prop.form.modalTitle')}
        subtitle={t('prop.form.modalSub')}
      >
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {formError && (
            <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.8rem', color: 'var(--red)' }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                {t('prop.form.name')} <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                ref={nameRef}
                className="fm-input"
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Alcaldía Municipal de Guaynabo"
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                {t('prop.form.code')} <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                className="fm-input"
                style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                type="text"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="GMH-001"
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                {t('prop.form.coords')} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>({t('optional')})</span>
              </label>
              <input
                className="fm-input"
                style={{ fontFamily: 'monospace' }}
                type="text"
                value={form.coordinates}
                onChange={(e) => setForm((f) => ({ ...f, coordinates: e.target.value }))}
                placeholder={t('prop.form.coordsHint')}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                {t('prop.form.address')}
              </label>
              <input
                className="fm-input"
                type="text"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="123 Calle Principal, Guaynabo, PR"
              />
            </div>
          </div>

          <FmModalFooter>
            <FmButton type="button" variant="secondary" size="sm" onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setFormError(null) }}>
              {t('cancel')}
            </FmButton>
            <FmButton type="submit" size="sm" loading={saving}>
              {saving ? t('creating') : t('prop.form.createBtn')}
            </FmButton>
          </FmModalFooter>
        </form>
      </FmModal>

    </div>
  )
}
