'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowRight, Loader2, AlertTriangle, PackageCheck, PackageOpen,
  Repeat, MapPin, Archive, PlusCircle, User, Boxes,
} from 'lucide-react'
import { FmCard, FmBadge, FmButton, FmModal, FmModalFooter, FmSelect, FmTextarea } from '@/components/fm'

// ── Types ──────────────────────────────────────────────────────────────────

interface Ref { id: string; full_name?: string; name?: string; custodian_type?: string }

interface Movement {
  id: string
  event_type: 'ACQUISITION' | 'CHECKOUT' | 'CHECKIN' | 'TRANSFER' | 'RELOCATE' | 'RETIRE'
  occurred_at: string
  condition_at_event: 'GOOD' | 'FAIR' | 'POOR' | null
  note: string | null
  from_custodian: Ref | null
  to_custodian: Ref | null
  from_space: Ref | null
  to_space: Ref | null
  from_property: Ref | null
  to_property: Ref | null
  recorded_by_profile: Ref | null
}

interface Custodian { id: string; full_name: string; custodian_type: string }
interface Space { id: string; name: string; space_type: string }

interface Props {
  assetId: string
  propertyId: string | null
  mobility: string
  canManage: boolean
  onChanged?: () => void
}

// ── Event presentation ───────────────────────────────────────────────────────

const EVENT_META: Record<Movement['event_type'], { label: string; icon: React.ReactNode; color: string }> = {
  ACQUISITION: { label: 'Acquired',   icon: <PlusCircle size={14} />,   color: 'var(--muted)' },
  CHECKOUT:    { label: 'Checked out', icon: <PackageOpen size={14} />,  color: 'var(--primary)' },
  CHECKIN:     { label: 'Checked in',  icon: <PackageCheck size={14} />, color: 'var(--green, #16a34a)' },
  TRANSFER:    { label: 'Transferred', icon: <Repeat size={14} />,       color: 'var(--primary)' },
  RELOCATE:    { label: 'Relocated',   icon: <MapPin size={14} />,       color: 'var(--muted)' },
  RETIRE:      { label: 'Retired',     icon: <Archive size={14} />,      color: 'var(--red)' },
}

const conditionVariant = (c: string | null) =>
  c === 'GOOD' ? 'success' as const : c === 'FAIR' ? 'warning' as const :
  c === 'POOR' ? 'danger' as const : 'neutral' as const

