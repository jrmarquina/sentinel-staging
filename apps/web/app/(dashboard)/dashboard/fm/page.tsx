'use client'

import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2, Wrench, ClipboardCheck, AlertTriangle,
  Loader2, Activity, CheckCircle, Calendar,
  Maximize2, Minimize2, MapPin, ArrowRight, TrendingUp, BarChart2,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { FmCard, FmBadge, FmSectionLabel, statusVariant } from '@/components/fm'
import { useFmT, type FmKey } from '@/lib/locale'

const MapView = dynamic(
  () => import('@/components/map/MapView').then((m) => m.MapView),
  { ssr: false, loading: () => (
    <div style={{ height: '100%', background: 'var(--card-b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
    </div>
  )}
)

// ── Types ──────────────────────────────────────────────────────────────────

interface PropertyGeo { id: string; name: string; code: string; status: string; latitude: number; longitude: number; cover_image_url?: string | null }

interface PendingApproval {
  id: string; updated_at: string
  fm_properties:          { name: string } | null
  fm_inspection_templates: { name: string } | null
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

interface MonthlyPoint {
  month: string; total: number; completed: number; avgScore: number
}

interface PropertyRiskPoint {
  name: string; good: number; fair: number; poor: number
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
  monthlyTrend:        MonthlyPoint[]
  propertyRisk:        PropertyRiskPoint[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDayCount(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

// ── Fixed event palette — same vibrant colors across ALL design themes ────────
// Reference: glass theme (the best-looking one). These values are hardcoded
// so inspections, work orders and calendar heatmap look identical in classic
// light, classic dark, dev/CA and glass modes.
const EV = {
  blue:   { bg: '#3b82f6', text: '#fff',     border: '#3b82f6' }, // Inspection SCHEDULED
  sky:    { bg: '#60a5fa', text: '#fff',     border: '#60a5fa' }, // Inspection IN_PROGRESS
  amber:  { bg: '#f59e0b', text: '#3d1f00', border: '#f59e0b' }, // Inspection PENDING_APPROVAL / WO OPEN
  orange: { bg: '#f97316', text: '#fff',     border: '#f97316' }, // WO IN_PROGRESS
  teal:   { bg: '#10b981', text: '#fff',     border: '#10b981' }, // COMPLETED (any type)
  red:    { bg: '#f87171', text: '#fff',     border: '#f87171' }, // OVERDUE (any type)
  muted:  { bg: '#334155', text: '#94a3b8', border: '#475569' }, // DRAFT / unknown
} as const

/** Solid heatmap colors: 1=blue, 2=amber, 3+=red — fixed across all themes */
function eventCountColor(count: number): { bg: string; textColor: string } {
  if (count >= 3) return { bg: EV.red.bg,   textColor: EV.red.text }
  if (count === 2) return { bg: EV.amber.bg, textColor: EV.amber.text }
  if (count === 1) return { bg: EV.blue.bg,  textColor: EV.blue.text }
  return { bg: 'transparent', textColor: 'var(--fg)' }
}

/**
 * Per-event color — consistent across all design themes.
 * Overdue overrides all other statuses.
 */
function eventColor(ev: ScheduledEvent): { bg: string; text: string; border: string } {
  if (ev.isOverdue) return EV.red

  if (ev.type === 'inspection') {
    switch (ev.status) {
      case 'SCHEDULED':        return EV.blue
      case 'IN_PROGRESS':      return EV.sky
      case 'PENDING_APPROVAL': return EV.amber
      case 'COMPLETED':        return EV.teal
      case 'DRAFT':            return EV.muted
      default:                 return EV.blue
    }
  }

  // work_order
  switch (ev.status) {
    case 'OPEN':        return EV.amber
    case 'IN_PROGRESS': return EV.orange
    case 'COMPLETED':   return EV.teal
    default:            return EV.amber
  }
}

/** Inspection status badge — fixed colors, all themes */
function inspStatusStyle(status: string, t: (key: FmKey) => string): { bg: string; color: string; label: string } {
  switch (status) {
    case 'PENDING_APPROVAL': return { bg: `${EV.amber.bg}22`, color: EV.amber.bg, label: t('insp.fm.tab.pendingApproval') }
    case 'IN_PROGRESS':      return { bg: `${EV.blue.bg}22`,  color: EV.blue.bg,  label: t('insp.fm.tab.inProgress') }
    case 'SCHEDULED':        return { bg: '#6366f122',         color: '#6366f1',   label: t('insp.fm.tab.inProgress') }
    case 'COMPLETED':        return { bg: `${EV.teal.bg}22`,  color: EV.teal.bg,  label: t('insp.fm.tab.completed') }
    case 'DRAFT':            return { bg: '#33415522',         color: '#94a3b8',   label: t('insp.fm.tab.draft') }
    default:                 return { bg: '#33415522',         color: '#94a3b8',   label: status }
  }
}

// ── Recharts custom tooltip ────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '0.625rem 0.875rem',
      boxShadow: 'var(--shadow-lg)', fontSize: '0.75rem',
    }}>
      {label && <p style={{ fontWeight: 800, color: 'var(--muted)', marginBottom: '0.35rem', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>}
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--muted)' }}>{p.name}:</span>
          <span style={{ fontWeight: 800, color: 'var(--fg)' }}>{p.value}{p.name.toLowerCase().includes('score') ? '%' : ''}</span>
        </div>
      ))}
    </div>
  )
}

// ── InspectionChart (AreaChart — 6-month trend) ────────────────────────────

