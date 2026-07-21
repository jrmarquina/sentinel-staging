'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Loader2, AlertTriangle, User, Boxes, Trash2, Power } from 'lucide-react'
import { FmCard, FmBadge, FmButton, FmModal, FmModalFooter, FmSectionLabel, FmInput, FmSelect } from '@/components/fm'
import { useRole } from '@/hooks/useRole'

interface Property { id: string; name: string }
interface Custodian {
  id: string
  full_name: string
  custodian_type: 'TEACHER' | 'MAINTENANCE' | 'STAFF' | 'STORAGE'
  is_active: boolean
  contact_email: string | null
  contact_phone: string | null
  property_id: string | null
  fm_properties?: { name: string } | null
}

const TYPE_LABEL: Record<string, string> = {
  TEACHER: 'Teacher', MAINTENANCE: 'Maintenance', STAFF: 'Staff', STORAGE: 'Storage',
}

const EMPTY = { full_name: '', custodian_type: 'TEACHER' as const, property_id: '', contact_email: '', contact_phone: '' }

export default function CustodiansPage() {
  const { role } = useRole()
  const canManage = role === 'admin' || role === 'supervisor'

  const [custodians, setCustodians] = useState<Custodian[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState('ALL')

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<typeof EMPTY>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/fm/custodians').then((r) => { if (!r.ok) throw new Error('Failed to load custodians'); return r.json() as Promise<Custodian[]> }),
      fetch('/api/fm/properties').then((r) => r.json() as Promise<Property[]>).catch(() => []),
    ]).then(([c, p]) => { setCustodians(c); setProperties(p) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = custodians.filter((c) => typeFilter === 'ALL' || c.custodian_type === typeFilter)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.full_name.trim()) { setFormError('Name is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/fm/custodians', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          custodian_type: form.custodian_type,
          property_id: form.property_id || null,
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
        }),
      })
      if (!res.ok) { const b = await res.json() as { error?: string }; throw new Error(b.error ?? 'Failed to create') }
      setForm(EMPTY); setShowModal(false); load()
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : 'Unknown error') }
    finally { setSaving(false) }
  }

  async function toggleActive(c: Custodian) {
    await fetch(`/api/fm/custodians/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !c.is_active }),
    })
    load()
  }

  async function remove(c: Custodian) {
    if (!confirm(`Delete custodian "${c.full_name}"? Their history is preserved.`)) return
    const res = await fetch(`/api/fm/custodians/${c.id}`, { method: 'DELETE' })
    if (!res.ok) { const b = await res.json() as { error?: string }; alert(b.error ?? 'Failed to delete') }
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Custodians</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
            People who can hold mobile assets. Each building has a system Storage entry for unassigned items.
          </p>
        </div>
        {canManage && <FmButton size="sm" icon={<Plus size={15} />} onClick={() => { setForm(EMPTY); setShowModal(true) }}>Add custodian</FmButton>}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {['ALL', 'TEACHER', 'MAINTENANCE', 'STAFF', 'STORAGE'].map((tp) => {
          const active = typeFilter === tp
          const count = tp === 'ALL' ? custodians.length : custodians.filter((c) => c.custodian_type === tp).length
          return (
            <button key={tp} onClick={() => setTypeFilter(tp)} style={{
              padding: '0.3rem 0.75rem', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 700,
              border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
              background: active ? 'var(--primary-c)' : 'var(--card-b)',
              color: active ? 'var(--primary)' : 'var(--muted)', cursor: 'pointer',
              display: 'flex', gap: '0.35rem', alignItems: 'center',
            }}>{tp === 'ALL' ? 'All' : TYPE_LABEL[tp]}<span style={{ opacity: 0.7, fontWeight: 800 }}>{count}</span></button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} /></div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--red)' }}><AlertTriangle size={26} style={{ margin: '0 auto 0.6rem' }} /><p style={{ fontSize: '0.85rem' }}>{error}</p></div>
      ) : (
        <FmCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <FmSectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><User size={13} style={{ color: 'var(--primary)' }} />{filtered.length} custodians</span></FmSectionLabel>
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>No custodians.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table">
                <thead><tr><th>Name</th><th>Type</th><th>Building</th><th>Status</th>{canManage && <th style={{ width: 100 }}></th>}</tr></thead>
                <tbody>
                  {filtered.map((c) => {
                    const isStorage = c.custodian_type === 'STORAGE'
                    return (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>
                          {isStorage ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Boxes size={13} style={{ color: 'var(--muted)' }} />{c.full_name}</span> : c.full_name}
                        </td>
                        <td><FmBadge variant={isStorage ? 'neutral' : 'info'}>{TYPE_LABEL[c.custodian_type]}</FmBadge></td>
                        <td style={{ color: 'var(--muted)' }}>{c.fm_properties?.name ?? '—'}</td>
                        <td><FmBadge variant={c.is_active ? 'success' : 'neutral'}>{c.is_active ? 'Active' : 'Inactive'}</FmBadge></td>
                        {canManage && (
                          <td>
                            {!isStorage && (
                              <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <button title={c.is_active ? 'Deactivate' : 'Reactivate'} onClick={() => toggleActive(c)} style={iconBtn}><Power size={14} /></button>
                                <button title="Delete" onClick={() => remove(c)} style={iconBtn}><Trash2 size={14} /></button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </FmCard>
      )}

      <FmModal open={showModal} onClose={() => setShowModal(false)} title="Add custodian">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <FmInput label="Full name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <FmSelect label="Type" value={form.custodian_type} onChange={(e) => setForm({ ...form, custodian_type: e.target.value as typeof form.custodian_type })}>
            <option value="TEACHER">Teacher</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="STAFF">Staff</option>
          </FmSelect>
          <FmSelect label="Home building" value={form.property_id} hint="Optional — leave blank for roaming staff." onChange={(e) => setForm({ ...form, property_id: e.target.value })}>
            <option value="">— none —</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FmSelect>
          <FmInput label="Email" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          <FmInput label="Phone" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
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
