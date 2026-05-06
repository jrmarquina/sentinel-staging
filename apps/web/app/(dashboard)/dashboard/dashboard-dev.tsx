'use client'

import Link from 'next/link'
import { format, parseISO, addDays, differenceInDays } from 'date-fns'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useRef, useEffect, useState } from 'react'
import type { MarkerSpec } from '@/components/map/MapView'

// ── Dynamic map import (avoids SSR with maplibre-gl) ──────────────────────────
const DashMapView = dynamic(
  () => import('@/components/map/MapView').then((m) => ({ default: m.MapView })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full animate-pulse" style={{ background: 'var(--ca-section)' }} />
    ),
  }
)

// ── Exported types (imported by page.tsx and dashboard-client.tsx) ────────────
export type DelayStatus = 'overdue' | 'at_risk' | 'on_track' | 'closed'

export interface DevPriorityItem {
  id: string
  type: 'project' | 'work_order'
  number: string
  title: string
  dueDate: string | null
  delay: DelayStatus
  blocked: boolean
  blockedBy: string | null
  href: string
}

export interface DevUpcomingItem {
  id: string
  type: 'project' | 'work_order' | 'contract'
  number: string
  title: string
  dueDate: string
  href: string
}

export interface DevStats {
  totalWorkOrders: number
  openWorkOrders: number
  dueThisWeek: number
  activeContracts: number
  totalInspections: number
  pendingInspections: number
  activePotholes: number
  totalProjects: number
  activeProjects: number
  overdueCount: number
}

export interface AssigneeWorkload {
  assigneeId: string | null
  name: string
  open: number
  inProgress: number
}

export interface PotholeMonthPoint {
  label:             string
  opened:            number
  closed:            number
  cumulativeOpened:  number
  cumulativeClosed:  number
  backlog:           number
}

export interface PotholeBacklogData {
  months:         PotholeMonthPoint[]
  currentBacklog: number
}

export interface ProjectMarker {
  id: string
  number: string
  name: string
  lat: number
  lng: number
  status: string
}

