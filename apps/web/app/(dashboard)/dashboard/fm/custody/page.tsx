'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, Loader2, AlertTriangle, ArrowRight, User, MapPin,
  Boxes, Package, History, Filter, X,
} from 'lucide-react'
import { FmCard, FmBadge, FmButton, FmSelect, FmInput } from '@/components/fm'

// ── Types ──────────────────────────────────────────────────────────────────

interface Ref { id: string; full_name?: string; name?: string; custodian_type?: string }

interface Movement {
  id: string
  event_type: string
  occurred_at: string
  condition_at_event: string | null
  note: string | null
  asset: { id: string; name: string; code: string; category: string; mobility: string; inventory_number: string | null }
  from_custodian: Ref | null
  to_custodian: Ref | null
  from_space: Ref | null
  to_space: Ref | null
  from_property: Ref | null
  to_property: Ref | null
  recorded_by_profile: Ref | null
}

interface Custodian { id: string; full_name: string; custodian_type: string }
interface Space { id: string; name: string }
interface Property { id: string; name: string }

type Lens = 'object' | 'person' | 'location'

const EVENT_LABEL: Record<string, string> = {
  ACQUISITION: 'Acquired', CHECKOUT: 'Checked out', CHECKIN: 'Checked in',
  TRANSFER: 'Transferred', RELOCATE: 'Relocated', RETIRE: 'Retired',
}

function custLabel(c: Ref | null): string { return c?.full_name ?? c?.name ?? '—' }
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CustodySearchPage() {
  const router = useRouter()

  // filter state
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [custodianId, setCustodianId] = useState('')
  const [category, setCategory] = useState('')
  const [spaceId, setSpaceId]   = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [lens, setLens] = useState<Lens>('object')

  // options
  const [custodians, setCustodians] = useState<Custodian[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [properties, setProperties] = useState<Property[]>([])

  // results
  const [results, setResults] = useState<Movement[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/fm/custodians?activeOnly=false').then((r) => r.json() as Promise<Custodian[]>).catch(() => []),
      fetch('/api/fm/spaces').then((r) => r.json() as Promise<Space[]>).catch(() => []),
      fetch('/api/fm/properties').then((r) => r.json() as Promise<Property[]>).catch(() => []),
    ]).then(([c, s, p]) => { setCustodians(c); setSpaces(s); setProperties(p) })
  }, [])

  const categories = useMemo(
    () => Array.from(new Set(results.map((m) => m.asset.category))).sort(),
    [results],
  )

  const runSearch = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString())
    if (dateTo) params.set('dateTo', new Date(dateTo + 'T23:59:59').toISOString())
    if (custodianId) params.set('custodianId', custodianId)
    if (category) params.set('category', category)
    if (spaceId) params.set('spaceId', spaceId)
    if (propertyId) params.set('propertyId', propertyId)
    fetch(`/api/fm/custody/search?${params.toString()}`)
      .then((r) => { if (!r.ok) throw new Error('Search failed'); return r.json() as Promise<Movement[]> })
      .then((d) => { setResults(d); setSearched(true) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo, custodianId, category, spaceId, propertyId])

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setCustodianId(''); setCategory(''); setSpaceId(''); setPropertyId('')
  }

  const hasFilters = dateFrom || dateTo || custodianId || category || spaceId || propertyId

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Custody Search</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
          Trace mobile assets by object, person, or location across their full history.
        </p>
      </div>

      {/* Filter bar */}
      <FmCard style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <Filter size={13} /> Filters
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.9rem' }}>
          <FmInput label="From date" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <FmInput label="To date" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <FmSelect label="Person" value={custodianId} onChange={(e) => setCustodianId(e.target.value)}>
            <option value="">Any person</option>
            {custodians.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}{c.custodian_type === 'STORAGE' ? ' (Storage)' : ''}
              </option>
            ))}
          </FmSelect>
          <FmSelect label="Object type" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Any type</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </FmSelect>
          <FmSelect label="Location (space)" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
            <option value="">Any space</option>
            {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </FmSelect>
          <FmSelect label="Building" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">Any building</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FmSelect>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
          <FmButton size="sm" icon={<Search size={14} />} onClick={runSearch} loading={loading}>Search</FmButton>
          {hasFilters && (
            <FmButton size="sm" variant="secondary" icon={<X size={14} />} onClick={clearFilters}>Clear</FmButton>
          )}
        </div>
      </FmCard>

      {/* Lens toggle */}
      {searched && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {([['object', 'By Object', <Package size={13} key="o" />],
             ['person', 'By Person', <User size={13} key="p" />],
             ['location', 'By Location', <MapPin size={13} key="l" />]] as [Lens, string, React.ReactNode][]).map(([id, label, icon]) => {
            const active = lens === id
            return (
              <button key={id} onClick={() => setLens(id)} style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.4rem 0.85rem', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 700,
                border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                background: active ? 'var(--primary-c)' : 'var(--card-b)',
                color: active ? 'var(--primary)' : 'var(--muted)', cursor: 'pointer',
              }}>{icon}{label}</button>
            )
          })}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--red)' }}>
          <AlertTriangle size={26} style={{ margin: '0 auto 0.6rem' }} /><p style={{ fontSize: '0.85rem' }}>{error}</p>
        </div>
      ) : !searched ? (
        <FmCard><div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
          <History size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
          Set your filters and run a search to trace custody.
        </div></FmCard>
      ) : results.length === 0 ? (
        <FmCard><div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
          No movements match these filters.
        </div></FmCard>
      ) : (
        <>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0 }}>{results.length} movement records</p>
          {lens === 'object'   && <ByObject results={results} onOpen={(id) => router.push(`/dashboard/fm/assets/${id}`)} />}
          {lens === 'person'   && <ByPerson results={results} />}
          {lens === 'location' && <ByLocation results={results} />}
        </>
      )}
    </div>
  )
}

