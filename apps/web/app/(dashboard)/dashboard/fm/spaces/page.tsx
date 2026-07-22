'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Loader2, AlertTriangle, MapPin, Trash2 } from 'lucide-react'
import { FmCard, FmBadge, FmButton, FmModal, FmModalFooter, FmSectionLabel, FmInput, FmSelect } from '@/components/fm'
import { useRole } from '@/hooks/useRole'

interface Property { id: string; name: string }
interface Space {
  id: string
  name: string
  space_type: string
  code: string | null
  property_id: string
  fm_properties?: { name: string } | null
}

const TYPES = ['CLASSROOM', 'OFFICE', 'STORAGE', 'COMMON', 'OUTDOOR', 'OTHER'] as const
const TYPE_LABEL: Record<string, string> = {
  CLASSROOM: 'Classroom', OFFICE: 'Office', STORAGE: 'Storage', COMMON: 'Common', OUTDOOR: 'Outdoor', OTHER: 'Other',
}

const EMPTY = { property_id: '', name: '', space_type: 'CLASSROOM' as string, code: '' }

export default function SpacesPage() {
  const { role } = useRole()
  const canManage = role === 'admin' || role === 'supervisor'

  const [spaces, setSpaces] = useState<Space[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [propFilter, setPropFilter] = useState('ALL')

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/fm/spaces').then((r) => { if (!r.ok) throw new Error('Failed to load spaces'); return r.json() as Promise<Space[]> }),
      fetch('/api/fm/properties').then((r) => r.json() as Promise<Property[]>).catch(() => []),
    ]).then(([s, p]) => { setSpaces(Array.isArray(s) ? s : []); setProperties(Array.isArray(p) ? p : []) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = spaces.filter((s) => propFilter === 'ALL' || s.property_id === propFilter)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.property_id) { setFormError('Select a building'); return }
    if (!form.name.trim()) { setFormError('Name is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/fm/spaces', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: form.property_id,
          name: form.name.trim(),
          space_type: form.space_type,
          code: form.code.trim() || null,
        }),
      })
      if (!res.ok) { const b = await res.json() as { error?: string }; throw new Error(b.error ?? 'Failed to create') }
      setForm(EMPTY); setShowModal(false); load()
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : 'Unknown error') }
    finally { setSaving(false) }
  }

  async function remove(s: Space) {
    if (!confirm(`Delete space "${s.name}"?`)) return
    const res = await fetch(`/api/fm/spaces/${s.id}`, { method: 'DELETE' })
    if (!res.ok) { const b = await res.json() as { error?: string }; alert(b.error ?? 'Failed to delete') }
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Spaces</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
            Rooms and areas within buildings — classrooms, offices, storage. Mobile assets are located to a space.
          </p>
        </div>
        {canManage && <FmButton size="sm" icon={<Plus size={15} />} onClick={() => { setForm(EMPTY); setShowModal(true) }}>Add space</FmButton>}
      </div>

      <FmSelect label="" value={propFilter} onChange={(e) => setPropFilter(e.target.value)}>
        <option value="ALL">All buildings</option>
        {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </FmSelect>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} /></div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--red)' }}><AlertTriangle size={26} style={{ margin: '0 auto 0.6rem' }} /><p style={{ fontSize: '0.85rem' }}>{error}</p></div>
      ) : (
        <FmCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <FmSectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><MapPin size={13} style={{ color: 'var(--primary)' }} />{filtered.length} spaces</span></FmSectionLabel>
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>No spaces.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table">
                <thead><tr><th>Name</th><th>Type</th><th>Building</th><th>Code</th>{canManage && <th style={{ width: 60 }}></th>}</tr></thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td><FmBadge variant="info">{TYPE_LABEL[s.space_type] ?? s.space_type}</FmBadge></td>
                      <td style={{ color: 'var(--muted)' }}>{s.fm_properties?.name ?? '—'}</td>
                      <td style={{ color: 'var(--muted)' }}>{s.code ?? '—'}</td>
                      {canManage && (
                        <td><button title="Delete" onClick={() => remove(s)} style={iconBtn}><Trash2 size={14} /></button></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FmCard>
      )}

      <FmModal open={showModal} onClose={() => setShowModal(false)} title="Add space">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <FmSelect label="Building" required value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })}>
            <option value="">Select…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FmSelect>
          <FmInput label="Name" required placeholder="Room 204" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <FmSelect label="Type" value={form.space_type} onChange={(e) => setForm({ ...form, space_type: e.target.value })}>
            {TYPES.map((tp) => <option key={tp} value={tp}>{TYPE_LABEL[tp]}</option>)}
          </FmSelect>
          <FmInput label="Code" placeholder="Optional" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          {formError && <p style={{ fontSize: '0.78rem', color: 'var(--red)' }}>{formError}</p>}
          <FmModalFooter>
            <FmButton type="button" variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</FmButton>
            <FmButton type="submit" size="sm" loading={saving}>Add</FmButton>
          </FmModalFooter>
        </form>
      </FmModal>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '0.3rem',
  cursor: 'pointer', color: 'var(--muted)', display: 'flex',
}