function InspectionChart({ data }: { data: MonthlyPoint[] }) {
  const t = useFmT()
  const hasData = data.some((d) => d.total > 0)

  const completedLabel  = t('insp.fm.tab.completed')
  const avgScoreLabel   = t('ana.insp.avgScore')

  return (
    <FmCard style={{ padding: '1.25rem', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.125rem' }}>
        <TrendingUp size={13} style={{ color: 'var(--primary)' }} />
        <FmSectionLabel>{t('ana.inspections')} — 6M</FmSectionLabel>
      </div>

      {!hasData ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '0.8rem', opacity: 0.5 }}>
          {t('noData')}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="completed" name={completedLabel}  stroke="var(--primary)" strokeWidth={2} fill="url(#completedGrad)" dot={{ r: 3, fill: 'var(--primary)', strokeWidth: 0 }} activeDot={{ r: 5 }} />
            <Area type="monotone" dataKey="avgScore"  name={avgScoreLabel}   stroke="#6366f1"        strokeWidth={2} fill="url(#scoreGrad)"     dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
        {[
          { color: 'var(--primary)', label: completedLabel },
          { color: '#6366f1',        label: avgScoreLabel },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.65rem', color: 'var(--muted)' }}>
            <div style={{ width: 10, height: 3, borderRadius: 2, background: color }} />
            {label}
          </div>
        ))}
      </div>
    </FmCard>
  )
}

// ── RiskAssessmentChart (BarChart vertical stacked, per property) ───────────

