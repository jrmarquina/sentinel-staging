'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Building2, Wrench, ClipboardCheck, AlertTriangle,
  Loader2, Activity, ShieldAlert, ArrowRight,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { FmStatCard, FmCard, FmBadge, statusVariant, FmSectionLabel } from '@/components/fm'

// ── Types ──────────────────────────────────────────────────────────────────

interface DashboardData {
  properties:   { total: number; active: number }
  assets:       { total: number; byCondition: { good: number; fair: number; poor: number } }
  inspections:  { total: number; completed: number; pending: number; inProgress: number; averageScore: number }
  workOrders:   { total: number; open: number; inProgress: number; completed: number; highPriority: number }
  recentInspections: Array<{
    id: string; status: string; score: number | null; created_at: string
    fm_properties: { name: string } | null
  }>
  /** Optional — populated if API supports it */
  trendData?:  Array<{ name: string; completion: number; compliance: number }>
  riskData?:   Array<{ name: string; critical: number; warning: number }>
}

// ── Fallback chart data (used when API doesn't yet return trend/risk) ──────

const FALLBACK_TREND = [
  { name: 'Nov', completion: 72, compliance: 68 },
  { name: 'Dec', completion: 78, compliance: 74 },
  { name: 'Jan', completion: 75, compliance: 70 },
  { name: 'Feb', completion: 82, compliance: 79 },
  { name: 'Mar', completion: 88, compliance: 85 },
  { name: 'Apr', completion: 85, compliance: 83 },
]

const FALLBACK_RISK = [
  { name: 'Structural', critical: 3, warning: 5 },
  { name: 'Electrical', critical: 1, warning: 4 },
  { name: 'Plumbing',   critical: 2, warning: 3 },
  { name: 'HVAC',       critical: 0, warning: 6 },
  { name: 'Fire Safety',critical: 1, warning: 2 },
]

