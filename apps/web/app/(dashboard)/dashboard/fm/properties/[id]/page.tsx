'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Loader2, AlertTriangle, Plus, ClipboardCheck, Wrench } from 'lucide-react'
import { FmCard, FmBadge, FmButton, FmModal, FmModalFooter, statusVariant } from '@/components/fm'

// ── Types (unchanged from original) ───────────────────────────────────────

interface FmFloor       { id: string; name: string }
interface FmAssetSummary { id: string; name: string; code: string; category: string; condition: string; location: string | null; updated_at: string }
interface FmInspectionSummary { id: string; status: string; score: number | null; started_at: string | null; completed_at: string | null; fm_inspection_templates: { name: string } | null }
interface FmWorkOrderSummary  { id: string; title: string; status: string; priority: string; due_date: string | null }
interface FmProperty { id: string; name: string; code: string; address: string | null; status: string; risk_level: string | null; latitude: number | null; longitude: number | null; fm_floors?: FmFloor[]; fm_assets?: FmAssetSummary[]; fm_inspections?: FmInspectionSummary[] }

type SubTab = 'assets' | 'inspections' | 'work-orders'

// ── Add Asset Modal ────────────────────────────────────────────────────────

function AddAssetModal({ propertyId, onClose, onSaved }: { propertyId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', code: '', category: 'OTHER', condition: 'GOOD' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.code.trim()) { setErr('Name and code are required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/fm/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, code: form.code.toUpperCase(), property_id: propertyId }),
      })
      if (res.ok) { onSaved(); onClose() }
      else { const b = await res.json() as { error?: string }; setErr(b.error ?? 'Failed') }
    } finally { setSaving(false) }
  }

  return (
    <FmModal open onClose={onClose} title="Add Asset" subtitle="Register an asset to this property">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {err && <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--red)' }}>{err}</div>}
        <input className="fm-input" type="text" placeholder="Name *" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
        <input className="fm-input" type="text" placeholder="Code *" style={{ fontFamily: 'monospace', textTransform: 'uppercase' }} value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
        <select className="fm-input" style={{ appearance: 'none' }} value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
          {['ELECTRICAL','PLUMBING','HVAC','STRUCTURAL','FIRE_SAFETY','OTHER'].map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
        </select>
        <select className="fm-input" style={{ appearance: 'none' }} value={form.condition} onChange={(e) => setForm(f => ({ ...f, condition: e.target.value }))}>
          {['GOOD','FAIR','POOR'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <FmModalFooter>
          <FmButton type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</FmButton>
          <FmButton type="submit" size="sm" loading={saving}>Add Asset</FmButton>
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
  const params   = useParams()
  const router   = useRouter()
  const id       = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [property, setProperty]   = useState<FmProperty | null>(null)
  const [workOrders, setWorkOrders] = useState<FmWorkOrderSummary[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SubTab>('assets')
  const [showAddAsset, setShowAddAsset] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([
      fetch(`/api/fm/properties/${id}`).then((r) => {
        if (!r.ok) throw new Error('Property not found')
        return r.json() as Promise<FmProperty>
      }),
      fetch(`/api/fm/work-orders?propertyId=${id}`).then((r) =>
        r.ok ? (r.json() as Promise<FmWorkOrderSummary[]>) : Promise.resolve([])
      ),
    ])
      .then(([prop, wos]) => { setProperty(prop); setWorkOrders(wos) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}><Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} /></div>
  }

  if (error || !property) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 0' }}>
        <AlertTriangle size={28} style={{ color: 'var(--red)', margin: '0 auto 0.75rem' }} />
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>{error ?? 'Property not found'}</p>
        <FmButton variant="secondary" size="sm" onClick={() => router.push('/dashboard/fm/properties')}>
          ← Back to Properties
        </FmButton>
      </div>
    )
  }

  const assets      = property.fm_assets      ?? []
  const inspections = property.fm_inspections ?? []

  const TABS: { value: SubTab; label: string; count: number }[] = [
    { value: 'assets',      label: 'Assets',      count: assets.length },
    { value: 'inspections', label: 'Inspections',  count: inspections.length },
    { value: 'work-orders', label: 'Work Orders',  count: workOrders.length },
  ]

  const propVariant = statusVariant(property.status)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

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

      {/* Info tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <InfoTile label="Assets"      value={assets.length} />
        <InfoTile label="Inspections" value={inspections.length} />
        <InfoTile label="Work Orders" value={workOrders.length} />
        {property.risk_level && <InfoTile label="Risk Level" value={<FmBadge variant={statusVariant(property.risk_level)}>{property.risk_level}</FmBadge>} />}
        {property.latitude != null && property.longitude != null && (
          <InfoTile label="GPS" value={<span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{property.latitude.toFixed(4)}, {property.longitude.toFixed(4)}</span>} />
        )}
      </div>

      {/* Tabs */}
      <div>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '1.25rem', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex' }}>
            {TABS.map((t) => <Tab key={t.value} label={t.label} count={t.count} active={activeTab === t.value} onClick={() => setActiveTab(t.value)} />)}
          </div>
          <div style={{ paddingBottom: '0.5rem' }}>
            {activeTab === 'assets' && (
              <FmButton icon={<Plus size={13} />} size="sm" onClick={() => setShowAddAsset(true)}>
                Add Asset
              </FmButton>
            )}
            {activeTab === 'inspections' && (
              <Link href="/dashboard/fm/inspections" style={{ textDecoration: 'none' }}>
                <FmButton icon={<Plus size={13} />} size="sm">Start Inspection</FmButton>
              </Link>
            )}
          </div>
        </div>

        {/* Assets tab */}
        {activeTab === 'assets' && (
          <FmCard style={{ padding: 0, overflow: 'hidden' }}>
            {assets.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
                <Wrench size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
                No assets for this property
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="fm-table">
                  <thead><tr><th>Asset</th><th>Category</th><th>Location</th><th>Condition</th></tr></thead>
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
                No inspections yet
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="fm-table">
                  <thead><tr><th>Template</th><th>Status</th><th>Score</th><th>Date</th></tr></thead>
                  <tbody>
                    {inspections.map((insp) => (
                      <tr key={insp.id} onClick={() => router.push(`/dashboard/fm/inspections/${insp.id}`)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 500, color: 'var(--fg)' }}>{insp.fm_inspection_templates?.name ?? '—'}</td>
                        <td><FmBadge variant={statusVariant(insp.status)}>{insp.status.replace(/_/g,' ')}</FmBadge></td>
                        <td style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>{insp.score != null ? `${insp.score}%` : '—'}</td>
                        <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{insp.started_at ? new Date(insp.started_at).toLocaleDateString() : '—'}</td>
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
                No work orders for this property
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="fm-table">
                  <thead><tr><th>Title</th><th>Priority</th><th>Status</th><th>Due</th></tr></thead>
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
                            {wo.due_date ? new Date(wo.due_date).toLocaleDateString() : '—'}
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
      </div>

      {showAddAsset && <AddAssetModal propertyId={property.id} onClose={() => setShowAddAsset(false)} onSaved={load} />}
    </div>
  )
}
