'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Loader2, AlertTriangle, X, Wrench } from 'lucide-react'
import {
  FmCard, FmBadge, FmButton, FmModal,
  FmModalFooter, FmSectionLabel,
} from '@/components/fm'

// ── Types ──────────────────────────────────────────────────────────────────

interface FmProperty { id: string; name: string }

interface FmAsset {
  id: string; name: string; code: string
  category: string; condition: string
  location: string | null; property_id: string | null
  fm_properties?: { name: string } | null
}

interface AssetForm {
  name: string; code: string; category: string
  property_id: string; location: string; condition: string
}

const CATEGORIES = ['ELECTRICAL', 'PLUMBING', 'HVAC', 'STRUCTURAL', 'FIRE_SAFETY', 'OTHER'] as const
const CONDITIONS = ['GOOD', 'FAIR', 'POOR'] as const

const EMPTY_FORM: AssetForm = {
  name: '', code: '', category: 'OTHER',
  property_id: '', location: '', condition: 'GOOD',
}

// condition → badge variant
const conditionVariant = (c: string) =>
  c === 'GOOD' ? 'success' as const :
  c === 'FAIR' ? 'warning' as const : 'danger' as const

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FMAssetsPage() {
  const router = useRouter()
  const [assets, setAssets]         = useState<FmAsset[]>([])
  const [properties, setProperties] = useState<FmProperty[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState<string>('ALL')
  const [showModal, setShowModal]   = useState(false)
  const [form, setForm]             = useState<AssetForm>(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/fm/assets').then((r) => {
        if (!r.ok) throw new Error('Failed to load assets')
        return r.json() as Promise<FmAsset[]>
      }),
      fetch('/api/fm/properties').then((r) => r.json() as Promise<FmProperty[]>),
    ])
      .then(([a, p]) => { setAssets(a); setProperties(p) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Filter
  const filtered = assets.filter((a) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.code.toLowerCase().includes(q) ||
      (a.fm_properties?.name ?? '').toLowerCase().includes(q)
    const matchCat = catFilter === 'ALL' || a.category === catFilter
    return matchSearch && matchCat
  })

  // Category counts
  const catCounts = assets.reduce<Record<string, number>>((acc, a) => {
    acc[a.category] = (acc[a.category] ?? 0) + 1
    return acc
  }, {})

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.name.trim()) { setFormError('Name is required'); return }
    if (!form.code.trim()) { setFormError('Code is required'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/fm/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          category: form.category,
          property_id: form.property_id || null,
          location: form.location.trim() || null,
          condition: form.condition,
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to create asset')
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Assets</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
            {assets.length} registered asset{assets.length !== 1 ? 's' : ''}
          </p>
        </div>
        <FmButton icon={<Plus size={15} />} onClick={() => setShowModal(true)} size="sm">
          Register Asset
        </FmButton>
      </div>

      {/* Search + Category filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search by name, code or property…"
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

        {/* Category pills */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(['ALL', ...CATEGORIES] as string[]).map((cat) => {
            const active = catFilter === cat
            const count  = cat === 'ALL' ? assets.length : (catCounts[cat] ?? 0)
            const label  = cat === 'ALL' ? 'All' : cat.replace(/_/g, ' ').charAt(0) + cat.replace(/_/g, ' ').slice(1).toLowerCase()
            return (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: 9999,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                  background: active ? 'var(--primary-c)' : 'var(--card-b)',
                  color: active ? 'var(--primary)' : 'var(--muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                }}
              >
                {label}
                <span style={{ opacity: 0.7, fontWeight: 800 }}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
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
      ) : (
        <FmCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <FmSectionLabel>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Wrench size={13} style={{ color: 'var(--primary)' }} />
                {filtered.length} asset{filtered.length !== 1 ? 's' : ''}
                {(search || catFilter !== 'ALL') && ` (filtered)`}
              </span>
            </FmSectionLabel>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
              <Wrench size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
              No assets match your filters
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Category</th>
                    <th style={{ display: 'none' }} className="md:table-cell">Property</th>
                    <th>Condition</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((asset) => (
                    <tr
                      key={asset.id}
                      onClick={() => router.push(`/dashboard/fm/assets/${asset.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <p style={{ fontWeight: 600, color: 'var(--fg)', margin: 0 }}>{asset.name}</p>
                        <p style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--muted)', margin: '0.15rem 0 0' }}>{asset.code}</p>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                          {asset.category.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                          {asset.fm_properties?.name ?? '—'}
                        </span>
                      </td>
                      <td>
                        <FmBadge variant={conditionVariant(asset.condition)}>
                          {asset.condition}
                        </FmBadge>
                      </td>
                      <td>
                        <span className="fm-hover-show" style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>
                          View →
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FmCard>
      )}

      {/* Register Asset Modal */}
      <FmModal
        open={showModal}
        onClose={() => { setShowModal(false); setForm(EMPTY_FORM); setFormError(null) }}
        title="Register Asset"
        subtitle="Add a new asset to the facility inventory"
      >
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {formError && (
            <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.8rem', color: 'var(--red)' }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {/* Name */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                Name <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input className="fm-input" type="text" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Main HVAC Unit" />
            </div>

            {/* Code */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                Code <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input className="fm-input" style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                type="text" value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="HVAC-001" />
            </div>

            {/* Category */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>Category</label>
              <select className="fm-input" value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                style={{ appearance: 'none' }}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            {/* Condition */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>Condition</label>
              <select className="fm-input" value={form.condition}
                onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
                style={{ appearance: 'none' }}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Property */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>Property</label>
              <select className="fm-input" value={form.property_id}
                onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}
                style={{ appearance: 'none' }}>
                <option value="">— None —</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Location */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                Location <span style={{ color: 'var(--faint)', fontWeight: 400 }}>(optional)</span>
              </label>
              <input className="fm-input" type="text" value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Room 204, 2nd Floor" />
            </div>
          </div>

          <FmModalFooter>
            <FmButton type="button" variant="secondary" size="sm"
              onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setFormError(null) }}>
              Cancel
            </FmButton>
            <FmButton type="submit" size="sm" loading={saving}>
              {saving ? 'Registering…' : 'Register Asset'}
            </FmButton>
          </FmModalFooter>
        </form>
      </FmModal>

    </div>
  )
}