export interface GanttProject {
  id: string
  number: string
  name: string
  startDate: string | null
  endDate: string | null
  status: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function greetingByHour(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const TYPE_LABEL: Record<string, string> = {
  project:    'PROJ',
  work_order: 'WO',
  inspection: 'INSP',
  contract:   'CNT',
}

const TYPE_BG: Record<string, string> = {
  project:    'var(--ca-primary-c, #dae2fd)',
  work_order: 'color-mix(in srgb, var(--ca-primary-c, #dae2fd) 60%, white)',
  inspection: 'var(--ca-card-high, #ddeaf3)',
  contract:   'var(--ca-card-high, #ddeaf3)',
}

const TYPE_INK: Record<string, string> = {
  project:    'var(--ca-primary, #565e74)',
  work_order: 'var(--ca-primary-dim, #4a5268)',
  inspection: 'var(--ca-ink-muted, #52616a)',
  contract:   'var(--ca-ink-muted, #52616a)',
}

const GANTT_BAR_COLOR: Record<string, string> = {
  active:   'var(--ca-primary, #565e74)',
  on_hold:  'var(--ca-amber, #b45309)',
  planning: 'var(--ca-ink-faint, #a4b4be)',
  draft:    'var(--ca-ink-faint, #a4b4be)',
}

const card: React.CSSProperties = {
  background: 'var(--ca-card, #ffffff)',
  borderRadius: '0.75rem',
  boxShadow: '0 1px 4px rgba(38,52,61,0.06)',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DelayDot({ delay, blocked }: { delay: DelayStatus; blocked: boolean }) {
  if (blocked) return <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--ca-amber, #b45309)' }} />
  if (delay === 'overdue') return <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--ca-red, #9f403d)' }} />
  if (delay === 'at_risk') return <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--ca-amber, #b45309)' }} />
  return <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--ca-teal, #006b62)' }} />
}

function StatusPill({ delay, blocked }: { delay: DelayStatus; blocked: boolean }) {
  if (blocked) return (
    <span className="text-[9px] px-2 py-0.5 rounded-full font-black whitespace-nowrap"
      style={{ background: 'var(--ca-amber-c, #fef3c7)', color: 'var(--ca-amber, #b45309)' }}>
      BLOCKED
    </span>
  )
  if (delay === 'overdue') return (
    <span className="text-[9px] px-2 py-0.5 rounded-full font-black whitespace-nowrap"
      style={{ background: 'color-mix(in srgb, var(--ca-red-c, #fe8983) 30%, transparent)', color: 'var(--ca-red, #9f403d)' }}>
      OVERDUE
    </span>
  )
  if (delay === 'at_risk') return (
    <span className="text-[9px] px-2 py-0.5 rounded-full font-black whitespace-nowrap"
      style={{ background: 'var(--ca-amber-c, #fef3c7)', color: 'var(--ca-amber, #b45309)' }}>
      AT RISK
    </span>
  )
  return (
    <span className="text-[9px] px-2 py-0.5 rounded-full font-black whitespace-nowrap"
      style={{ background: 'color-mix(in srgb, var(--ca-teal-c, #91feef) 40%, transparent)', color: 'var(--ca-teal, #006b62)' }}>
      ON TRACK
    </span>
  )
}

function UpcomingStrip({ items }: { items: DevUpcomingItem[] }) {
  return (
    <div style={card} className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--ca-card-high)' }}>
        <h2 className="text-xs font-black uppercase tracking-[0.15em]">Upcoming — Next 14 Days</h2>
        {items.length > 0 && (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
            style={{ background: 'var(--ca-primary-c)', color: 'var(--ca-primary)' }}>
            {items.length}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-4 text-xs" style={{ color: 'var(--ca-ink-faint)' }}>
          Nothing due in the next 14 days.
        </p>
      ) : (
        <div className="flex gap-3 px-5 py-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {items.map((item) => (
            <Link
              key={`strip-${item.type}-${item.id}`}
              href={item.href}
              className="flex-shrink-0 w-28 rounded-xl p-3 transition-all"
              style={item.type === 'contract'
                ? { background: '#fef2f2', border: '1px solid #fecaca' }
                : { background: 'var(--ca-section)', border: '1px solid var(--ca-card-high)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = item.type === 'contract' ? '#fee2e2' : 'var(--ca-card-high)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = item.type === 'contract' ? '#fef2f2' : 'var(--ca-section)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <p className="text-[10px] font-black uppercase tracking-wider"
                style={{ color: item.type === 'contract' ? '#f87171' : 'var(--ca-ink-faint)' }}>
                {format(parseISO(item.dueDate), 'EEE')}
              </p>
              <p className="text-2xl font-black leading-none mt-0.5"
                style={{ letterSpacing: '-0.02em', color: item.type === 'contract' ? '#dc2626' : undefined }}>
                {format(parseISO(item.dueDate), 'd')}
              </p>
              <p className="text-[10px] font-semibold mt-2 leading-snug"
                style={{ color: item.type === 'contract' ? '#b91c1c' : 'var(--ca-ink-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {item.title}
              </p>
              <span className="inline-block mt-2 text-[9px] px-1.5 py-0.5 rounded font-black"
                style={item.type === 'contract'
                  ? { background: '#fecaca', color: '#991b1b' }
                  : { background: TYPE_BG[item.type], color: TYPE_INK[item.type] }}>
                {TYPE_LABEL[item.type]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function MapWidget({ markers }: { markers: ProjectMarker[] }) {
  const router = useRouter()

  const markerSpecs: MarkerSpec[] = markers.map((m) => ({
    id: m.id,
    lat: m.lat,
    lng: m.lng,
    color: m.status === 'active' ? '#22c55e'
      : m.status === 'on_hold' ? '#b45309'
      : '#565e74',
    label: `${m.number} — ${m.name}`,
  }))

  return (
    <div style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--ca-card-high)' }}>
        <h2 className="text-xs font-black uppercase tracking-[0.15em]">Project Locations</h2>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--ca-ink-muted)' }}>
          {markers.length} active project{markers.length !== 1 ? 's' : ''} mapped · click to open
        </p>
      </div>
      <div style={{ height: 240, flexShrink: 0 }}>
        <DashMapView
          markers={markerSpecs}
          center={{ lat: 18.366, lng: -66.11 }}
          zoom={10}
          showOutsideOverlay={false}
          onMarkerClick={(id) => router.push(`/dashboard/projects/${id}`)}
        />
      </div>
    </div>
  )
}

function PotholeBacklogWidget({ data }: { data: PotholeBacklogData }) {
  const months = data.months
  const currentBacklog = data.currentBacklog

  // ── Measure the chart container so viewBox == pixel dims (no distortion) ──
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 1 && height > 1) setDims({ w: Math.round(width), h: Math.round(height) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Don't render SVG until we have real measurements
  const ready = dims.w > 0 && dims.h > 0
  const W = dims.w
  const H = dims.h

  const n = months.length

  // Padding keeps numbers + labels inside the viewBox
  const padL = 24
  const padR = 24
  const padT = 24   // open-line numbers above the chart
  const padB = 30   // closed-line numbers + month labels below the chart

  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const maxVal = Math.max(...months.map((m) => m.backlog), ...months.map((m) => m.closed), 1)

  function cx(i: number) { return padL + (i / (n - 1)) * chartW }
  // clamp so the highest point sits exactly at padT (never above it)
  function cy(val: number) {
    return Math.max(padT, padT + chartH - (val / maxVal) * chartH)
  }

  const openPts:   [number, number][] = months.map((m, i) => [cx(i), cy(m.backlog)])
  const closedPts: [number, number][] = months.map((m, i) => [cx(i), cy(m.closed)])

  function ptsStr(pts: [number, number][]) {
    return pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  }

  const gapPoly = [...openPts, ...[...closedPts].reverse()]

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div className="px-4 py-2.5 flex-shrink-0 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--ca-card-high)' }}>
        {/* Left: title + legend stacked */}
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xs font-black uppercase tracking-[0.15em]">Pothole Backlog</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="inline-block w-4 h-0.5 rounded flex-shrink-0" style={{ background: 'var(--ca-ink-muted)' }} />
              <span className="text-[10px]" style={{ color: 'var(--ca-ink-faint)' }}>Open</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-4 h-0.5 rounded flex-shrink-0" style={{ background: '#22c55e' }} />
              <span className="text-[10px]" style={{ color: 'var(--ca-ink-faint)' }}>Closed</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: '#ef4444', opacity: 0.5 }} />
              <span className="text-[10px]" style={{ color: 'var(--ca-ink-faint)' }}>Backlog</span>
            </div>
          </div>
        </div>
        {/* Right: big number + label, vertically centered */}
        <div className="flex flex-col items-center justify-center">
          <span className="text-3xl font-black leading-none" style={{ color: '#ef4444', letterSpacing: '-0.03em' }}>{currentBacklog}</span>
          <span className="text-[10px] mt-0.5" style={{ color: 'var(--ca-ink-faint)' }}>open</span>
        </div>
      </div>

      {/* ── Chart container — measured, fills remaining card height ── */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
        {ready && (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ display: 'block', width: '100%', height: '100%' }}
          >
            <defs>
              {/* patternUnits="userSpaceOnUse" keeps stripes in pixel space — 45° stays 45° */}
              <pattern id="backlog-hatch" x="0" y="0" width="10" height="10"
                patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="10" height="10" fill="none" />
                <rect width="5" height="10" fill="#ef4444" opacity="0.40" />
              </pattern>
            </defs>

            {/* Grid lines */}
            {[0.25, 0.5, 0.75, 1.0].map((f) => (
              <line key={f}
                x1={padL} y1={cy(f * maxVal)} x2={W - padR} y2={cy(f * maxVal)}
                stroke="var(--ca-card-high)" strokeWidth="1"
              />
            ))}

            {/* Backlog fill between the two lines */}
            <polygon points={ptsStr(gapPoly)} fill="url(#backlog-hatch)" />

            {/* Closed line */}
            <polyline points={ptsStr(closedPts)} fill="none"
              stroke="#22c55e" strokeWidth="2.5" strokeLinejoin="round" />

            {/* Open line */}
            <polyline points={ptsStr(openPts)} fill="none"
              stroke="var(--ca-ink-muted)" strokeWidth="2.5" strokeLinejoin="round" />

            {/* Per-month: dots + numbers + month label */}
            {months.map((m, i) => {
              const ox  = cx(i), oy  = cy(m.backlog)
              const clx = cx(i), cly = cy(m.closed)
              const gap = cly - oy   // vertical distance between the two lines
              // Keep open label inside viewBox — clamp to padT - 2 minimum
              const openLabelY   = Math.max(padT - 2, oy - 7)
              const closedLabelY = Math.min(H - padB + 14, cly + (gap < 22 ? 19 : 13))
              return (
                <g key={m.label}>
                  <circle cx={ox}  cy={oy}  r="3.5" fill="var(--ca-ink-muted)" />
                  <circle cx={clx} cy={cly} r="3.5" fill="#22c55e" />

                  <text x={ox}  y={openLabelY} textAnchor="middle"
                    fontSize="10" fontWeight="700" fill="var(--ca-ink-muted)"
                    fontFamily="system-ui, sans-serif">{m.backlog}</text>

                  <text x={clx} y={closedLabelY} textAnchor="middle"
                    fontSize="10" fontWeight="600" fill="var(--ca-teal)"
                    fontFamily="system-ui, sans-serif">{m.closed}</text>

                  <text x={cx(i)} y={H - 7} textAnchor="middle"
                    fontSize="10" fill="var(--ca-ink-faint)"
                    fontFamily="system-ui, sans-serif">{m.label}</text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}

function WorkloadWidget({ workload }: { workload: AssigneeWorkload[] }) {
  const maxTotal = Math.max(...workload.map((w) => w.open + w.inProgress), 1)

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <div className="px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--ca-card-high)' }}>
        <h2 className="text-xs font-black uppercase tracking-[0.15em]">Assignee Workload</h2>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--ca-ink-muted)' }}>Open work orders by person</p>
      </div>
      <div className="flex-1 px-5 py-4">
        {workload.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'var(--ca-ink-faint)' }}>No assigned work orders</p>
        ) : (
          <div className="space-y-3">
            {workload.map((w) => {
              const total = w.open + w.inProgress
              const openW = (w.open / maxTotal) * 100
              const progressW = (w.inProgress / maxTotal) * 100
              return (
                <div key={w.assigneeId ?? '__unassigned'}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold truncate" style={{ maxWidth: '140px' }}>{w.name}</span>
                    <span className="text-[11px] font-black" style={{ color: 'var(--ca-ink-muted)' }}>{total}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: 'var(--ca-card-high)' }}>
                    {openW > 0 && (
                      <div className="h-full transition-all" style={{ width: `${openW}%`, background: 'var(--ca-primary-c, #dae2fd)' }} />
                    )}
                    {progressW > 0 && (
                      <div className="h-full transition-all" style={{ width: `${progressW}%`, background: 'var(--ca-primary, #565e74)' }} />
                    )}
                  </div>
                </div>
              )
            })}
            <div className="flex items-center gap-4 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-1.5 rounded-sm" style={{ background: 'var(--ca-primary-c)' }} />
                <span className="text-[9px] uppercase tracking-wider font-black" style={{ color: 'var(--ca-ink-faint)' }}>Open</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-1.5 rounded-sm" style={{ background: 'var(--ca-primary)' }} />
                <span className="text-[9px] uppercase tracking-wider font-black" style={{ color: 'var(--ca-ink-faint)' }}>In Progress</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function GanttWidget({ projects }: { projects: GanttProject[] }) {
  const today = new Date()
  const windowStart = addDays(today, -28)   // 4 weeks back
  const windowEnd   = addDays(today, 84)    // 12 weeks forward
  const windowDays  = differenceInDays(windowEnd, windowStart) // ~112

  function toPct(date: Date): number {
    const days = differenceInDays(date, windowStart)
    return Math.max(0, Math.min(100, (days / windowDays) * 100))
  }

  const todayPct = toPct(today)

  const visible = projects
    .filter((p) => p.startDate || p.endDate)
    .slice(0, 10)

  // Month tick marks across the window
  const monthTicks: { label: string; pct: number }[] = []
  const cursor = new Date(windowStart)
  cursor.setDate(1)
  cursor.setMonth(cursor.getMonth() + (cursor < windowStart ? 1 : 0))
  while (cursor <= windowEnd) {
    monthTicks.push({ label: format(cursor, 'MMM'), pct: toPct(cursor) })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return (
    <div style={card} className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--ca-card-high)' }}>
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.15em]">Active Project Timeline</h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ca-ink-muted)' }}>16-week window</p>
        </div>
        <Link href="/dashboard/projects" className="text-[10px] font-black hover:underline" style={{ color: 'var(--ca-primary)' }}>
          All projects →
        </Link>
      </div>

      <div className="px-5 py-4">
        {/* Month ruler */}
        <div className="relative mb-4 flex-shrink-0" style={{ marginLeft: '9rem', height: '16px' }}>
          {monthTicks.map((tick) => (
            <span
              key={tick.label + tick.pct}
              className="absolute text-[9px] font-black uppercase tracking-wider"
              style={{ left: `${tick.pct}%`, transform: 'translateX(-50%)', color: 'var(--ca-ink-faint)' }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'var(--ca-ink-faint)' }}>
            No projects with dates set.
          </p>
        ) : (
          <div className="space-y-2.5">
            {visible.map((proj) => {
              const start = proj.startDate ? parseISO(proj.startDate) : null
              const end   = proj.endDate   ? parseISO(proj.endDate)   : null
              const left  = start ? toPct(start) : todayPct
              const right = end   ? toPct(end)   : todayPct
              const width = Math.max(right - left, 0.8)
              const barColor = GANTT_BAR_COLOR[proj.status] ?? 'var(--ca-primary)'
              const isPastEnd = end && end < today

              return (
                <Link key={proj.id} href={`/dashboard/projects/${proj.id}`} className="flex items-center gap-3 group">
                  <div className="flex-shrink-0" style={{ width: '9rem' }}>
                    <p className="text-[9px] font-mono" style={{ color: 'var(--ca-ink-faint)' }}>{proj.number}</p>
                    <p className="text-[11px] font-semibold truncate group-hover:underline">{proj.name}</p>
                  </div>
                  <div className="flex-1 relative rounded-full" style={{ height: '12px', background: 'var(--ca-card-high)' }}>
                    {/* Today line */}
                    <div
                      className="absolute top-0 bottom-0 w-px z-10"
                      style={{ left: `${todayPct}%`, background: 'var(--ca-red, #9f403d)', opacity: 0.7 }}
                    />
                    {/* Project bar */}
                    <div
                      className="absolute top-0 bottom-0 rounded-full transition-opacity group-hover:opacity-100"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: barColor,
                        opacity: isPastEnd ? 0.35 : 0.75,
                      }}
                    />
                  </div>
                  {proj.endDate && (
                    <div className="flex-shrink-0 text-right" style={{ width: '3rem' }}>
                      <p className="text-[9px]" style={{ color: 'var(--ca-ink-faint)' }}>
                        {format(parseISO(proj.endDate), 'MMM d')}
                      </p>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  firstName: string
  stats: DevStats
  priorityItems: DevPriorityItem[]
  upcoming: DevUpcomingItem[]
  assigneeWorkload: AssigneeWorkload[]
  potholeStats: PotholeBacklogData
  projectMarkers: ProjectMarker[]
  ganttProjects: GanttProject[]
}

// ── Main component ────────────────────────────────────────────────────────────
export function DashboardDev({
  firstName,
  stats,
  priorityItems,
  upcoming,
  assigneeWorkload,
  potholeStats,
  projectMarkers,
  ganttProjects,
}: Props) {
  const today = new Date()
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' })
  const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const totalActive = stats.openWorkOrders + stats.activeProjects + stats.activeContracts + stats.pendingInspections + stats.activePotholes

  return (
    <div className="max-w-5xl mx-auto space-y-6" style={{ color: 'var(--ca-ink, #26343d)' }}>

      {/* ── Editorial header ── */}
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--ca-ink-faint, #a4b4be)' }}>
          {greetingByHour()}
        </p>
        <h1 className="text-4xl font-black tracking-tight leading-none mt-0.5" style={{ letterSpacing: '-0.02em' }}>
          {firstName}
        </h1>
        <p className="text-sm mt-1.5" style={{ color: 'var(--ca-ink-muted, #52616a)' }}>
          {dayName}, {dateStr} · {totalActive} active items across the department
        </p>
      </div>

      {/* ── Quick-nav buttons ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Work Orders',  href: '/dashboard/work-orders',  count: stats.totalWorkOrders,    accent: stats.dueThisWeek > 0 ? `${stats.dueThisWeek} due this week` : null,   accentColor: undefined as string | undefined, isAlert: false },
          { label: 'Projects',     href: '/dashboard/projects',      count: stats.totalProjects,      accent: stats.activeProjects !== stats.totalProjects ? `${stats.activeProjects} active` : null, accentColor: undefined, isAlert: false },
          { label: 'Inspections',  href: '/dashboard/inspections',   count: stats.totalInspections,   accent: stats.pendingInspections > 0 ? `${stats.pendingInspections} pending` : null, accentColor: undefined, isAlert: false },
          { label: 'Overdue',      href: '/dashboard/overdue',       count: stats.overdueCount,       accent: stats.overdueCount > 0 ? 'needs action' : 'all on track',
            accentColor: stats.overdueCount > 0 ? 'rgba(255,255,255,0.85)' : 'var(--ca-teal)', isAlert: stats.overdueCount > 0 },
        ].map((btn) => {
          const alertBg   = 'var(--ca-red, #9f403d)'
          const alertBorder = 'var(--ca-red, #9f403d)'
          const baseBg    = btn.isAlert ? alertBg   : 'var(--ca-card)'
          const baseBorder = btn.isAlert ? alertBorder : 'var(--ca-card-high)'
          const hoverBg   = btn.isAlert
            ? 'color-mix(in srgb, var(--ca-red, #9f403d) 80%, black)'
            : 'var(--ca-card-high)'
          const labelColor = btn.isAlert ? 'rgba(255,255,255,0.7)' : 'var(--ca-ink-muted)'
          const countColor = btn.isAlert ? '#ffffff' : 'inherit'
          const arrowColor = btn.isAlert ? 'rgba(255,255,255,0.6)' : 'var(--ca-ink-faint)'

          return (
          <Link
            key={btn.href}
            href={btn.href}
            className="flex flex-col gap-2 p-4 rounded-xl"
            style={{
              background: baseBg,
              border: `1px solid ${baseBorder}`,
              transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s ease, background 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px) scale(1.01)'
              e.currentTarget.style.boxShadow = btn.isAlert
                ? '0 8px 24px rgba(159,64,61,0.35)'
                : '0 8px 24px rgba(38,52,61,0.13)'
              e.currentTarget.style.background = hoverBg
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)'
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.background = baseBg
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px) scale(0.98)'
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px) scale(1.01)'
            }}
          >
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.15em]"
                style={{ color: labelColor }}>
                {btn.label}
              </p>
              <span style={{ color: arrowColor, fontSize: 11 }}>→</span>
            </div>
            <p className="text-3xl font-black leading-none" style={{ letterSpacing: '-0.03em', color: countColor }}>
              {btn.count}
            </p>
            {btn.accent && (
              <p className="text-[10px] font-semibold" style={{ color: btn.accentColor ?? 'var(--ca-amber)' }}>
                {btn.accent}
              </p>
            )}
          </Link>
          )
        })}
      </div>

      {/* ── Upcoming deadlines strip ── */}
      <UpcomingStrip items={upcoming} />

      {/* ── Map | Pothole resolution | Assignee workload ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ alignItems: 'stretch' }}>
        <MapWidget markers={projectMarkers} />
        <PotholeBacklogWidget data={potholeStats} />
        <WorkloadWidget workload={assigneeWorkload} />
      </div>

      {/* ── Department Overview ── */}
      <div style={card} className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--ca-card-high)' }}>
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.15em]">Department Overview</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ca-ink-muted)' }}>
              Overdue, blocked &amp; at-risk items across all work types
            </p>
          </div>
          <div className="flex gap-1.5">
            <Link href="/dashboard/projects" className="text-[10px] font-black px-2.5 py-1 rounded-lg transition-colors"
              style={{ background: 'var(--ca-section)', color: 'var(--ca-ink-muted)' }}>
              Projects
            </Link>
            <Link href="/dashboard/work-orders" className="text-[10px] font-black px-2.5 py-1 rounded-lg transition-colors"
              style={{ background: 'var(--ca-section)', color: 'var(--ca-ink-muted)' }}>
              Work Orders
            </Link>
          </div>
        </div>

        {priorityItems.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-semibold" style={{ color: 'var(--ca-teal)' }}>All clear</p>
            <p className="text-xs mt-1" style={{ color: 'var(--ca-ink-muted)' }}>No overdue or blocked items.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ '--tw-divide-color': 'var(--ca-card-high)' } as React.CSSProperties}>
            {priorityItems.map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                href={item.href}
                className="flex items-center gap-3 px-5 py-3 transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ca-section)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                <DelayDot delay={item.delay} blocked={item.blocked} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px]" style={{ color: 'var(--ca-ink-faint)' }}>{item.number}</span>
                    <span className="text-sm font-semibold truncate">{item.title}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-black flex-shrink-0"
                      style={{ background: TYPE_BG[item.type], color: TYPE_INK[item.type] }}>
                      {TYPE_LABEL[item.type]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {item.dueDate && (
                      <span className="text-[10px]" style={{ color: 'var(--ca-ink-faint)' }}>
                        Due {format(parseISO(item.dueDate), 'MMM d, yyyy')}
                      </span>
                    )}
                    {item.blocked && item.blockedBy && (
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--ca-amber)' }}>
                        🔒 {item.blockedBy}
                      </span>
                    )}
                  </div>
                </div>
                <StatusPill delay={item.delay} blocked={item.blocked} />
              </Link>
            ))}
          </div>
        )}

        <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--ca-card-high)' }}>
          <p className="text-[10px]" style={{ color: 'var(--ca-ink-faint)' }}>{priorityItems.length} items requiring attention</p>
          <Link href="/dashboard/projects" className="text-[10px] font-black hover:underline" style={{ color: 'var(--ca-primary)' }}>
            View all →
          </Link>
        </div>
      </div>

      {/* ── Active Project Timeline (Gantt) ── */}
      <GanttWidget projects={ganttProjects} />
    </div>
  )
}
