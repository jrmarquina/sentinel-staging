'use client'

import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2, Wrench, ClipboardCheck, AlertTriangle,
  Loader2, Activity, CheckCircle, Calendar,
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  MapPin, ArrowRight, BarChart2,
} from 'lucide-react'
import { FmCard, FmBadge, FmSectionLabel, statusVariant } from '@/components/fm'

// Dynamic map import (no SSR — canvas cannot run server-side)
const MapView = dynamic(
  () => import('@/components/map/MapView').then((m) => m.MapView),
  { ssr: false, loading: () => (
    <div style={{ height: '100%', background: 'var(--card-b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
    </div>
  )}
)

// ── Types ──────────────────────────────────────────────────────────────────

interface PropertyGeo { id: string; name: string; code: string; status: string; latitude: number; longitude: number }
interface PendingApproval {
  id: string
  updated_at: string
  fm_properties: { name: string } | null
  fm_templates: { name: string } | null
}
interface ScheduledEvent {
  id: string; title: string; type: 'inspection' | 'work_order'
  date: string; propertyName: string; isOverdue: boolean; status: string
}

interface DashboardData {
  properties:   { total: number; active: number }
  assets:       { total: number; byCondition: { good: number; fair: number; poor: number } }
  inspections:  { total: number; completed: number; pending: number; inProgress: number; averageScore: number }
  workOrders:   { total: number; open: number; inProgress: number; completed: number; highPriority: number }
  upcomingInspections: number
  overdueWorkOrders:   number
  complianceRate:      number
  pendingApprovals:    PendingApproval[]
  propertiesGeo:       PropertyGeo[]
  scheduledEvents:     ScheduledEvent[]
}

// ── Stat Card ──────────────────────────────────────────────────────────────

type AccentKey = 'primary' | 'teal' | 'red' | 'amber' | 'violet'

const ACCENT: Record<AccentKey, { color: string; bg: string; border: string }> = {
  primary: { color: 'var(--primary)', bg: 'var(--primary-c)', border: 'var(--primary)' },
  teal:    { color: 'var(--teal)',    bg: 'var(--teal-c)',    border: 'var(--teal)' },
  red:     { color: 'var(--red)',     bg: 'var(--red-c)',     border: 'var(--red)' },
  amber:   { color: 'var(--amber)',   bg: 'var(--amber-c)',   border: 'var(--amber)' },
  violet:  { color: 'var(--violet)',  bg: 'var(--violet-c)',  border: 'var(--violet)' },
}

function StatCard({
  icon, label, value, sub, accent = 'primary', active = false, trend,
}: {
  icon: React.ReactNode; label: string; value: string | number
  sub?: string; accent?: AccentKey; active?: boolean; trend?: string
}) {
  const a = ACCENT[accent]
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: active ? a.bg : 'var(--card)',
        border: `1px solid ${active || hovered ? a.border : 'var(--border)'}`,
        borderRadius: 16,
        padding: '1.25rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.375rem',
        cursor: 'default',
        boxShadow: hovered
          ? `0 8px 24px -4px ${a.color}30, var(--shadow)`
          : 'var(--shadow)',
        transform: hovered ? 'translateY(-4px) scale(1.02)' : 'none',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{
        padding: '0.625rem',
        borderRadius: 12,
        background: a.bg,
        border: `1px solid ${a.border}25`,
        color: a.color,
        display: 'flex',
      }}>
        {icon}
      </div>
      <p style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center', margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: '1.6rem', fontWeight: 800, color: active ? a.color : 'var(--fg)', margin: 0, lineHeight: 1 }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: '0.65rem', color: 'var(--muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {sub}
        </p>
      )}
      {trend && (
        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-c)', padding: '0.1rem 0.4rem', borderRadius: 4 }}>
          {trend}
        </span>
      )}
    </div>
  )
}

// ── Approvals Panel ────────────────────────────────────────────────────────