// ── Recharts custom tooltip ────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '0.6rem 0.9rem', fontSize: '0.75rem',
      boxShadow: 'var(--shadow)',
    }}>
      <p style={{ color: 'var(--muted)', marginBottom: '0.3rem', fontWeight: 700 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color, margin: 0 }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

// ── Inspection Trends Chart ────────────────────────────────────────────────

function InspectionTrendsChart({ data }: { data: typeof FALLBACK_TREND }) {
  return (
    <FmCard>
      <FmSectionLabel>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Activity size={13} style={{ color: 'var(--primary)' }} />
          Inspection Trends
        </span>
      </FmSectionLabel>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        {[
          { label: 'Completion %', color: 'var(--primary)' },
          { label: 'Compliance',   color: 'var(--violet)' },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', fontWeight: 700 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ color: 'var(--muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradCompletion" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--primary)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCompliance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--violet)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--violet)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="completion" name="Completion %" stroke="var(--primary)" strokeWidth={2} fill="url(#gradCompletion)" />
            <Area type="monotone" dataKey="compliance"  name="Compliance"   stroke="var(--violet)"  strokeWidth={2} fill="url(#gradCompliance)"  />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </FmCard>
  )
}

// ── Risk Assessment Chart ──────────────────────────────────────────────────

function RiskChart({ data }: { data: typeof FALLBACK_RISK }) {
  return (
    <FmCard>
      <FmSectionLabel>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldAlert size={13} style={{ color: 'var(--red)' }} />
          Risk Assessment
        </span>
      </FmSectionLabel>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        {[
          { label: 'Critical', color: 'var(--red)' },
          { label: 'Warning',  color: 'var(--amber)' },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', fontWeight: 700 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ color: 'var(--muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
            <YAxis type="category" dataKey="name" width={80} axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 9 }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--card-b)' }} />
            <Bar dataKey="critical" name="Critical" stackId="a" fill="var(--red)"   radius={[0, 0, 0, 0]} />
            <Bar dataKey="warning"  name="Warning"  stackId="a" fill="var(--amber)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </FmCard>
  )
}

// ── Activity Feed item ─────────────────────────────────────────────────────

function FeedItem({ inspection }: { inspection: DashboardData['recentInspections'][number] }) {
  const variant = statusVariant(inspection.status)
  return (
    <Link
      href={`/dashboard/fm/inspections/${inspection.id}`}
      style={{ textDecoration: 'none' }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.875rem',
          padding: '0.75rem', borderRadius: 10,
          transition: 'background 0.15s ease', cursor: 'pointer',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card-b)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        {/* Status dot */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: variant === 'success' ? 'var(--teal)'
            : variant === 'warning' ? 'var(--amber)'
            : variant === 'danger'  ? 'var(--red)'
            : 'var(--muted)',
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {inspection.fm_properties?.name ?? 'Unknown Property'}
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0 }}>
            {new Date(inspection.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {inspection.score != null && (
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)' }}>
              {inspection.score}%
            </span>
          )}
          <FmBadge variant={variant}>{inspection.status.replace(/_/g, ' ')}</FmBadge>
        </div>
      </div>
    </Link>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FMDashboardPage() {
  const [data, setData]       = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/fm/analytics/dashboard')
      .then((r) => {
        if (!r.ok) throw new Error(`Dashboard API error: ${r.status}`)
        return r.json() as Promise<DashboardData>
      })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6rem 0' }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
      </div>
    )
  }

  // ── Error state — non-crashing ────────────────────────────────────────────
  if (error || !data) {
    return (
      <div style={{ padding: '4rem 0', textAlign: 'center' }}>
        <AlertTriangle size={32} style={{ color: 'var(--amber)', margin: '0 auto 0.75rem' }} />
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{error ?? 'No data available'}</p>
        <button
          onClick={() => { setError(null); setLoading(true); fetch('/api/fm/analytics/dashboard').then(r => r.json()).then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error')).finally(() => setLoading(false)) }}
          className="fm-btn fm-btn-secondary"
          style={{ marginTop: '1rem' }}
        >
          Retry
        </button>
      </div>
    )
  }

  const { properties, assets, inspections, workOrders, recentInspections } = data
  const trendData = data.trendData ?? FALLBACK_TREND
  const riskData  = data.riskData  ?? FALLBACK_RISK

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.25rem 0' }}>

      {/* ── Page header ── */}
      <div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
          Facility Management
        </h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          Portfolio overview — properties, assets &amp; inspections
        </p>
      </div>

      {/* ── KPI tiles ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <FmStatCard
          icon={<Building2 size={20} />}
          label="Properties"
          value={properties.active}
          sub={`${properties.total} total registered`}
          href="/dashboard/fm/properties"
          accent="primary"
        />
        <FmStatCard
          icon={<Wrench size={20} />}
          label="Assets"
          value={assets.total}
          sub={`${assets.byCondition.good}G · ${assets.byCondition.fair}F · ${assets.byCondition.poor}P`}
          href="/dashboard/fm/assets"
          accent="teal"
        />
        <FmStatCard
          icon={<ClipboardCheck size={20} />}
          label="Avg Inspection Score"
          value={inspections.averageScore > 0 ? `${inspections.averageScore}%` : '—'}
          sub={`${inspections.completed} of ${inspections.total} completed`}
          href="/dashboard/fm/inspections"
          accent="primary"
          trend={inspections.averageScore >= 80 ? 'up' : inspections.averageScore >= 60 ? 'flat' : 'down'}
          trendLabel={inspections.averageScore >= 80 ? 'On track' : 'Needs attention'}
        />
        <FmStatCard
          icon={<AlertTriangle size={20} />}
          label="Open Work Orders"
          value={workOrders.open}
          sub={`${workOrders.highPriority} high priority`}
          href="/dashboard/fm/work-orders"
          accent={workOrders.highPriority > 0 ? 'red' : 'teal'}
          trend={workOrders.highPriority > 2 ? 'down' : 'flat'}
          trendLabel={workOrders.highPriority > 0 ? `${workOrders.highPriority} urgent` : 'All normal'}
        />
      </div>

      {/* ── Charts row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        <InspectionTrendsChart data={trendData} />
        <RiskChart data={riskData} />
      </div>

      {/* ── Recent Inspections activity feed ── */}
      <FmCard>
        <FmSectionLabel
          action={
            <Link
              href="/dashboard/fm/inspections"
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
            >
              View all <ArrowRight size={13} />
            </Link>
          }
        >
          Recent Inspections
        </FmSectionLabel>

        {recentInspections.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
            No inspections yet
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            {recentInspections.slice(0, 8).map((insp) => (
              <FeedItem key={insp.id} inspection={insp} />
            ))}
          </div>
        )}
      </FmCard>

    </div>
  )
}