// ── Grouped views ─────────────────────────────────────────────────────────────

function GroupCard({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <FmCard style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '0.85rem 1.1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
        <span style={{ color: 'var(--primary)' }}>{icon}</span>
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--fg)' }}>{title}</span>
        {subtitle && <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginLeft: 'auto' }}>{subtitle}</span>}
      </div>
      <div>{children}</div>
    </FmCard>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '0.6rem 1.1rem', borderBottom: '1px solid var(--border)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>{children}</div>
}

function groupBy<T>(arr: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const item of arr) {
    const k = key(item)
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(item)
  }
  return m
}

function ByObject({ results, onOpen }: { results: Movement[]; onOpen: (id: string) => void }) {
  const groups = groupBy(results, (m) => m.asset.id)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {Array.from(groups.entries()).map(([assetId, moves]) => {
        const a = moves[0].asset
        return (
          <GroupCard key={assetId} icon={<Boxes size={15} />}
            title={`${a.name} · ${a.code}`}
            subtitle={`${a.category}${a.inventory_number ? ` · tag ${a.inventory_number}` : ''} — ${moves.length} events`}>
            {moves.map((m) => (
              <Row key={m.id}>
                <FmBadge variant="neutral">{EVENT_LABEL[m.event_type] ?? m.event_type}</FmBadge>
                <span style={{ color: 'var(--muted)' }}>{custLabel(m.from_custodian)}</span>
                <ArrowRight size={12} style={{ color: 'var(--muted)' }} />
                <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{custLabel(m.to_custodian)}</span>
                {m.to_space && <span style={{ color: 'var(--muted)' }}>@ {m.to_space.name}</span>}
                <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{fmtDate(m.occurred_at)}</span>
              </Row>
            ))}
            <div style={{ padding: '0.6rem 1.1rem' }}>
              <FmButton size="sm" variant="secondary" onClick={() => onOpen(assetId)}>Open asset</FmButton>
            </div>
          </GroupCard>
        )
      })}
    </div>
  )
}

function ByPerson({ results }: { results: Movement[] }) {
  // Group by the party that received custody (to_custodian).
  const withPerson = results.filter((m) => m.to_custodian)
  const groups = groupBy(withPerson, (m) => m.to_custodian!.id)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {Array.from(groups.entries()).map(([id, moves]) => {
        const c = moves[0].to_custodian!
        const isStorage = c.custodian_type === 'STORAGE'
        return (
          <GroupCard key={id} icon={<User size={15} />}
            title={custLabel(c) + (isStorage ? ' (Storage)' : '')}
            subtitle={`${moves.length} assets received`}>
            {moves.map((m) => (
              <Row key={m.id}>
                <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{m.asset.name}</span>
                <span style={{ color: 'var(--muted)' }}>{m.asset.code}</span>
                <FmBadge variant="neutral">{EVENT_LABEL[m.event_type] ?? m.event_type}</FmBadge>
                {m.to_space && <span style={{ color: 'var(--muted)' }}>@ {m.to_space.name}</span>}
                <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{fmtDate(m.occurred_at)}</span>
              </Row>
            ))}
          </GroupCard>
        )
      })}
    </div>
  )
}

function ByLocation({ results }: { results: Movement[] }) {
  // Group by destination space; fall back to destination building.
  const withLoc = results.filter((m) => m.to_space || m.to_property)
  const groups = groupBy(withLoc, (m) => m.to_space?.id ?? m.to_property!.id)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {Array.from(groups.entries()).map(([id, moves]) => {
        const label = moves[0].to_space?.name ?? moves[0].to_property?.name ?? '—'
        return (
          <GroupCard key={id} icon={<MapPin size={15} />}
            title={label}
            subtitle={`${moves.length} arrivals`}>
            {moves.map((m) => (
              <Row key={m.id}>
                <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{m.asset.name}</span>
                <span style={{ color: 'var(--muted)' }}>{m.asset.code}</span>
                <span style={{ color: 'var(--muted)' }}>held by</span>
                <span style={{ color: 'var(--fg)' }}>{custLabel(m.to_custodian)}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{fmtDate(m.occurred_at)}</span>
              </Row>
            ))}
          </GroupCard>
        )
      })}
    </div>
  )
}