function custodianLabel(c: Ref | null): string {
  if (!c) return '—'
  return c.full_name ?? c.name ?? '—'
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const EMPTY_FORM = {
  event_type: 'CHECKOUT' as Movement['event_type'],
  to_custodian_id: '',
  to_space_id: '',
  condition_at_event: '',
  note: '',
}

// ── Component ────────────────────────────────────────────────────────────────

export function AssetCustodyTab({ assetId, propertyId, mobility, canManage, onChanged }: Props) {
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [custodians, setCustodians] = useState<Custodian[]>([])
  const [spaces, setSpaces]         = useState<Space[]>([])
  const [form, setForm]     = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/fm/assets/${assetId}/movements`)
      .then((r) => { if (!r.ok) throw new Error('Failed to load custody history'); return r.json() as Promise<Movement[]> })
      .then((d) => setMovements(Array.isArray(d) ? d : []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [assetId])

  useEffect(() => { load() }, [load])

  function openModal() {
    setForm(EMPTY_FORM)
    setFormError(null)
    // Load dropdown options scoped to this asset's building.
    const q = propertyId ? `?propertyId=${propertyId}&activeOnly=true` : '?activeOnly=true'
    Promise.all([
      fetch(`/api/fm/custodians${q}`).then((r) => r.json()).catch(() => []),
      fetch(`/api/fm/spaces${propertyId ? `?propertyId=${propertyId}` : ''}`).then((r) => r.json()).catch(() => []),
    ]).then(([c, s]) => {
      setCustodians(Array.isArray(c) ? c : [])
      setSpaces(Array.isArray(s) ? s : [])
    }).catch(() => {})
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    // A destination custodian is required for everything but a retire.
    if (form.event_type !== 'RETIRE' && !form.to_custodian_id) {
      setFormError('Select a destination custodian (use the building’s Storage for unassigned).')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/fm/assets/${assetId}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: form.event_type,
          to_custodian_id: form.to_custodian_id || null,
          to_space_id: form.to_space_id || null,
          condition_at_event: form.condition_at_event || undefined,
          note: form.note.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to record movement')
      }
      setShowModal(false)
      load()
      onChanged?.()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  // Fixed assets never move — surface that instead of a ledger.
  if (mobility !== 'MOBILE') {
    return (
      <FmCard>
        <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
          <Boxes size={26} style={{ margin: '0 auto 0.6rem', opacity: 0.4 }} />
          This is a <strong>fixed asset</strong> — permanently associated with its building.
          <br />Fixed assets have no chain of custody.
        </div>
      </FmCard>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: 0 }}>
          {movements.length} {movements.length === 1 ? 'movement' : 'movements'} on record
        </p>
        {canManage && (
          <FmButton size="sm" icon={<PackageOpen size={14} />} onClick={openModal}>
            Record movement
          </FmButton>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--red)' }}>
          <AlertTriangle size={26} style={{ margin: '0 auto 0.6rem' }} />
          <p style={{ fontSize: '0.85rem' }}>{error}</p>
        </div>
      ) : movements.length === 0 ? (
        <FmCard>
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
            No custody history yet.
          </div>
        </FmCard>
      ) : (
        <FmCard style={{ padding: '1.25rem 1.5rem' }}>
          {/* Timeline */}
          <div style={{ position: 'relative' }}>
            {movements.map((m, i) => {
              const meta = EVENT_META[m.event_type]
              const isLast = i === movements.length - 1
              return (
                <div key={m.id} style={{ display: 'flex', gap: '0.9rem', paddingBottom: isLast ? 0 : '1.4rem', position: 'relative' }}>
                  {/* connector line */}
                  {!isLast && (
                    <div style={{ position: 'absolute', left: '0.68rem', top: '1.6rem', bottom: 0, width: 2, background: 'var(--border)' }} />
                  )}
                  {/* dot */}
                  <div style={{
                    flexShrink: 0, width: '1.4rem', height: '1.4rem', borderRadius: 9999,
                    background: 'var(--card-b)', border: `2px solid ${meta.color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.color, zIndex: 1,
                  }}>
                    {meta.icon}
                  </div>
                  {/* body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--fg)' }}>{meta.label}</span>
                      {m.condition_at_event && (
                        <FmBadge variant={conditionVariant(m.condition_at_event)}>{m.condition_at_event}</FmBadge>
                      )}
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginLeft: 'auto' }}>{fmtDate(m.occurred_at)}</span>
                    </div>

                    {/* custody line */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.3rem' }}>
                      <User size={12} />
                      <span>{custodianLabel(m.from_custodian)}</span>
                      <ArrowRight size={12} />
                      <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{custodianLabel(m.to_custodian)}</span>
                    </div>

                    {/* location line */}
                    {(m.from_space || m.to_space || m.to_property) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.76rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                        <MapPin size={12} />
                        <span>{m.from_space?.name ?? m.from_property?.name ?? '—'}</span>
                        <ArrowRight size={12} />
                        <span style={{ color: 'var(--fg)' }}>{m.to_space?.name ?? m.to_property?.name ?? '—'}</span>
                      </div>
                    )}

                    {m.note && (
                      <p style={{ fontSize: '0.76rem', color: 'var(--fg)', marginTop: '0.35rem', fontStyle: 'italic' }}>“{m.note}”</p>
                    )}
                    <p style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                      recorded by {m.recorded_by_profile?.full_name ?? 'system'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </FmCard>
      )}

      {/* Record-movement modal */}
      <FmModal open={showModal} onClose={() => setShowModal(false)} title="Record movement">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <FmSelect label="Event" value={form.event_type} required
            onChange={(e) => setForm({ ...form, event_type: e.target.value as Movement['event_type'] })}>
            <option value="CHECKOUT">Check out — hand to a person</option>
            <option value="CHECKIN">Check in — return to storage</option>
            <option value="TRANSFER">Transfer — person to person</option>
            <option value="RELOCATE">Relocate — move location, same custody</option>
            <option value="RETIRE">Retire — decommission</option>
          </FmSelect>

          {form.event_type !== 'RETIRE' && (
            <FmSelect label="Destination custodian" value={form.to_custodian_id} required
              hint="Pick the building’s Storage entry for an unassigned / stored item."
              onChange={(e) => setForm({ ...form, to_custodian_id: e.target.value })}>
              <option value="">Select…</option>
              {custodians.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}{c.custodian_type === 'STORAGE' ? ' (Storage)' : ` — ${c.custodian_type.toLowerCase()}`}
                </option>
              ))}
            </FmSelect>
          )}

          {form.event_type !== 'RETIRE' && (
            <FmSelect label="Destination location (space)" value={form.to_space_id}
              onChange={(e) => setForm({ ...form, to_space_id: e.target.value })}>
              <option value="">— none —</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </FmSelect>
          )}

          <FmSelect label="Condition at this event" value={form.condition_at_event}
            onChange={(e) => setForm({ ...form, condition_at_event: e.target.value })}>
            <option value="">— unchanged —</option>
            <option value="GOOD">Good</option>
            <option value="FAIR">Fair</option>
            <option value="POOR">Poor</option>
          </FmSelect>

          <FmTextarea label="Note" value={form.note} placeholder="Optional context…"
            onChange={(e) => setForm({ ...form, note: e.target.value })} />

          {formError && <p style={{ fontSize: '0.78rem', color: 'var(--red)' }}>{formError}</p>}

          <FmModalFooter>
            <FmButton type="button" variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</FmButton>
            <FmButton type="submit" size="sm" loading={saving}>Record</FmButton>
          </FmModalFooter>
        </form>
      </FmModal>
    </div>
  )
}
