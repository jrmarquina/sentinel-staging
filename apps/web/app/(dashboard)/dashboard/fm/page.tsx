'use client'

import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2, Wrench, ClipboardCheck, AlertTriangle,
  Loader2, Activity, CheckCircle, Calendar,
  Maximize2, Minimize2, MapPin, ArrowRight,
} from 'lucide-react'
import { FmCard, FmBadge, FmSectionLabel, statusVariant } from '@/components/fm'

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
  id: string; updated_at: string
  fm_properties: { name: string } | null
  fm_templates:  { name: string } | null
}

interface RecentInspection {
  id: string; status: string; score: number | null
  scheduled_for: string | null; updated_at: string
  property_name: string; template_name: string | null
}

interface ScheduledEvent {
  id: string; title: string; type: 'inspection' | 'work_order'
  date: string; datetime: string; propertyId: string | null
  propertyName: string; templateName: string | null
  isOverdue: boolean; status: string
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
  recentInspections:   RecentInspection[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDayCount(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

/** Solid heatmap colors: 1=blue, 2=yellow/amber, 3+=red */
function eventCountColor(count: number): { bg: string; textColor: string } {
  if (count >= 3) return { bg: 'var(--red)',     textColor: '#fff' }
  if (count === 2) return { bg: 'var(--amber)',   textColor: '#1a1000' }
  if (count === 1) return { bg: 'var(--primary)', textColor: '#fff' }
  return { bg: 'transparent', textColor: 'var(--fg)' }
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
  icon, label, value, sub, accent = 'primary', active = false, trend, href,
}: {
  icon: React.ReactNode; label: string; value: string | number
  sub?: string; accent?: AccentKey; active?: boolean; trend?: string; href: string
}) {
  const a = ACCENT[accent]
  const [hovered, setHovered] = useState(false)
  const router = useRouter()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => e.key === 'Enter' && router.push(href)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: active ? a.bg : 'var(--card)',
        border: `1px solid ${active || hovered ? a.border : 'var(--border)'}`,
        borderRadius: 16, padding: '1.25rem 1rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem',
        cursor: 'pointer',
        boxShadow: hovered ? `0 8px 24px -4px ${a.color}30, var(--shadow)` : 'var(--shadow)',
        transform: hovered ? 'translateY(-4px) scale(1.02)' : 'none',
        transition: 'all 0.2s ease',
        userSelect: 'none',
      }}
    >
      <div style={{ padding: '0.625rem', borderRadius: 12, background: a.bg, border: `1px solid ${a.border}25`, color: a.color, display: 'flex' }}>
        {icon}
      </div>
      <p style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center', margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: '1.6rem', fontWeight: 800, color: active ? a.color : 'var(--fg)', margin: 0, lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: '0.65rem', color: 'var(--muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sub}</p>}
      {trend && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--teal)', background: 'var(--teal-c)', padding: '0.1rem 0.4rem', borderRadius: 4 }}>{trend}</span>}
    </div>
  )
}

// ── Inspections Panel (right column, spans 3 rows) ─────────────────────────

function inspStatusStyle(status: string): { bg: string; color: string; label: string } {
  switch (status) {
    case 'PENDING_APPROVAL': return { bg: 'var(--amber-c)',  color: 'var(--amber)',   label: 'Approval' }
    case 'IN_PROGRESS':      return { bg: 'var(--primary-c)', color: 'var(--primary)', label: 'In Progress' }
    case 'SCHEDULED':        return { bg: 'var(--violet-c)', color: 'var(--violet)',  label: 'Scheduled' }
    case 'COMPLETED':        return { bg: 'var(--teal-c)',   color: 'var(--teal)',    label: 'Done' }
    case 'DRAFT':            return { bg: 'var(--card-b)',   color: 'var(--muted)',   label: 'Draft' }
    default:                 return { bg: 'var(--card-b)',   color: 'var(--muted)',   label: status }
  }
}