function ApprovalsPanel({ items, loading }: { items: PendingApproval[]; loading: boolean }) {
  const router = useRouter()
  return (
    <FmCard style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '0.875rem 1.25rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        <CheckCircle size={14} style={{ color: 'var(--teal)', flexShrink: 0 }} />
        <p style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
          Inspections Ready to Approve
        </p>
        {items.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, background: 'var(--amber-c)', color: 'var(--amber)', padding: '0.1rem 0.5rem', borderRadius: 9999 }}>
            {items.length}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
          </div>
        ) : items.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', padding: '2rem 1rem' }}>
            No pending approvals.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              onClick={() => router.push(`/dashboard/fm/inspections/${item.id}`)}
              style={{
                padding: '0.75rem 1.25rem',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card-b)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.fm_templates?.name ?? 'Inspection'}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                  {item.fm_properties?.name ?? '—'}
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--faint)' }}>
                  {new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {items.length > 0 && (
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)' }}>
          <Link href="/dashboard/fm/inspections?filter=PENDING_APPROVAL" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
            View all <ArrowRight size={13} />
          </Link>
        </div>
      )}
    </FmCard>
  )
}

// ── Top Properties ─────────────────────────────────────────────────────────

// Gradient palettes for property cards (used as photo placeholder)
const CARD_GRADIENTS = [
  'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
  'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)',
  'linear-gradient(135deg, #0d1b2a, #1b263b, #415a77)',
  'linear-gradient(135deg, #10002b, #240046, #3c096c)',
  'linear-gradient(135deg, #03071e, #370617, #6a040f)',
]