function RiskAssessmentChart({ data }: { data: PropertyRiskPoint[] }) {
  const t = useFmT()
  const hasData = data.length > 0

  const poorLabel = t('asset.condition.POOR')
  const fairLabel = t('asset.condition.FAIR')

  // Truncate long property names for the Y axis
  const chartData = data.map((d) => ({
    ...d,
    shortName: d.name.length > 14 ? d.name.slice(0, 13) + '…' : d.name,
  }))

  return (
    <FmCard style={{ padding: '1.25rem', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.125rem' }}>
        <BarChart2 size={13} style={{ color: 'var(--red)' }} />
        <FmSectionLabel>{t('ana.byProperty')}</FmSectionLabel>
      </div>

      {!hasData ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '0.8rem', opacity: 0.5 }}>
          {t('noData')}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(140, chartData.length * 32)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis dataKey="shortName" type="category" tick={{ fontSize: 10, fontWeight: 600, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={90} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="poor" name={poorLabel} stackId="a" fill="var(--red)"   radius={[0, 0, 0, 0]} maxBarSize={18} />
            <Bar dataKey="fair" name={fairLabel} stackId="a" fill="var(--amber)" radius={[3, 3, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
        {[
          { color: 'var(--red)',   label: poorLabel },
          { color: 'var(--amber)', label: fairLabel },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.65rem', color: 'var(--muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            {label}
          </div>
        ))}
      </div>
    </FmCard>
  )
}

// ── Regional Health Matrix ─────────────────────────────────────────────────

function RegionalHealthMatrix({ data }: { data: PropertyRiskPoint[] }) {
  const t = useFmT()

  if (data.length === 0) return null

  function healthScore(p: PropertyRiskPoint): number {
    const total = p.good + p.fair + p.poor
    if (total === 0) return 100
    return Math.round((p.good * 100 + p.fair * 60 + p.poor * 0) / total)
  }

  function scoreStyle(score: number): { color: string; bg: string } {
    if (score >= 80) return { color: 'var(--teal)',  bg: 'var(--teal-c)' }
    if (score >= 60) return { color: 'var(--amber)', bg: 'var(--amber-c)' }
    return              { color: 'var(--red)',   bg: 'var(--red-c)' }
  }

  const poorLabel  = t('asset.condition.POOR')
  const fairLabel  = t('asset.condition.FAIR')
  const goodLabel  = t('asset.condition.GOOD')

  // Show all properties that have assets (good, fair, or poor)
  const all = [...data]
  // Add properties with only good assets from the parent (we don't have them here — only risk data includes all)
  // Sort best to worst so users get orientation
  const sorted = all.map((p) => ({ ...p, score: healthScore(p) })).sort((a, b) => a.score - b.score)

  return (
    <FmCard style={{ padding: '1.25rem', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <FmSectionLabel>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 size={13} style={{ color: 'var(--primary)' }} />
            {t('prop.detail.integrity')}
          </span>
        </FmSectionLabel>
        {/* Legend */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {[
            { color: 'var(--teal)',  label: '≥80' },
            { color: 'var(--amber)', label: '≥60' },
            { color: 'var(--red)',   label: '<60' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.6rem', color: 'var(--muted)' }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
        {sorted.map((p) => {
          const { color, bg } = scoreStyle(p.score)
          return (
            <div key={p.name} style={{
              background: bg, borderRadius: 10, padding: '0.625rem 0.75rem',
              border: `1px solid ${color}40`,
              display: 'flex', flexDirection: 'column', gap: '0.2rem',
            }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                <span style={{ fontSize: '1.4rem', fontWeight: 900, color, lineHeight: 1 }}>{p.score}</span>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, color, opacity: 0.7 }}>/ 100</span>
              </div>
              <p style={{ fontSize: '0.6rem', color: 'var(--muted)', margin: 0 }}>
                {p.poor > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}>{p.poor} {poorLabel.toLowerCase()} · </span>}
                {p.fair > 0 && <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{p.fair} {fairLabel.toLowerCase()} · </span>}
                {p.good} {goodLabel.toLowerCase()}
              </p>
            </div>
          )
        })}
      </div>
    </FmCard>
  )
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

// ── Inspections Panel (right column) ──────────────────────────────────────

function InspectionsPanel({
  inspections, pendingApprovals, totals,
}: {
  inspections: RecentInspection[]
  pendingApprovals: PendingApproval[]
  totals: DashboardData['inspections']
}) {
  const t = useFmT()
  const router = useRouter()

  // Exclude pending approvals from the recent list (shown separately above)
  const recentNonPending = inspections.filter(i => i.status !== 'PENDING_APPROVAL')
  const ORDER: Record<string, number> = { IN_PROGRESS: 0, SCHEDULED: 1, DRAFT: 2, COMPLETED: 3 }
  const sortedRecent = [...recentNonPending].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9))

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
      minWidth: 0,
    }}>

      {/* ── Header: title + quick stats ── */}
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <ClipboardCheck size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <p style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0, flex: 1 }}>
            {t('insp.fm.title')}
          </p>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, background: 'var(--primary-c)', color: 'var(--primary)', padding: '0.1rem 0.5rem', borderRadius: 9999 }}>
            {totals.total}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {[
            { label: t('insp.fm.tab.pendingApproval'), value: totals.pending,    color: EV.amber.bg },
            { label: t('insp.fm.tab.inProgress'),      value: totals.inProgress, color: EV.blue.bg },
            { label: t('insp.fm.tab.completed'),        value: totals.completed,  color: EV.teal.bg },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--card-b)', borderRadius: 8, padding: '0.375rem 0.5rem', textAlign: 'center', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: '1rem', fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{value}</p>
              <p style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0.2rem 0 0' }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Inspections Ready to Approve ── */}
      {pendingApprovals.length > 0 && (
        <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {/* Section label */}
          <div style={{ padding: '0.6rem 1.25rem 0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <CheckCircle size={12} style={{ color: EV.amber.bg, flexShrink: 0 }} />
            <span style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', flex: 1 }}>
              {t('insp.fm.tab.pendingApproval')}
            </span>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, background: `${EV.amber.bg}22`, color: EV.amber.bg, padding: '0.1rem 0.45rem', borderRadius: 9999 }}>
              {pendingApprovals.length}
            </span>
          </div>
          {/* Approval rows */}
          {pendingApprovals.map((item) => (
            <div
              key={item.id}
              onClick={() => router.push(`/dashboard/fm/inspections/${item.id}`)}
              style={{ padding: '0.6rem 1.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.625rem', transition: 'background 0.12s ease', borderTop: '1px solid var(--border)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${EV.amber.bg}15` }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: EV.amber.bg, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(item.fm_inspection_templates as { name?: string } | null)?.name ?? t('insp.fm.title')}
                </p>
                <p style={{ fontSize: '0.68rem', color: 'var(--muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(item.fm_properties as { name?: string } | null)?.name ?? '—'}
                </p>
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--faint)', flexShrink: 0 }}>
                {new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Recent Inspections ── */}
      <div style={{ padding: '0.6rem 1.25rem 0.4rem', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Activity size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          {t('dash.recentInsp')}
        </span>
      </div>

      {/* Scrollable recent list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {sortedRecent.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', padding: '2rem 1rem' }}>{t('insp.fm.empty')}</p>
        ) : sortedRecent.map((insp) => {
          const { bg, color, label } = inspStatusStyle(insp.status, t)
          const dateStr = insp.scheduled_for
            ? new Date(insp.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : new Date(insp.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

          return (
            <div
              key={insp.id}
              onClick={() => router.push(`/dashboard/fm/inspections/${insp.id}`)}
              style={{ padding: '0.625rem 1.25rem', cursor: 'pointer', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', transition: 'background 0.12s ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card-b)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {insp.template_name ?? t('insp.fm.title')}
                </p>
                <p style={{ fontSize: '0.68rem', color: 'var(--muted)', margin: '0.1rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {insp.property_name}
                </p>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.58rem', fontWeight: 800, background: bg, color, padding: '0.1rem 0.4rem', borderRadius: 4 }}>{label}</span>
                {insp.score != null
                  ? <span style={{ fontSize: '0.7rem', fontWeight: 800, color: insp.score >= 80 ? EV.teal.bg : insp.score >= 60 ? EV.amber.bg : EV.red.bg }}>{Math.round(insp.score)}%</span>
                  : <span style={{ fontSize: '0.65rem', color: 'var(--faint)' }}>{dateStr}</span>
                }
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <Link href="/dashboard/fm/inspections" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
          {t('viewAll')} <ArrowRight size={13} />
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
  const t = useFmT()
  const router = useRouter()
  if (properties.length === 0) return null
  return (
    <FmCard style={{ padding: '1.25rem', overflow: 'hidden', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <FmSectionLabel>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 size={13} style={{ color: 'var(--primary)' }} />
            {t('dash.topProperties')}
          </span>
        </FmSectionLabel>
        <Link href="/dashboard/fm/properties" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', letterSpacing: '0.04em' }}>
          {t('viewAll')}
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
            {/* Image area — 160px with cover photo or gradient fallback */}
            <div style={{
              height: 160,
              background: prop.cover_image_url
                ? `url(${prop.cover_image_url}) center/cover no-repeat`
                : CARD_GRADIENTS[i % CARD_GRADIENTS.length],
              display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
            }}>
              {!prop.cover_image_url && <Building2 size={36} style={{ color: 'rgba(255,255,255,0.12)' }} />}
              {/* Bottom gradient overlay */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)' }} />
              {/* Property name overlay — bottom left */}
              <p style={{
                position: 'absolute', bottom: '0.5rem', left: '0.625rem', right: '0.625rem',
                margin: 0, color: '#fff', fontSize: '0.78rem', fontWeight: 700,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {prop.name}
              </p>
              {/* Code badge — bottom left (above name, actually place in a stack) */}
              <div style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', borderRadius: 6, padding: '0.15rem 0.45rem', fontSize: '0.6rem', fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.8)', display: 'none' }}>
                {prop.code}
              </div>
              {/* Status badge — top right */}
              <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}>
                <FmBadge variant={prop.status === 'ACTIVE' ? 'success' : prop.status === 'ARCHIVED' ? 'danger' : 'warning'}>
                  {prop.status}
                </FmBadge>
              </div>
            </div>
            {/* Card body — code + location only (name is now in the overlay) */}
            <div style={{ padding: '0.625rem', background: 'var(--card)' }}>
              <p style={{ fontWeight: 700, fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--primary)', margin: 0 }}>{prop.code}</p>
              <p style={{ fontSize: '0.68rem', color: 'var(--muted)', margin: '0.2rem 0 0', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <MapPin size={10} /> Puerto Rico
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
  const t = useFmT()
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
        {([
          { color: 'var(--primary)', count: '1' },
          { color: 'var(--amber)',   count: '2' },
          { color: 'var(--red)',     count: '3+' },
        ] as const).map(({ color, count }) => (
          <div key={count} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.58rem', color: 'var(--muted)' }}>
            <div style={{ width: 8, height: 8, borderRadius: 3, background: color, flexShrink: 0 }} />
            {count}
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
                    {isInspection ? 'INSP' : ev.isOverdue ? t('wo.fm.tab.overdue').toUpperCase() : 'OT'}
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
  const t = useFmT()
  const router  = useRouter()
  const days    = useMemo(() => Array.from({ length: 14 }, (_, i) => {
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
        {/* Header row */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
          <div style={{ width: 150, flexShrink: 0, fontSize: '0.6rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase' }}>{t('prop.title')} / {t('insp.fm.title')}</div>
          {days.map((d, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '0.58rem', fontWeight: 700, color: 'var(--muted)' }}>
              {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          ))}
        </div>

        {items.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', padding: '2rem 0', opacity: 0.5 }}>
            {t('insp.fm.empty')}
          </p>
        ) : items.map((item) => {
          const dayIdx = Math.floor((new Date(item.date).getTime() - todayMs) / 86_400_000)
          const { bg, text } = eventColor(item)
          const href = item.type === 'inspection'
            ? `/dashboard/fm/inspections/${item.id}`
            : `/dashboard/fm/work-orders?focus=${item.id}`

          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '0.45rem 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 150, flexShrink: 0, fontSize: '0.72rem', fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '0.5rem' }}>
                {item.propertyName || item.title}
              </div>
              <div style={{ flex: 14, display: 'flex', position: 'relative', height: 22 }}>
                {dayIdx >= 0 && dayIdx < 14 && (
                  <div
                    onClick={() => router.push(href)}
                    title={`${item.title} — ${item.status}`}
                    style={{
                      position: 'absolute',
                      left: `${(dayIdx / 14) * 100}%`,
                      width: 'calc(100% / 14 - 3px)', height: '100%',
                      background: bg, borderRadius: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.58rem', fontWeight: 900, color: text,
                      cursor: 'pointer',
                      transition: 'opacity 0.12s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75' }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                  >
                    {item.type === 'inspection' ? 'I' : 'W'}
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

type FsTab = 'property-gantt' | 'calendar-grid' | 'list-view' | 'heat-map'
const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** 2-Week Calendar Grid — day columns with event pills (populated by date, not hour) */
function FullScreenCalendarGrid({ events }: { events: ScheduledEvent[] }) {
  const t = useFmT()
  const router = useRouter()

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d
  }), [])

  const eventMap = useMemo(() => {
    const map: Record<string, ScheduledEvent[]> = {}
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    }
    return map
  }, [events])

  const todayStr = toYMD(new Date())

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { color: EV.blue.bg,   label: `${t('insp.fm.title')} · ${t('insp.fm.tab.inProgress')}` },
          { color: EV.sky.bg,    label: `${t('insp.fm.title')} · ${t('insp.fm.tab.inProgress')}` },
          { color: EV.amber.bg,  label: `${t('insp.fm.title')} · ${t('insp.fm.tab.pendingApproval')} / OT · ${t('wo.fm.tab.open')}` },
          { color: EV.orange.bg, label: `OT · ${t('wo.fm.tab.inProgress')}` },
          { color: EV.teal.bg,   label: t('insp.fm.tab.completed') },
          { color: EV.red.bg,    label: t('wo.fm.tab.overdue') },
        ].map(({ color, label }) => (
          <div key={color} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.7rem', color: 'var(--muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
            {label}
          </div>
        ))}
      </div>

      {/* Grid: 14 day columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: '0.5rem', minWidth: 980 }}>
        {/* Day headers */}
        {days.map((d) => {
          const dateStr = toYMD(d)
          const isToday = dateStr === todayStr
          return (
            <div key={dateStr} style={{
              textAlign: 'center', padding: '0.625rem 0.25rem',
              background: isToday ? `${EV.blue.bg}20` : 'var(--card-b)',
              borderRadius: 10,
              border: isToday ? `1px solid ${EV.blue.bg}50` : '1px solid var(--border)',
            }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 900, color: isToday ? EV.blue.bg : 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {d.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: isToday ? EV.blue.bg : 'var(--fg)', lineHeight: 1.2 }}>
                {d.getDate()}
              </div>
              <div style={{ fontSize: '0.58rem', color: 'var(--faint)', marginTop: 1 }}>
                {d.toLocaleDateString('en-US', { month: 'short' })}
              </div>
            </div>
          )
        })}

        {/* Event cells — one cell per day */}
        {days.map((d) => {
          const dateStr = toYMD(d)
          const dayEvs  = eventMap[dateStr] ?? []
          return (
            <div key={`events-${dateStr}`} style={{
              minHeight: 120, padding: '0.375rem 0.25rem',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              {dayEvs.length === 0 ? (
                <div style={{ flex: 1, borderRadius: 6, border: '1px dashed var(--border)', opacity: 0.4 }} />
              ) : dayEvs.map((ev) => {
                const { bg, text } = eventColor(ev)
                const href = ev.type === 'inspection'
                  ? `/dashboard/fm/inspections/${ev.id}`
                  : `/dashboard/fm/work-orders?focus=${ev.id}`
                return (
                  <div
                    key={ev.id}
                    onClick={() => router.push(href)}
                    title={`${ev.type === 'inspection' ? (ev.templateName ?? ev.title) : ev.title} · ${ev.propertyName} · ${ev.status}`}
                    style={{
                      padding: '3px 6px', borderRadius: 5,
                      background: bg, color: text,
                      fontSize: '0.58rem', fontWeight: 800,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      border: `1px solid ${bg}80`,
                      transition: 'opacity 0.12s, transform 0.12s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75'; e.currentTarget.style.transform = 'scale(1.03)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none' }}
                  >
                    <span style={{ opacity: 0.75, marginRight: 3 }}>{ev.type === 'inspection' ? '●' : '◆'}</span>
                    {ev.type === 'inspection' ? (ev.templateName ?? ev.title) : ev.title}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FullScreenHeatMap({ events }: { events: ScheduledEvent[] }) {
  const t = useFmT()
  const router = useRouter()
  const now    = new Date()
  const todayStr = toYMD(now)

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    return { month: d.getMonth(), year: d.getFullYear() }
  })

  // Map dateStr → full event array (not just count) so popup can render them
  const eventMap = useMemo(() => {
    const map: Record<string, ScheduledEvent[]> = {}
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    }
    return map
  }, [events])

  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const selectedEvents = selectedDay ? (eventMap[selectedDay] ?? []) : []
  const selectedLabel  = selectedDay
    ? new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div style={{ position: 'relative' }}>
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
                {DOW_LABELS.map((d, i) => (
                  <div key={i} style={{ textAlign: 'center', fontSize: '0.6rem', fontWeight: 900, color: 'var(--faint)', paddingBottom: 4 }}>{d}</div>
                ))}
                {Array.from({ length: firstDOW }).map((_, i) => <div key={`p-${i}`} />)}
                {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => {
                  const dateStr   = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const dayEvs    = eventMap[dateStr] ?? []
                  const count     = dayEvs.length
                  const { bg, textColor } = eventCountColor(count)
                  const isToday   = dateStr === todayStr
                  const isSelected = dateStr === selectedDay
                  return (
                    <div
                      key={day}
                      onClick={() => count > 0 && setSelectedDay(isSelected ? null : dateStr)}
                      title={count > 0 ? `${count} evento${count > 1 ? 's' : ''}` : undefined}
                      style={{
                        aspectRatio: '1', borderRadius: 8,
                        background: count === 0 ? 'var(--card-b)' : bg,
                        border: isSelected
                          ? '2px solid var(--fg)'
                          : isToday
                          ? '2px solid var(--primary)'
                          : '2px solid transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.8rem', fontWeight: count > 0 ? 800 : 400,
                        color: count > 0 ? textColor : isToday ? 'var(--primary)' : 'var(--faint)',
                        cursor: count > 0 ? 'pointer' : 'default',
                        transition: 'transform 0.1s',
                      }}
                      onMouseEnter={(e) => { if (count > 0) e.currentTarget.style.transform = 'scale(1.15)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                    >
                      {day}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Floating popup — fixed bottom-center so it never covers days */}
      {selectedDay && selectedEvents.length > 0 && (
        <div style={{
          position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
          zIndex: 10001,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
          width: 420,
          maxWidth: 'calc(100vw - 2rem)',
          overflow: 'hidden',
        }}>
          {/* Popup header */}
          <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--fg)', margin: 0 }}>{selectedLabel}</p>
              <p style={{ fontSize: '0.68rem', color: 'var(--muted)', margin: '0.15rem 0 0' }}>{selectedEvents.length} {t('dash.schedule').toLowerCase()}</p>
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              style={{ background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 700, flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
            >
              ✕
            </button>
          </div>
          {/* Event list */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {selectedEvents.map((ev) => {
              const { bg, text, border } = eventColor(ev)
              const href = ev.type === 'inspection'
                ? `/dashboard/fm/inspections/${ev.id}`
                : `/dashboard/fm/work-orders?focus=${ev.id}`
              return (
                <div
                  key={ev.id}
                  onClick={() => router.push(href)}
                  style={{ padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.12s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card-b)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ width: 4, height: 36, borderRadius: 4, background: bg, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.type === 'inspection' ? (ev.templateName ?? ev.title) : ev.title}
                    </p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0.1rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.propertyName}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.58rem', fontWeight: 900, background: bg, color: text, border: `1px solid ${border}`, padding: '2px 7px', borderRadius: 4 }}>
                      {ev.type === 'inspection' ? 'INSP' : 'OT'}
                    </span>
                    {ev.isOverdue && (
                      <span style={{ fontSize: '0.55rem', fontWeight: 900, background: 'var(--red-c)', color: 'var(--red)', padding: '1px 5px', borderRadius: 4 }}>{t('wo.fm.tab.overdue').toUpperCase()}</span>
                    )}
                    <span style={{ fontSize: '0.6rem', color: 'var(--faint)' }}>{ev.status.replace('_', ' ')}</span>
                  </div>
                  <ArrowRight size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function FullScreenListView({ events }: { events: ScheduledEvent[] }) {
  const t = useFmT()
  const router = useRouter()

  // Build a 14-day list from today
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return d
  }), [])

  // Group events by date string
  const eventMap = useMemo(() => {
    const map: Record<string, ScheduledEvent[]> = {}
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    }
    return map
  }, [events])

  const todayStr = toYMD(new Date())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        {[
          { color: 'var(--primary)', label: `${t('insp.fm.title')} · ${t('insp.fm.tab.inProgress')}` },
          { color: '#60a5fa',        label: `${t('insp.fm.title')} · ${t('insp.fm.tab.inProgress')}` },
          { color: 'var(--amber)',   label: `${t('wo.fm.tab.open')} / ${t('insp.fm.tab.pendingApproval')}` },
          { color: '#f97316',        label: `OT · ${t('wo.fm.tab.inProgress')}` },
          { color: 'var(--teal)',    label: t('insp.fm.tab.completed') },
          { color: 'var(--red)',     label: t('wo.fm.tab.overdue') },
        ].map(({ color, label }) => (
          <div key={color} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.7rem', color: 'var(--muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
            {label}
          </div>
        ))}
      </div>

      {/* Day rows */}
      {days.map((d) => {
        const dateStr = toYMD(d)
        const dayEvs  = eventMap[dateStr] ?? []
        const isToday = dateStr === todayStr
        const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })
        const dateNum = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

        return (
          <div key={dateStr} style={{
            display: 'flex', gap: '1.25rem', alignItems: 'flex-start',
            padding: '0.75rem 1rem',
            background: isToday ? 'var(--primary-c)' : dayEvs.length > 0 ? 'var(--card-b)' : 'transparent',
            borderRadius: 12,
            border: isToday ? '1px solid var(--primary)30' : '1px solid transparent',
          }}>
            {/* Date label */}
            <div style={{ width: 64, flexShrink: 0, textAlign: 'center' }}>
              <p style={{ fontSize: '0.6rem', fontWeight: 900, color: isToday ? 'var(--primary)' : 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>{weekday}</p>
              <p style={{ fontSize: '1rem', fontWeight: 900, color: isToday ? 'var(--primary)' : 'var(--fg)', margin: '0.1rem 0 0' }}>{d.getDate()}</p>
              <p style={{ fontSize: '0.58rem', color: 'var(--faint)', margin: '0.1rem 0 0' }}>{dateNum.split(' ')[0]}</p>
            </div>

            {/* Events */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {dayEvs.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--faint)', margin: '0.375rem 0 0', fontStyle: 'italic' }}>{t('noData')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {dayEvs.map((ev) => {
                    const { bg, text, border } = eventColor(ev)
                    const href = ev.type === 'inspection'
                      ? `/dashboard/fm/inspections/${ev.id}`
                      : `/dashboard/fm/work-orders?focus=${ev.id}`
                    return (
                      <div
                        key={ev.id}
                        onClick={() => router.push(href)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          padding: '0.625rem 0.875rem',
                          background: 'var(--card)', border: `1px solid ${border}30`,
                          borderLeft: `3px solid ${bg}`,
                          borderRadius: 8, cursor: 'pointer', transition: 'opacity 0.12s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75' }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.type === 'inspection' ? (ev.templateName ?? ev.title) : ev.title}
                          </p>
                          <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0.1rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.propertyName}
                          </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          {ev.isOverdue && (
                            <span style={{ fontSize: '0.58rem', fontWeight: 900, background: 'var(--red-c)', color: 'var(--red)', padding: '2px 6px', borderRadius: 4 }}>{t('wo.fm.tab.overdue')}</span>
                          )}
                          <span style={{ fontSize: '0.6rem', fontWeight: 800, background: bg, color: text, padding: '2px 7px', borderRadius: 4 }}>
                            {ev.type === 'inspection' ? 'INSP' : 'OT'}
                          </span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--faint)' }}>{ev.status.replace(/_/g, ' ')}</span>
                          <ArrowRight size={13} style={{ color: 'var(--muted)' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FullScreenPropertyGantt({ events, properties }: { events: ScheduledEvent[]; properties: PropertyGeo[] }) {
  const t = useFmT()
  const router = useRouter()
  const days   = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d
  }), [])

  return (
    <div style={{ minWidth: 1000 }}>
      {/* Column headers */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingBottom: '0.875rem', marginBottom: '0.5rem' }}>
        <div style={{ width: 250, fontSize: '0.7rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase' }}>{t('prop.title')}</div>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted)' }}>
            {d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.875rem', marginBottom: '1rem' }}>
        {[
          { color: 'var(--primary)', label: `${t('insp.fm.title')} · ${t('insp.fm.tab.inProgress')}` },
          { color: '#60a5fa',        label: `${t('insp.fm.title')} · ${t('insp.fm.tab.inProgress')}` },
          { color: 'var(--amber)',   label: `${t('insp.fm.title')} · ${t('insp.fm.tab.pendingApproval')} / OT · ${t('wo.fm.tab.open')}` },
          { color: '#f97316',        label: `OT · ${t('wo.fm.tab.inProgress')}` },
          { color: 'var(--teal)',    label: t('insp.fm.tab.completed') },
          { color: 'var(--red)',     label: t('wo.fm.tab.overdue') },
        ].map(({ color, label }) => (
          <div key={color} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.65rem', color: 'var(--muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
            {label}
          </div>
        ))}
      </div>

      {/* Property rows */}
      {properties.map((p) => {
        const propEvents = events.filter((ev) => ev.propertyId === p.id)
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '0.875rem 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 250, fontWeight: 800, fontSize: '0.9rem', color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '1rem' }}>
              {p.name}
            </div>
            <div style={{ flex: 14, display: 'flex', position: 'relative', height: 32 }}>
              {days.map((d, dayIdx) => {
                const dayEvs = propEvents.filter((ev) => new Date(ev.date).toDateString() === d.toDateString())
                if (dayEvs.length === 0) return <div key={dayIdx} style={{ flex: 1 }} />
                return (
                  <div key={dayIdx} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '0 2px' }}>
                    {dayEvs.map((ev, ei) => {
                      const { bg, text } = eventColor(ev)
                      const href = ev.type === 'inspection'
                        ? `/dashboard/fm/inspections/${ev.id}`
                        : `/dashboard/fm/work-orders?focus=${ev.id}`
                      return (
                        <div
                          key={ei}
                          onClick={() => router.push(href)}
                          title={`${ev.templateName ?? ev.title} — ${ev.status}`}
                          style={{
                            flex: 1, height: 28, borderRadius: 5,
                            background: bg,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.6rem', fontWeight: 900, color: text,
                            transition: 'opacity 0.12s, transform 0.12s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75'; e.currentTarget.style.transform = 'scaleY(1.15)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none' }}
                        >
                          {ev.type === 'inspection' ? 'I' : 'W'}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {properties.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem', padding: '3rem' }}>
          {t('prop.empty')}
        </p>
      )}
    </div>
  )
}

function FullScreenTimeline({ events, properties, onClose }: { events: ScheduledEvent[]; properties: PropertyGeo[]; onClose: () => void }) {
  const t = useFmT()
  const [tab, setTab] = useState<FsTab>('property-gantt')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const TABS: { id: FsTab; label: string }[] = [
    { id: 'property-gantt', label: `Gantt · ${t('prop.title')}` },
    { id: 'calendar-grid',  label: t('dash.twoWeeks') },
    { id: 'list-view',      label: t('dash.schedule') },
    { id: 'heat-map',       label: `${t('dash.schedule')} 6M` },
  ]

  if (!mounted) return null

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'var(--bg)', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg)', margin: 0 }}>
            {t('dash.schedule')}
          </h2>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {TABS.map((tab_item) => (
              <button key={tab_item.id} onClick={() => setTab(tab_item.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: tab === tab_item.id ? EV.blue.bg : 'var(--muted)',
                borderBottom: tab === tab_item.id ? `2px solid ${EV.blue.bg}` : '2px solid transparent',
                padding: '0.5rem 0.875rem', transition: 'color 0.15s ease',
              }}>
                {tab_item.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.375rem 0.625rem', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
        >
          <Minimize2 size={15} /> {t('dash.exitFullscreen')}
        </button>
      </header>
      <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '2rem' }}>
        {tab === 'property-gantt' && <FullScreenPropertyGantt events={events} properties={properties} />}
        {tab === 'calendar-grid'  && <FullScreenCalendarGrid events={events} />}
        {tab === 'list-view'      && <FullScreenListView events={events} />}
        {tab === 'heat-map'       && <FullScreenHeatMap events={events} />}
      </main>
    </div>,
    document.body
  )
}

// ── Compact Projects View (used inside MaintenanceTimeline) ───────────────

interface CompactProject {
  id: string
  name: string
  status: string
  planned_end_date?: string | null
}

function ProjectsCompactView() {
  const router = useRouter()
  const t = useFmT()
  const [projects, setProjects] = useState<CompactProject[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetch('/api/projects?module=fm')
      .then((r) => r.ok ? r.json() as Promise<{ projects: CompactProject[] }> : Promise.reject())
      .then((data) => setProjects(
        (data.projects ?? []).filter((p) => p.status !== 'completed' && p.status !== 'cancelled')
      ))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: 'var(--muted)' }}>
      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  )

  if (projects.length === 0) return (
    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
      <p style={{ color: 'var(--muted)', fontSize: '0.8rem', opacity: 0.5 }}>No active projects</p>
      <Link href="/dashboard/projects/new" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', marginTop: '0.5rem', display: 'inline-block' }}>
        Create a project →
      </Link>
    </div>
  )

  const today = new Date()

  const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    planning: { bg: '#ede9fe', color: '#7c3aed' },
    active:   { bg: '#dcfce7', color: '#16a34a' },
    on_hold:  { bg: '#fef9c3', color: '#854d0e' },
    draft:    { bg: 'var(--card-b)', color: 'var(--muted)' },
  }

  return (
    <div>
      {projects.map((proj) => {
        const end = proj.planned_end_date ? new Date(proj.planned_end_date) : null
        const isOverdue = end && end < today
        const badge = STATUS_BADGE[proj.status] ?? STATUS_BADGE.draft

        return (
          <div
            key={proj.id}
            onClick={() => router.push(`/dashboard/projects/${proj.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card-b)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {proj.name}
              </p>
              {proj.planned_end_date && (
                <p style={{ fontSize: '0.62rem', color: isOverdue ? 'var(--red)' : 'var(--muted)', margin: '0.15rem 0 0', fontWeight: isOverdue ? 700 : 400 }}>
                  {isOverdue ? 'Overdue · ' : 'Due '}
                  {new Date(proj.planned_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
            <span style={{ fontSize: '0.58rem', fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: badge.bg, color: badge.color, flexShrink: 0, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
              {proj.status.replace('_', ' ')}
            </span>
          </div>
        )
      })}
      <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
        <Link href="/dashboard/projects" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>
          {t('viewAll')} →
        </Link>
      </div>
    </div>
  )
}

// ── Maintenance Timeline widget ────────────────────────────────────────────

function MaintenanceTimeline({ events, properties }: { events: ScheduledEvent[]; properties: PropertyGeo[] }) {
  const t = useFmT()
  const router = useRouter()
  const [viewMode, setViewMode] = useState<'projects' | 'calendar'>('calendar')
  const [isFullScreen, setIsFullScreen] = useState(false)

  return (
    <FmCard style={{ overflow: 'hidden', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <FmSectionLabel>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={13} style={{ color: 'var(--primary)' }} />
              {t('dash.schedule')}
            </span>
          </FmSectionLabel>
          <div style={{ display: 'flex', background: 'var(--card-b)', borderRadius: 8, padding: 2, border: '1px solid var(--border)' }}>
            {(['calendar', 'projects'] as const).map((mode) => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: '4px 11px', border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: '0.63rem', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                background: viewMode === mode ? 'var(--primary)' : 'transparent',
                color: viewMode === mode ? '#fff' : 'var(--muted)',
                transition: 'all 0.15s ease',
              }}>
                {mode === 'calendar' ? t('dash.twoWeeks') : 'Projects'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setIsFullScreen(true)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, display: 'flex', transition: 'color 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
          title={t('dash.fullscreen')}
        >
          <Maximize2 size={18} />
        </button>
      </div>

      {viewMode === 'projects'
        ? <ProjectsCompactView />
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
  const t = useFmT()
  const [data, setData]         = useState<DashboardData | null>(null)
  const [kpi, setKpi]           = useState<Partial<DashboardData> | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  function load() {
    setLoading(true); setError(null)
    // Fire both fetches simultaneously.
    // KPI response (~100ms) shows the 5 stat cards immediately.
    // Full response (~400ms) fills in charts, map, and calendar.
    const kpiFetch  = fetch('/api/fm/analytics/dashboard?view=kpi')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: Partial<DashboardData>) => setKpi(d))
      .catch(() => {/* kpi failure is non-fatal; full data will fill in */})

    const fullFetch = fetch('/api/fm/analytics/dashboard')
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<DashboardData> })
      .then(d => { setData(d); setKpi(null) })      // full data supersedes kpi
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))

    void kpiFetch; void fullFetch
  }

  useEffect(() => { load() }, [])

  const mapMarkers = useMemo(() => (data?.propertiesGeo ?? []).map((p) => ({
    id: p.id, lat: p.latitude, lng: p.longitude,
    color: p.status === 'ACTIVE' ? '#34d399' : p.status === 'ARCHIVED' ? '#fb7185' : '#fbbf24',
    label: p.name,
  })), [data])

  // Full-page spinner only when we have neither KPI nor full data yet
  if (loading && !kpi && !data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6rem 0' }}>
      <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
    </div>
  )

  if (error && !data) return (
    <div style={{ padding: '4rem 0', textAlign: 'center' }}>
      <AlertTriangle size={32} style={{ color: 'var(--amber)', margin: '0 auto 0.75rem' }} />
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{error ?? t('error.generic')}</p>
      <button onClick={load} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>{t('retry')}</button>
    </div>
  )

  // Merge: use full data when available, fall back to KPI for stat cards
  const display = data ?? ({} as DashboardData)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', padding: '0.25rem 0' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '0.25rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>{t('prop.detail.tab.overview')}</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
          {t('dash.subtitle')}
        </p>
      </div>

      {/* ── Row 1: 5 equal stat cards — rendered as soon as KPI fetch returns ── */}
      {(() => {
        const k = data ?? kpi ?? {}
        const props    = k.properties       ?? { total: 0, active: 0 }
        const wo       = k.workOrders       ?? { open: 0, inProgress: 0 }
        const upcoming = k.upcomingInspections ?? 0
        const overdue  = k.overdueWorkOrders   ?? 0
        const cr       = k.complianceRate      ?? 0
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.875rem' }}>
            <StatCard icon={<Building2 size={18} />}       label={t('dash.totalSites')}      value={props.total}    sub={`${props.active} ${t('prop.status.ACTIVE').toLowerCase()}`}   accent="primary" href="/dashboard/fm/properties" />
            <StatCard icon={<ClipboardCheck size={18} />}  label={t('dash.upcomingInsp')}    value={upcoming}       sub={t('insp.fm.tab.inProgress')}                                    accent="violet"  active={upcoming > 0} href="/dashboard/fm/inspections" />
            <StatCard icon={<Wrench size={18} />}          label={t('dash.openWO')}          value={wo.open}        sub={`${wo.inProgress} ${t('wo.fm.tab.inProgress').toLowerCase()}`} accent="amber"   href="/dashboard/fm/work-orders" />
            <StatCard icon={<AlertTriangle size={18} />}   label={t('dash.overdueWO')}       value={overdue}                                                                             accent="red"     active={overdue > 0} href="/dashboard/fm/work-orders?filter=OVERDUE" />
            <StatCard icon={<Activity size={18} />}        label={t('dash.complianceRate')}  value={cr > 0 ? `${cr}%` : '—'} sub={t('ana.insp.avgScore')} accent="teal" trend={cr >= 80 ? '↑' : cr > 0 ? '↓' : undefined} href="/dashboard/fm/inspections" />
          </div>
        )
      })()}

      {/* ── Charts row — shown when full data arrives, skeleton while loading ── */}
      {data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '0.875rem' }}>
            <InspectionChart data={data.monthlyTrend} />
            <RiskAssessmentChart data={data.propertyRisk} />
          </div>
          {data.propertyRisk.length > 0 && <RegionalHealthMatrix data={data.propertyRisk} />}
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '0.875rem' }}>
          {[260, 200].map((h, i) => (
            <div key={i} style={{ height: h, borderRadius: 16, background: 'var(--skeleton, #f1f5f9)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {/* ── Rows 2-4: shown only after full data loads ── */}
      {!data ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--muted)', fontSize: '0.8rem', padding: '0.5rem 0' }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
          Loading map, calendar and inspections…
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '0.875rem', alignItems: 'stretch' }}>

        {/* Left column: Map → Top Properties → Calendar (fixed gaps)
            minWidth:0 + overflow:hidden prevent children from inflating
            the column past its 3fr allocation (fixes horizontal scroll). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', minWidth: 0, overflow: 'hidden' }}>

          {/* Map — explicit height so MapLibre canvas renders */}
          <div style={{ height: 360, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative', flexShrink: 0, boxShadow: 'var(--shadow)' }}>
            <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', zIndex: 10, background: 'var(--card)', backdropFilter: 'blur(12px)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.45rem 0.75rem' }}>
              <p style={{ fontSize: '0.53rem', fontWeight: 900, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 0.25rem' }}>{t('prop.detail.tile.risk')}</p>
              {[{ color: '#34d399', label: t('prop.status.ACTIVE') }, { color: '#fbbf24', label: t('prop.status.INACTIVE') }, { color: '#fb7185', label: t('prop.status.MAINTENANCE') }].map(({ color, label }) => (
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

        {/* Right column: minWidth:0 prevents the panel from
            overflowing its 2fr allocation. */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <InspectionsPanel
            inspections={data.recentInspections}
            pendingApprovals={data.pendingApprovals}
            totals={data.inspections}
          />
        </div>

      </div>
      )} {/* end !data conditional */}
    </div>
  )
}