function InspectionsPanel({
  inspections, pendingApprovals, totals,
}: {
  inspections: RecentInspection[]
  pendingApprovals: PendingApproval[]
  totals: DashboardData['inspections']
}) {
  const router = useRouter()

  // Sort: PENDING_APPROVAL first, then IN_PROGRESS, then SCHEDULED, then rest
  const ORDER: Record<string, number> = { PENDING_APPROVAL: 0, IN_PROGRESS: 1, SCHEDULED: 2, DRAFT: 3, COMPLETED: 4 }
  const sorted = [...inspections].sort((a, b) => (ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5))

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: 'var(--shadow)',
      height: '100%',
    }}>
      {/* Header */}
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <ClipboardCheck size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <p style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0, flex: 1 }}>
            Inspections
          </p>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, background: 'var(--primary-c)', color: 'var(--primary)', padding: '0.1rem 0.5rem', borderRadius: 9999 }}>
            {totals.total}
          </span>
        </div>

        {/* Quick stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {[
            { label: 'Pending',     value: totals.pending,    color: 'var(--amber)' },
            { label: 'In Progress', value: totals.inProgress, color: 'var(--primary)' },
            { label: 'Completed',   value: totals.completed,  color: 'var(--teal)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--card-b)', borderRadius: 8, padding: '0.375rem 0.5rem', textAlign: 'center', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: '1rem', fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{value}</p>
              <p style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0.2rem 0 0' }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {sorted.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', padding: '3rem 1rem' }}>
            No inspections yet.
          </p>
        ) : (
          sorted.map((insp) => {
            const { bg, color, label } = inspStatusStyle(insp.status)
            const dateStr = insp.scheduled_for
              ? new Date(insp.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : new Date(insp.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

            return (
              <div
                key={insp.id}
                onClick={() => router.push(`/dashboard/fm/inspections/${insp.id}`)}
                style={{
                  padding: '0.75rem 1.25rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.12s ease',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.625rem',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card-b)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {/* Status dot */}
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {insp.template_name ?? 'Inspection'}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0.15rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {insp.property_name}
                  </p>
                </div>

                {/* Right side: score or date + status */}
                <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 800, background: bg, color, padding: '0.1rem 0.45rem', borderRadius: 4 }}>
                    {label}
                  </span>
                  {insp.score != null ? (
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: insp.score >= 80 ? 'var(--teal)' : insp.score >= 60 ? 'var(--amber)' : 'var(--red)' }}>
                      {Math.round(insp.score)}%
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.68rem', color: 'var(--faint)' }}>{dateStr}</span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <Link href="/dashboard/fm/inspections" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
          View all inspections <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  )
}

// ── Top Properties ─────────────────────────────────────────────────────────

const CARD_GRADIENTS = [
  'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
  'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)',
  'linear-gradient(135deg, #0d1b2a, #1b263b, #415a77)',
  'linear-gradient(135deg, #10002b, #240046, #3c096c)',
  'linear-gradient(135deg, #03071e, #370617, #6a040f)',
]