function TopProperties({ properties, loading }: { properties: PropertyGeo[]; loading: boolean }) {
  const router = useRouter()

  return (
    <FmCard style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <FmSectionLabel>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 size={13} style={{ color: 'var(--primary)' }} />
            Top Properties
          </span>
        </FmSectionLabel>
        <Link href="/dashboard/fm/properties" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', letterSpacing: '0.04em' }}>
          VIEW ALL →
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
        </div>
      ) : properties.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', padding: '1.5rem 0' }}>
          No properties registered yet
        </p>
      ) : (
        <div style={{ display: 'flex', gap: '0.875rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
          {properties.map((prop, i) => (
            <div
              key={prop.id}
              onClick={() => router.push(`/dashboard/fm/properties/${prop.id}`)}
              style={{
                flexShrink: 0,
                width: 220,
                borderRadius: 14,
                overflow: 'hidden',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
            >
              {/* Photo placeholder with gradient + icon */}
              <div style={{
                height: 130,
                background: CARD_GRADIENTS[i % CARD_GRADIENTS.length],
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                <Building2 size={40} style={{ color: 'rgba(255,255,255,0.15)' }} />
                <div style={{
                  position: 'absolute', bottom: '0.625rem', left: '0.625rem',
                  background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
                  borderRadius: 6, padding: '0.15rem 0.5rem',
                  fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.8)',
                }}>
                  {prop.code}
                </div>
                <div style={{
                  position: 'absolute', top: '0.625rem', right: '0.625rem',
                }}>
                  <FmBadge variant={prop.status === 'ACTIVE' ? 'success' : prop.status === 'MAINTENANCE' ? 'warning' : 'danger'}>
                    {prop.status}
                  </FmBadge>
                </div>
              </div>
              {/* Info */}
              <div style={{ padding: '0.75rem', background: 'var(--card)' }}>
                <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {prop.name}
                </p>
                <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '0.2rem 0 0', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <MapPin size={10} /> Puerto Rico
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </FmCard>
  )
}

// ── Mini Calendar ──────────────────────────────────────────────────────────

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}
function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function MiniMonth({
  year, month, eventMap, selectedDay, todayStr, onSelect,
}: {
  year: number; month: number
  eventMap: Record<string, ScheduledEvent[]>
  selectedDay: string | null; todayStr: string
  onSelect: (day: string) => void
}) {
  const daysInMonth  = getDaysInMonth(year, month)
  const firstDOW     = getFirstDayOfWeek(year, month)
  const monthLabel   = new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDOW; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <p style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--muted)', letterSpacing: '0.12em', textAlign: 'center', marginBottom: '0.625rem' }}>
        {monthLabel}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {DOW.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: 'var(--faint)', padding: '0.2rem 0' }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const events  = eventMap[dateStr] ?? []
          const isToday    = dateStr === todayStr
          const isSelected = dateStr === selectedDay
          const hasInsp    = events.some(e => e.type === 'inspection')
          const hasWo      = events.some(e => e.type === 'work_order')
          const hasOverdue = events.some(e => e.isOverdue)

          const bgColor =
            isSelected  ? 'var(--primary)' :
            hasOverdue  ? 'var(--red-c)'   :
            hasInsp && hasWo ? 'var(--violet-c)' :
            hasInsp     ? 'var(--primary-c)' :
            hasWo       ? 'var(--amber-c)' :
            'transparent'

          const textColor =
            isSelected  ? '#fff' :
            hasOverdue  ? 'var(--red)' :
            hasInsp     ? 'var(--primary)' :
            hasWo       ? 'var(--amber)' :
            'var(--fg)'

          return (
            <button
              key={dateStr}
              onClick={() => events.length > 0 ? onSelect(isSelected ? '' : dateStr) : undefined}
              style={{
                textAlign: 'center',
                fontSize: '0.72rem',
                fontWeight: isToday || isSelected ? 800 : 500,
                color: textColor,
                background: bgColor,
                borderRadius: 7,
                padding: '0.35rem 0',
                border: isToday && !isSelected ? `1px solid var(--primary)` : '1px solid transparent',
                cursor: events.length > 0 ? 'pointer' : 'default',
                transition: 'all 0.12s ease',
                position: 'relative',
              }}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Maintenance Timeline ───────────────────────────────────────────────────

function MaintenanceTimeline({ events, loading }: { events: ScheduledEvent[]; loading: boolean }) {
  const router = useRouter()
  const [selectedDay, setSelectedDay] = useState<string>('')
  const [expanded, setExpanded] = useState(false)

  const today = useMemo(() => new Date(), [])
  const todayStr = toYMD(today)

  const month0 = { year: today.getFullYear(), month: today.getMonth() }
  const nextDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const month1 = { year: nextDate.getFullYear(), month: nextDate.getMonth() }

  // Group events by date
  const eventMap = useMemo(() => {
    const map: Record<string, ScheduledEvent[]> = {}
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    }
    return map
  }, [events])

  const selectedEvents = selectedDay ? (eventMap[selectedDay] ?? []) : []

  const selectedLabel = selectedDay
    ? new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : ''

  return (
    <FmCard style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)',
      }}>
        <FmSectionLabel>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={13} style={{ color: 'var(--primary)' }} />
            Maintenance Timeline
          </span>
        </FmSectionLabel>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Legend */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {[
              { color: 'var(--primary)', label: 'Inspection' },
              { color: 'var(--amber)',   label: 'Work Order' },
              { color: 'var(--red)',     label: 'Overdue' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', color: 'var(--muted)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                {label}
              </div>
            ))}
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.3rem', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Dual calendar */}
      <div style={{ padding: '1.25rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '2rem' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
          </div>
        ) : (
          <>
            <MiniMonth {...month0} eventMap={eventMap} selectedDay={selectedDay} todayStr={todayStr} onSelect={setSelectedDay} />
            {expanded && (
              <>
                <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
                <MiniMonth {...month1} eventMap={eventMap} selectedDay={selectedDay} todayStr={todayStr} onSelect={setSelectedDay} />
              </>
            )}
          </>
        )}
      </div>

      {/* Day events panel */}
      {selectedDay && selectedEvents.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '0.875rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--fg)', margin: 0 }}>
              {selectedLabel}
            </p>
            <button
              onClick={() => setSelectedDay('')}
              style={{ fontSize: '0.72rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              Close
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {selectedEvents.map((ev) => (
              <div
                key={ev.id}
                onClick={() => router.push(ev.type === 'inspection'
                  ? `/dashboard/fm/inspections/${ev.id}`
                  : `/dashboard/fm/work-orders?focus=${ev.id}`
                )}
                style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '0.625rem 0.875rem',
                  background: ev.isOverdue ? 'var(--red-c)' : 'var(--card-b)',
                  border: `1px solid ${ev.isOverdue ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: 10, cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                <div style={{ flexShrink: 0, width: 6, height: 6, borderRadius: '50%',
                  background: ev.isOverdue ? 'var(--red)' : ev.type === 'inspection' ? 'var(--primary)' : 'var(--amber)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.title}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: 0 }}>{ev.propertyName}</p>
                </div>
                <FmBadge variant={ev.type === 'inspection' ? 'info' : ev.isOverdue ? 'danger' : 'warning'}>
                  {ev.isOverdue ? 'Overdue' : ev.type === 'inspection' ? 'Inspection' : 'Work Order'}
                </FmBadge>
              </div>
            ))}
          </div>
        </div>
      )}
    </FmCard>
  )
}

// ── Main Dashboard Page ────────────────────────────────────────────────────

export default function FMDashboardPage() {
  const [data, setData]       = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    fetch('/api/fm/analytics/dashboard')
      .then((r) => {
        if (!r.ok) throw new Error(`Dashboard error: ${r.status}`)
        return r.json() as Promise<DashboardData>
      })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Map markers — color by property status
  const mapMarkers = useMemo(() => {
    if (!data?.propertiesGeo) return []
    return data.propertiesGeo.map((p) => ({
      id: p.id,
      lat: p.latitude,
      lng: p.longitude,
      color: p.status === 'ACTIVE' ? '#34d399' : p.status === 'MAINTENANCE' ? '#fbbf24' : '#fb7185',
      label: p.name,
    }))
  }, [data])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6rem 0' }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ padding: '4rem 0', textAlign: 'center' }}>
        <AlertTriangle size={32} style={{ color: 'var(--amber)', margin: '0 auto 0.75rem' }} />
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{error ?? 'No data available'}</p>
        <button onClick={load} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          Retry
        </button>
      </div>
    )
  }

  // Top properties — use geo properties or all if none have coords
  const topProperties = data.propertiesGeo.slice(0, 8)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.25rem 0' }}>

      {/* ── Header ── */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
          Portfolio Intelligence — properties, assets &amp; inspections overview
        </p>
      </div>

      {/* ── 5 Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.875rem' }}>
        <StatCard
          icon={<Building2 size={18} />}
          label="Total Properties"
          value={data.properties.total}
          sub={`${data.properties.active} active`}
          accent="primary"
        />
        <StatCard
          icon={<ClipboardCheck size={18} />}
          label="Upcoming Inspections"
          value={data.upcomingInspections}
          sub="Next 30 days"
          accent="violet"
          active={data.upcomingInspections > 0}
        />
        <StatCard
          icon={<Wrench size={18} />}
          label="Open Work Orders"
          value={data.workOrders.open}
          sub={`${data.workOrders.inProgress} in progress`}
          accent="amber"
        />
        <StatCard
          icon={<AlertTriangle size={18} />}
          label="Overdue Work Orders"
          value={data.overdueWorkOrders}
          accent="red"
          active={data.overdueWorkOrders > 0}
        />
        <StatCard
          icon={<Activity size={18} />}
          label="Compliance Rate"
          value={data.complianceRate > 0 ? `${data.complianceRate}%` : '—'}
          sub="Last 30 days"
          accent="teal"
          trend={data.complianceRate >= 80 ? '↑ On track' : data.complianceRate > 0 ? '↓ Needs attention' : undefined}
        />
      </div>

      {/* ── Map + Approvals ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: '1.25rem', minHeight: 420 }}>
        {/* Map */}
        <div style={{
          borderRadius: 16, overflow: 'hidden',
          border: '1px solid var(--border)',
          position: 'relative',
          minHeight: 380,
        }}>
          {/* Condition legend */}
          <div style={{
            position: 'absolute', top: '0.875rem', right: '0.875rem', zIndex: 10,
            background: 'var(--card)', backdropFilter: 'blur(12px)',
            border: '1px solid var(--border)', borderRadius: 10,
            padding: '0.5rem 0.875rem',
            display: 'flex', flexDirection: 'column', gap: '0.3rem',
          }}>
            <p style={{ fontSize: '0.55rem', fontWeight: 900, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 0.25rem' }}>
              Condition Legend
            </p>
            {[
              { color: '#34d399', label: 'Active' },
              { color: '#fbbf24', label: 'Maintenance' },
              { color: '#fb7185', label: 'Inactive' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', color: 'var(--muted)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {label}
              </div>
            ))}
          </div>

          <MapView
            markers={mapMarkers}
            center={{ lat: 18.3830, lng: -66.0858 }}
            zoom={10}
            showOutsideOverlay={false}
          />
        </div>

        {/* Approvals */}
        <ApprovalsPanel items={data.pendingApprovals} loading={false} />
      </div>

      {/* ── Top Properties ── */}
      <TopProperties properties={topProperties} loading={false} />

      {/* ── Maintenance Timeline ── */}
      <MaintenanceTimeline events={data.scheduledEvents} loading={false} />

    </div>
  )
}
