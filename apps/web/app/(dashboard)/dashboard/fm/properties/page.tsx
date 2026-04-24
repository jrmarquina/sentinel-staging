'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  Plus, Search, MapPin, ChevronRight,
  Loader2, AlertTriangle, X, Building2,
} from 'lucide-react'
import {
  FmCard, FmBadge, FmButton, FmModal,
  FmModalFooter, FmInput,
} from '@/components/fm'

// ── Types ──────────────────────────────────────────────────────────────────

interface FmProperty {
  id: string
  name: string
  code: string
  address: string | null
  status: string
  latitude: number | null
  longitude: number | null
  fm_assets?: Array<{ id: string }>
  fm_inspections?: Array<{ id: string }>
}

interface NewPropertyForm {
  name: string; code: string; address: string; coordinates: string
}

const EMPTY_FORM: NewPropertyForm = { name: '', code: '', address: '', coordinates: '' }

const STATUS_FILTERS = ['ALL', 'ACTIVE', 'MAINTENANCE', 'INACTIVE'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

// ── Property Card ──────────────────────────────────────────────────────────

function PropertyCard({ prop }: { prop: FmProperty }) {
  const assetCount  = prop.fm_assets?.length      ?? 0
  const inspCount   = prop.fm_inspections?.length ?? 0

  // status → badge variant
  const badgeVariant =
    prop.status === 'ACTIVE'      ? 'success' as const :
    prop.status === 'MAINTENANCE' ? 'warning' as const : 'danger' as const

  return (
    <FmCard style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: 'var(--primary-c)', border: '1px solid var(--primary)30',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--primary)',
          }}>
            <Building2 size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {prop.name}
            </p>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--primary)', margin: 0, fontFamily: 'monospace' }}>
              {prop.code}
            </p>
          </div>
        </div>
        <FmBadge variant={badgeVariant}>{prop.status}</FmBadge>
      </div>

      {/* Address */}
      {prop.address && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
          <MapPin size={13} style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
            {prop.address}
          </span>
        </div>
      )}

      {/* Counters + link */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'var(--card-b)', color: 'var(--muted)', padding: '0.2rem 0.5rem', borderRadius: 9999, border: '1px solid var(--border)' }}>
            {assetCount} asset{assetCount !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'var(--card-b)', color: 'var(--muted)', padding: '0.2rem 0.5rem', borderRadius: 9999, border: '1px solid var(--border)' }}>
            {inspCount} inspection{inspCount !== 1 ? 's' : ''}
          </span>
        </div>
        <Link
          href={`/dashboard/fm/properties/${prop.id}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}
        >
          Details <ChevronRight size={14} />
        </Link>
      </div>
    </FmCard>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FMPropertiesPage() {
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
        if (!r.ok) throw new Error('Failed to load properties')
        return r.json() as Promise<FmProperty[]>
      })
      .then(setProperties)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
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
    if (!form.name.trim()) { setFormError('Name is required'); return }
    if (!form.code.trim()) { setFormError('Code is required'); return }

    let latitude: number | null = null
    let longitude: number | null = null
    if (form.coordinates.trim()) {
      const parts = form.coordinates.split(',').map((s) => s.trim())
      if (parts.length !== 2 || isNaN(Number(parts[0])) || isNaN(Number(parts[1]))) {
        setFormError('Coordinates must be "lat, lng"')
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
        throw new Error(body.error ?? 'Failed to create property')
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
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Properties</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
            {properties.length} managed facilit{properties.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
        <FmButton icon={<Plus size={15} />} onClick={() => setShowModal(true)} size="sm">
          New Property
        </FmButton>
      </div>

      {/* Search + Status filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search by name, code or address…"
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
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
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
          <FmButton variant="secondary" size="sm" onClick={load} style={{ marginTop: '1rem' }}>Retry</FmButton>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--muted)' }}>
          <Building2 size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
          <p style={{ fontSize: '0.875rem' }}>
            {search || statusFilter !== 'ALL' ? 'No properties match your filters' : 'No properties yet'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {filtered.map((prop) => <PropertyCard key={prop.id} prop={prop} />)}
        </div>
      )}

      {/* Create Modal */}
      <FmModal
        open={showModal}
        onClose={() => { setShowModal(false); setForm(EMPTY_FORM); setFormError(null) }}
        title="New Property"
        subtitle="Register a new managed facility"
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
                Name <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                ref={nameRef}
                className="fm-input"
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Guaynabo Municipal Hall"
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                Code <span style={{ color: 'var(--red)' }}>*</span>
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
                GPS Coordinates <span style={{ color: 'var(--faint)', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                className="fm-input"
                style={{ fontFamily: 'monospace' }}
                type="text"
                value={form.coordinates}
                onChange={(e) => setForm((f) => ({ ...f, coordinates: e.target.value }))}
                placeholder="18.3830, -66.0858"
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                Address
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
              Cancel
            </FmButton>
            <FmButton type="submit" size="sm" loading={saving}>
              {saving ? 'Creating…' : 'Create Property'}
            </FmButton>
          </FmModalFooter>
        </form>
      </FmModal>

    </div>
  )
}