function TopProperties({ properties }: { properties: PropertyGeo[] }) {
  const router = useRouter()
  if (properties.length === 0) return null
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
      <div style={{ display: 'flex', gap: '0.875rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        {properties.map((prop, i) => (
          <div
            key={prop.id}
            onClick={() => router.push(`/dashboard/fm/properties/${prop.id}`)}
            style={{ flexShrink: 0, width: 200, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
          >
            <div style={{ height: 110, background: CARD_GRADIENTS[i % CARD_GRADIENTS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <Building2 size={36} style={{ color: 'rgba(255,255,255,0.12)' }} />
              <div style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', borderRadius: 6, padding: '0.15rem 0.45rem', fontSize: '0.6rem', fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>
                {prop.code}
              </div>
              <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}>
                <FmBadge variant={prop.status === 'ACTIVE' ? 'success' : prop.status === 'ARCHIVED' ? 'danger' : 'warning'}>
                  {prop.status}
                </FmBadge>
              </div>
            </div>
            <div style={{ padding: '0.625rem', background: 'var(--card)' }}>
              <p style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prop.name}</p>
              <p style={{ fontSize: '0.68rem', color: 'var(--muted)', margin: '0.2rem 0 0', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <MapPin size={9} /> Puerto Rico
              </p>
            </div>
          </div>
        ))}
      </div>
    </FmCard>
  )
}

// ── Two-Month Calendar (heatmap: 1=blue, 2=yellow, 3+=red) ───────────────

const DOW_LABELS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function TwoMonthCalendar({ events, router }: { events: ScheduledEvent[]; router: ReturnType<typeof useRouter> }) {
  const [selectedDay, setSelectedDay] = useState<string>('')

  const months = useMemo(() => {
    const now = new Date()
    return [
      { month: now.getMonth(),       year: now.getFullYear() },
      { month: (now.getMonth() + 1) % 12, year: now.getFullYear() + (now.getMonth() === 11 ? 1 : 0) },
    ]
  }, [])

  const eventMap = useMemo(() => {
    const map: Record<string, ScheduledEvent[]> = {}
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    }
    return map
  }, [events])

  const todayStr = toYMD(new Date())
  const selectedEvents = selectedDay ? (eventMap[selectedDay] ?? []) : []
  const selectedLabel  = selectedDay
    ? new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : ''

  function renderMonth(month: number, year: number) {
    const dayCount = getDayCount(year, month)
    const firstDOW = new Date(year, month, 1).getDay()
    const label    = new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()

    return (
      <div key={`${year}-${month}`} style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.62rem', fontWeight: 900, color: 'var(--muted)', letterSpacing: '0.1em', textAlign: 'center', marginBottom: '0.625rem', margin: '0 0 0.625rem' }}>
          {label}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem' }}>
          {DOW_LABELS_SHORT.map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: '0.52rem', fontWeight: 900, color: 'var(--faint)', paddingBottom: '0.2rem' }}>{d}</div>
          ))}
          {Array.from({ length: firstDOW }).map((_, i) => <div key={`pad-${i}`} />)}
          {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => {
            const dateStr    = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayEvs     = eventMap[dateStr] ?? []
            const count      = dayEvs.length
            const { bg, textColor } = eventCountColor(count)
            const isToday    = dateStr === todayStr
            const isSelected = dateStr === selectedDay

            return (
              <div
                key={dateStr}
                onClick={() => count > 0 && setSelectedDay(isSelected ? '' : dateStr)}
                style={{
                  aspectRatio: '1',
                  borderRadius: 5,
                  background: count === 0 ? 'var(--card-b)' : bg,
                  border: isSelected
                    ? '2px solid var(--fg)'
                    : isToday
                    ? '1px solid var(--primary)'
                    : '1px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.62rem', fontWeight: count > 0 ? 800 : 400,
                  color: count > 0 ? textColor : isToday ? 'var(--primary)' : 'var(--muted)',
                  cursor: count > 0 ? 'pointer' : 'default',
                  transition: 'all 0.1s ease',
                }}
              >
                {day}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {/* Two month grids side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {months.map(({ month, year }) => renderMonth(month, year))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'flex-end' }}>
        {[
          { color: 'var(--primary)', label: '1 event' },
          { color: 'var(--amber)',   label: '2 events' },
          { color: 'var(--red)',     label: '3+ events' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.58rem', color: 'var(--muted)' }}>
            <div style={{ width: 8, height: 8, borderRadius: 3, background: color, flexShrink: 0 }} />
            {label}
          </div>
        ))}
      </div>

      {/* Expanded day events — fixed max-height so calendar card doesn't grow unbounded */}
      {selectedDay && selectedEvents.length > 0 && (
        <div style={{ background: 'var(--card-b)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>{selectedLabel}</p>
            <button onClick={() => setSelectedDay('')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, lineHeight: 1, padding: '0 2px' }}>✕</button>
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto', padding: '0.5rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {selectedEvents.map((ev) => {
              const isInspection = ev.type === 'inspection'
              const time = ev.datetime
                ? new Date(ev.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : null
              return (
                <div
                  key={ev.id}
                  onClick={() => router.push(isInspection ? `/dashboard/fm/inspections/${ev.id}` : `/dashboard/fm/work-orders?focus=${ev.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.5rem', background: 'var(--card)', borderRadius: 6, cursor: 'pointer', transition: 'opacity 0.12s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.72' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                >
                  {time && <span style={{ width: 48, fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>{time}</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>
                      {isInspection ? (ev.templateName ?? ev.title) : ev.title}
                    </p>
                    <p style={{ fontSize: '0.6rem', color: 'var(--muted)', margin: 0 }}>{ev.propertyName}</p>
                  </div>
                  <div style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: '0.57rem', fontWeight: 900, flexShrink: 0,
                    background: isInspection ? 'var(--primary-c)' : ev.isOverdue ? 'var(--red-c)' : 'var(--amber-c)',
                    color:      isInspection ? 'var(--primary)'   : ev.isOverdue ? 'var(--red)'   : 'var(--amber)',
                  }}>
                    {isInspection ? 'INSP' : ev.isOverdue ? 'OVERDUE' : 'WO'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Gantt Timeline (inline 14-day) ─────────────────────────────────────────

function GanttTimeline({ events }: { events: ScheduledEvent[] }) {
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d
  }), [])

  const todayMs = new Date().setHours(0, 0, 0, 0)

  const items = useMemo(() => events.filter((ev) => {
    const diff = new Date(ev.date).getTime() - todayMs
    return diff >= 0 && diff <= 14 * 86_400_000
  }).slice(0, 12), [events, todayMs])

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 600 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
          <div style={{ width: 150, flexShrink: 0, fontSize: '0.6rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase' }}>Property / Task</div>
          {days.map((d, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '0.58rem', fontWeight: 700, color: 'var(--muted)' }}>
              {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          ))}
        </div>

        {items.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', padding: '2rem 0', opacity: 0.5 }}>
            No events in the next 14 days
          </p>
        ) : items.map((item) => {
          const dayIdx = Math.floor((new Date(item.date).getTime() - todayMs) / 86_400_000)
          const isInsp = item.type === 'inspection'
          const color  = item.isOverdue ? 'var(--red)' : isInsp ? 'var(--primary)' : 'var(--amber)'

          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '0.45rem 0', borderBottom: '1px solid var(--border)10' }}>
              <div style={{ width: 150, flexShrink: 0, fontSize: '0.72rem', fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '0.5rem' }}>
                {item.propertyName || item.title}
              </div>
              <div style={{ flex: 14, display: 'flex', position: 'relative', height: 22 }}>
                {dayIdx >= 0 && dayIdx < 14 && (
                  <div style={{
                    position: 'absolute',
                    left: `${(dayIdx / 14) * 100}%`,
                    width: 'calc(100% / 14 - 3px)', height: '100%',
                    background: color, borderRadius: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.58rem', fontWeight: 900, color: '#fff',
                    cursor: 'pointer',
                  }} title={item.title}>
                    {isInsp ? 'I' : 'W'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Full-screen Portal ─────────────────────────────────────────────────────

type FsTab = 'property-gantt' | 'detailed-calendar' | 'heat-map'
const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function FullScreenHeatMap({ events }: { events: ScheduledEvent[] }) {
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    return { month: d.getMonth(), year: d.getFullYear() }
  })

  const eventMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const ev of events) { map[ev.date] = (map[ev.date] ?? 0) + 1 }
    return map
  }, [events])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3rem' }}>
      {months.map(({ month, year }) => {
        const dayCount = getDayCount(year, month)
        const firstDOW = new Date(year, month, 1).getDay()
        return (
          <div key={`${year}-${month}`}>
            <p style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--fg)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>
              {new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {DOW_LABELS.map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: '0.6rem', fontWeight: 900, color: 'var(--faint)', paddingBottom: 4 }}>{d}</div>)}
              {Array.from({ length: firstDOW }).map((_, i) => <div key={`p-${i}`} />)}
              {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const count = eventMap[dateStr] ?? 0
                const { bg, textColor } = eventCountColor(count)
                return (
                  <div key={day} style={{ aspectRatio: '1', borderRadius: 8, background: count === 0 ? 'var(--card-b)' : bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 800, color: count > 0 ? textColor : 'var(--faint)' }}>
                    {day}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FullScreenDetailedCalendar({ events }: { events: ScheduledEvent[] }) {
  const days  = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d }), [])
  const hours = Array.from({ length: 12 }, (_, i) => i + 8)

  function eventsForCell(day: Date, hour: number) {
    return events.filter((ev) => {
      if (!ev.datetime) return false
      const d = new Date(ev.datetime)
      return d.toDateString() === day.toDateString() && d.getHours() === hour
    })
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(14, minmax(80px, 1fr))`, gap: 1, background: 'var(--border)', minWidth: 1200 }}>
        <div style={{ background: 'var(--bg)', padding: '1rem' }} />
        {days.map((d) => (
          <div key={d.toISOString()} style={{ background: 'var(--bg)', padding: '0.875rem 0.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 800 }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--fg)' }}>{d.getDate()}</div>
          </div>
        ))}
        {hours.map((h) => (
          <>
            <div key={`h-${h}`} style={{ background: 'var(--bg)', padding: '1rem 0.75rem', fontSize: '0.7rem', color: 'var(--muted)', textAlign: 'right', fontWeight: 700 }}>
              {h > 12 ? `${h - 12} PM` : `${h} AM`}
            </div>
            {days.map((d) => {
              const cellEvs = eventsForCell(d, h)
              return (
                <div key={`${d.toISOString()}-${h}`} style={{ background: 'var(--bg)', padding: 4, minHeight: 64 }}>
                  {cellEvs.map((ev, i) => (
                    <div key={i} style={{
                      padding: '3px 6px', borderRadius: 4, fontSize: '0.6rem', fontWeight: 700, marginBottom: 2,
                      background: ev.type === 'inspection' ? 'var(--primary-c)' : 'var(--amber-c)',
                      border: `1px solid ${ev.type === 'inspection' ? 'var(--primary)' : 'var(--amber)'}`,
                      color: ev.type === 'inspection' ? 'var(--primary)' : 'var(--amber)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ev.propertyName}: {ev.templateName ?? ev.title}
                    </div>
                  ))}
                </div>
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}

function FullScreenPropertyGantt({ events, properties }: { events: ScheduledEvent[]; properties: PropertyGeo[] }) {
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d }), [])

  return (
    <div style={{ minWidth: 1000 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingBottom: '0.875rem', marginBottom: '0.5rem' }}>
        <div style={{ width: 250, fontSize: '0.7rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase' }}>Property Name</div>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted)' }}>
            {d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
          </div>
        ))}
      </div>
      {properties.map((p) => {
        const propEvents = events.filter((ev) => ev.propertyId === p.id)
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '0.875rem 0', borderBottom: '1px solid var(--border)10' }}>
            <div style={{ width: 250, fontWeight: 800, fontSize: '0.9rem', color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '1rem' }}>{p.name}</div>
            <div style={{ flex: 14, display: 'flex', position: 'relative', height: 32 }}>
              {days.map((d, dayIdx) => {
                const dayEvs = propEvents.filter((ev) => new Date(ev.date).toDateString() === d.toDateString())
                if (dayEvs.length === 0) return <div key={dayIdx} style={{ flex: 1 }} />
                return (
                  <div key={dayIdx} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '0 3px' }}>
                    {dayEvs.map((ev, ei) => (
                      <div key={ei} title={ev.templateName ?? ev.title} style={{
                        flex: 1, height: 24, borderRadius: 5,
                        background: ev.type === 'inspection' ? 'var(--primary)' : ev.isOverdue ? 'var(--red)' : 'var(--amber)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      }} />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {properties.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem', padding: '3rem' }}>No properties with coordinates available</p>
      )}
    </div>
  )
}

function FullScreenTimeline({ events, properties, onClose }: { events: ScheduledEvent[]; properties: PropertyGeo[]; onClose: () => void }) {
  const [tab, setTab] = useState<FsTab>('property-gantt')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const TABS: { id: FsTab; label: string }[] = [
    { id: 'property-gantt',    label: 'Property Gantt' },
    { id: 'detailed-calendar', label: '2-Week Schedule' },
    { id: 'heat-map',          label: '6-Month Heatmap' },
  ]

  if (!mounted) return null

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'var(--bg)', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg)', margin: 0 }}>
            Portfolio Intelligence Command
          </h2>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: tab === t.id ? 'var(--primary)' : 'var(--muted)',
                borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                padding: '0.5rem 0.875rem', transition: 'color 0.15s ease',
              }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.375rem 0.625rem', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
        >
          <Minimize2 size={15} /> Exit
        </button>
      </header>
      <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '2rem' }}>
        {tab === 'property-gantt'    && <FullScreenPropertyGantt events={events} properties={properties} />}
        {tab === 'detailed-calendar' && <FullScreenDetailedCalendar events={events} />}
        {tab === 'heat-map'          && <FullScreenHeatMap events={events} />}
      </main>
    </div>,
    document.body
  )
}

// ── Maintenance Timeline widget ────────────────────────────────────────────

function MaintenanceTimeline({ events, properties }: { events: ScheduledEvent[]; properties: PropertyGeo[] }) {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<'gantt' | 'calendar'>('calendar')
  const [isFullScreen, setIsFullScreen] = useState(false)

  return (
    <FmCard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <FmSectionLabel>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={13} style={{ color: 'var(--primary)' }} />
              Schedule
            </span>
          </FmSectionLabel>
          <div style={{ display: 'flex', background: 'var(--card-b)', borderRadius: 8, padding: 2, border: '1px solid var(--border)' }}>
            {(['calendar', 'gantt'] as const).map((mode) => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: '4px 11px', border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: '0.63rem', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                background: viewMode === mode ? 'var(--primary)' : 'transparent',
                color: viewMode === mode ? '#fff' : 'var(--muted)',
                transition: 'all 0.15s ease',
              }}>
                {mode === 'calendar' ? '2 Weeks' : 'Gantt'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setIsFullScreen(true)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, display: 'flex', transition: 'color 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
          title="Full screen"
        >
          <Maximize2 size={18} />
        </button>
      </div>

      {viewMode === 'gantt'
        ? <GanttTimeline events={events} />
        : <TwoMonthCalendar events={events} router={router} />
      }

      {isFullScreen && (
        <FullScreenTimeline events={events} properties={properties} onClose={() => setIsFullScreen(false)} />
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
    setLoading(true); setError(null)
    fetch('/api/fm/analytics/dashboard')
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<DashboardData> })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const mapMarkers = useMemo(() => (data?.propertiesGeo ?? []).map((p) => ({
    id: p.id, lat: p.latitude, lng: p.longitude,
    color: p.status === 'ACTIVE' ? '#34d399' : p.status === 'ARCHIVED' ? '#fb7185' : '#fbbf24',
    label: p.name,
  })), [data])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6rem 0' }}>
      <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
    </div>
  )

  if (error || !data) return (
    <div style={{ padding: '4rem 0', textAlign: 'center' }}>
      <AlertTriangle size={32} style={{ color: 'var(--amber)', margin: '0 auto 0.75rem' }} />
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{error ?? 'No data'}</p>
      <button onClick={load} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Retry</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', padding: '0.25rem 0' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '0.25rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>Dashboard</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
          Portfolio Intelligence — properties, assets &amp; inspections
        </p>
      </div>

      {/* ── Row 1: 5 equal stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.875rem' }}>
        <StatCard icon={<Building2 size={18} />}       label="Total Properties"     value={data.properties.total}       sub={`${data.properties.active} active`}          accent="primary" href="/dashboard/fm/properties" />
        <StatCard icon={<ClipboardCheck size={18} />}  label="Upcoming Inspections" value={data.upcomingInspections}    sub="Next 30 days"                                accent="violet"  active={data.upcomingInspections > 0} href="/dashboard/fm/inspections" />
        <StatCard icon={<Wrench size={18} />}          label="Open Work Orders"     value={data.workOrders.open}        sub={`${data.workOrders.inProgress} in progress`} accent="amber"   href="/dashboard/fm/work-orders" />
        <StatCard icon={<AlertTriangle size={18} />}   label="Overdue Work Orders"  value={data.overdueWorkOrders}                                                         accent="red"     active={data.overdueWorkOrders > 0} href="/dashboard/fm/work-orders?filter=OVERDUE" />
        <StatCard icon={<Activity size={18} />}        label="Compliance Rate"      value={data.complianceRate > 0 ? `${data.complianceRate}%` : '—'} sub="Avg score"   accent="teal"    trend={data.complianceRate >= 80 ? '↑ On track' : data.complianceRate > 0 ? '↓ Attention' : undefined} href="/dashboard/fm/inspections" />
      </div>

      {/* ── Rows 2-4: 3-col left column + 2-col right panel ──────────────────
          The outer grid maintains fixed 0.875rem gap between columns.
          The left flex column maintains fixed 0.875rem gap between widgets.
          The right InspectionsPanel stretches to match the left column height.
         ─────────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '0.875rem', alignItems: 'stretch' }}>

        {/* Left column: Map → Top Properties → Calendar (fixed gaps) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

          {/* Map — explicit height so MapLibre canvas renders */}
          <div style={{ height: 360, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative', flexShrink: 0, boxShadow: 'var(--shadow)' }}>
            <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', zIndex: 10, background: 'var(--card)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.45rem 0.75rem' }}>
              <p style={{ fontSize: '0.53rem', fontWeight: 900, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 0.25rem' }}>Legend</p>
              {[{ color: '#34d399', label: 'Active' }, { color: '#fbbf24', label: 'Inactive' }, { color: '#fb7185', label: 'Archived' }].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.62rem', color: 'var(--muted)', marginBottom: 2 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  {label}
                </div>
              ))}
            </div>
            <MapView markers={mapMarkers} center={{ lat: 18.3830, lng: -66.0858 }} zoom={13} showOutsideOverlay={false} />
          </div>

          {/* Top Properties */}
          <TopProperties properties={data.propertiesGeo} />

          {/* Calendar / Gantt timeline */}
          <MaintenanceTimeline events={data.scheduledEvents} properties={data.propertiesGeo} />

        </div>

        {/* Right column: Inspections panel — stretches to match left column height */}
        <InspectionsPanel
          inspections={data.recentInspections}
          pendingApprovals={data.pendingApprovals}
          totals={data.inspections}
        />

      </div>
    </div>
  )
}
