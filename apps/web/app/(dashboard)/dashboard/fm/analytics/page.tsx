'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Loader2,
  Building2,
  ClipboardCheck,
  Wrench,
  TrendingUp,
  Pencil,
  Check,
  X,
  ExternalLink,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { FmCard, FmBadge, FmSectionLabel } from '@/components/fm'

// ── Types ──────────────────────────────────────────────────────────────────

interface PropertyScore {
  property_id: string
  property_name: string
  score: number | null
  completed_at: string | null
  inspection_id: string
}

interface Deficiency {
  id: string
  key: string | null
  label: string | null
  result: string | null
  severity: string | null
  rating: number | null
  notes: string | null
  cost_estimate: number | null
  inspection_id: string
  property_id: string | null
  property_name: string
  work_order_id: string | null
  wo_status: string | null
  wo_title: string | null
}

interface WoTrendPoint {
  month: string
  open: number
  completed: number
}

interface WoByPriority {
  HIGH: number
  MEDIUM: number
  LOW: number
  NONE: number
}

interface Kpis {
  totalProperties: number
  avgPortfolioScore: number
  openDeficiencies: number
  lifeSafetyCount: number
  openWos: number
  overdueWos: number
}

interface PortfolioData {
  kpis: Kpis
  propertiesWithScores: PropertyScore[]
  lifeSafetyDeficiencies: Deficiency[]
  woTrend: WoTrendPoint[]
  woByPriority: WoByPriority
  session: { capability: string | null; role: string }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null) return 'var(--muted)'
  if (score >= 80) return '#10b981'
  if (score >= 50) return '#f59e0b'
  return '#ef4444'
}

function conditionLabel(score: number | null): string {
  if (score === null) return 'N/A'
  if (score >= 80) return 'GOOD'
  if (score >= 50) return 'FAIR'
  return 'POOR'
}

function conditionVariant(score: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (score === null) return 'neutral'
  if (score >= 80) return 'success'
  if (score >= 50) return 'warning'
  return 'danger'
}

function deficiencyType(key: string | null): { label: string; color: string } {
  if (!key) return { label: 'HIGH PRIORITY', color: '#f97316' }
  if (/^ls_\d+c$/.test(key)) return { label: 'LIFE SAFETY', color: '#dc2626' }
  if (/^ad_\d+c$/.test(key)) return { label: 'ADA', color: '#d97706' }
  return { label: 'HIGH PRIORITY', color: '#f97316' }
}

function isAdmin(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager'].includes(cap)
  return ['admin', 'supervisor'].includes(role)
}

function fmtCurrency(val: number | null): string {
  if (val === null || val === undefined) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Sort deficiencies: LS first, then ADA, then HIGH
function sortDeficiencies(items: Deficiency[]): Deficiency[] {
  const rank = (d: Deficiency) => {
    const k = d.key ?? ''
    if (/^ls_\d+c$/.test(k)) return 0
    if (/^ad_\d+c$/.test(k)) return 1
    return 2
  }
  return [...items].sort((a, b) => rank(a) - rank(b))
}

// ── Cost Estimate inline editor ───────────────────────────────────────────

function CostEstimateCell({
  deficiency,
  canEdit,
  onSaved,
}: {
  deficiency: Deficiency
  canEdit: boolean
  onSaved: (id: string, newValue: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(
    deficiency.cost_estimate !== null && deficiency.cost_estimate !== undefined
      ? String(deficiency.cost_estimate)
      : ''
  )
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const parsed = value.trim() === '' ? null : parseFloat(value)
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) {
      setSaving(false)
      return
    }
    try {
      const res = await fetch(`/api/fm/deficiencies/${deficiency.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cost_estimate: parsed }),
      })
      if (res.ok) {
        onSaved(deficiency.id, parsed)
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setValue(
      deficiency.cost_estimate !== null && deficiency.cost_estimate !== undefined
        ? String(deficiency.cost_estimate)
        : ''
    )
    setEditing(false)
  }

  if (!canEdit) {
    return (
      <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
        {fmtCurrency(deficiency.cost_estimate)}
      </span>
    )
  }

  if (editing) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          min={0}
          step={100}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="0"
          autoFocus
          style={{
            width: 90,
            fontSize: 12,
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'var(--card-b)',
            color: 'var(--fg)',
          }}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', padding: 0 }}
          title="Save"
        >
          {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
        </button>
        <button
          onClick={handleCancel}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}
          title="Cancel"
        >
          <X size={13} />
        </button>
      </span>
    )
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
      <span style={{ color: deficiency.cost_estimate !== null ? 'var(--fg)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
        {fmtCurrency(deficiency.cost_estimate)}
      </span>
      <button
        onClick={() => setEditing(true)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, lineHeight: 1 }}
        title="Edit cost estimate"
      >
        <Pencil size={11} />
      </button>
    </span>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FmAnalyticsPage() {
  const router = useRouter()
  const [data, setData] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/fm/analytics/portfolio')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError((body as { error?: string }).error ?? 'Failed to load analytics')
        return
      }
      setData(await res.json() as PortfolioData)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Update cost_estimate locally after save so UI reflects new value immediately
  const handleCostSaved = useCallback((id: string, newValue: number | null) => {
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        lifeSafetyDeficiencies: prev.lifeSafetyDeficiencies.map(d =>
          d.id === id ? { ...d, cost_estimate: newValue } : d
        ),
      }
    })
  }, [])

  const handleCreateWo = useCallback(async (deficiency: Deficiency) => {
    try {
      const res = await fetch(`/api/fm/deficiencies/${deficiency.id}/work-order`, { method: 'POST' })
      if (!res.ok) return
      const body = await res.json() as { work_order_id: string; created: boolean }
      router.push(`/dashboard/fm/work-orders/${body.work_order_id}`)
    } catch {
      // silent — user can retry
    }
  }, [router])

  // ── Loading / Error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ padding: 32, color: 'var(--red)' }}>
        <AlertTriangle size={20} style={{ display: 'inline', marginRight: 8 }} />
        {error ?? 'No data'}
      </div>
    )
  }

  const { kpis, propertiesWithScores, lifeSafetyDeficiencies, woTrend, woByPriority, session: sess } = data
  const adminUser = isAdmin(sess.capability, sess.role)
  const sortedDeficiencies = sortDeficiencies(lifeSafetyDeficiencies)

  // WO priority chart data
  const priorityChartData = [
    { priority: 'HIGH',   count: woByPriority.HIGH,   fill: '#ef4444' },
    { priority: 'MEDIUM', count: woByPriority.MEDIUM, fill: '#f59e0b' },
    { priority: 'LOW',    count: woByPriority.LOW,    fill: '#10b981' },
  ].filter(p => p.count > 0)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400 }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <TrendingUp size={22} style={{ color: 'var(--primary)' }} />
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--fg)' }}>
          Portfolio Analytics
        </h1>
      </div>

      {/* ── Alert banner ────────────────────────────────────────────────── */}
      {kpis.lifeSafetyCount > 0 && (
        <div style={{
          background: '#dc26261a',
          border: '1px solid #dc2626',
          borderRadius: 8,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: '#dc2626',
          marginBottom: 24,
          fontSize: 14,
          fontWeight: 600,
        }}>
          <AlertTriangle size={18} />
          {kpis.lifeSafetyCount} Life Safety &amp; ADA {kpis.lifeSafetyCount === 1 ? 'Deficiency Requires' : 'Deficiencies Require'} Immediate Attention
        </div>
      )}

      {/* ── KPI Grid ────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 16,
        marginBottom: 28,
      }}>
        {/* Properties Inspected */}
        <FmCard>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Building2 size={16} style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Properties Inspected
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--fg)' }}>
              {propertiesWithScores.length}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              of {kpis.totalProperties} total
            </div>
          </div>
        </FmCard>

        {/* Avg Portfolio Condition */}
        <FmCard>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <ClipboardCheck size={16} style={{ color: scoreColor(kpis.avgPortfolioScore) }} />
              <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Avg Portfolio Condition
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: scoreColor(kpis.avgPortfolioScore) }}>
              {kpis.avgPortfolioScore > 0 ? `${kpis.avgPortfolioScore}%` : '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {conditionLabel(kpis.avgPortfolioScore)}
            </div>
          </div>
        </FmCard>

        {/* Open Deficiencies */}
        <FmCard>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={16} style={{ color: 'var(--amber)' }} />
              <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Open Deficiencies
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--fg)' }}>
              {kpis.openDeficiencies}
            </div>
          </div>
        </FmCard>

        {/* Life Safety Issues */}
        <FmCard highlight={kpis.lifeSafetyCount > 0 ? 'danger' : undefined}>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={16} style={{ color: kpis.lifeSafetyCount > 0 ? '#dc2626' : 'var(--muted)' }} />
              <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                ⚠ Life Safety Issues
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: kpis.lifeSafetyCount > 0 ? '#dc2626' : 'var(--fg)' }}>
              {kpis.lifeSafetyCount}
            </div>
          </div>
        </FmCard>

        {/* Open Work Orders */}
        <FmCard>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Wrench size={16} style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Open Work Orders
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--fg)' }}>
              {kpis.openWos}
            </div>
          </div>
        </FmCard>

        {/* Overdue Work Orders */}
        <FmCard highlight={kpis.overdueWos > 0 ? 'warning' : undefined}>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={16} style={{ color: kpis.overdueWos > 0 ? '#f59e0b' : 'var(--muted)' }} />
              <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Overdue Work Orders
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: kpis.overdueWos > 0 ? '#f59e0b' : 'var(--fg)' }}>
              {kpis.overdueWos}
            </div>
          </div>
        </FmCard>
      </div>

      {/* ── Two-column section ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Left: Property Condition Table */}
        <div style={{ flex: '3 1 400px', minWidth: 0 }}>
          <FmCard>
            <div style={{ padding: '16px 18px' }}>
              <FmSectionLabel>Property Condition</FmSectionLabel>
              {propertiesWithScores.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13, padding: '16px 0' }}>
                  No completed inspections yet.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Property', 'Score', 'Condition', 'Last Inspection'].map(h => (
                        <th key={h} style={{
                          textAlign: 'left',
                          fontSize: 11,
                          color: 'var(--muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '6px 8px 8px',
                          fontWeight: 600,
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {propertiesWithScores
                      .slice()
                      .sort((a, b) => (a.score ?? -1) - (b.score ?? -1)) // worst first
                      .map(prop => (
                        <tr key={prop.property_id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 8px', fontSize: 13, color: 'var(--fg)', maxWidth: 180 }}>
                            <span style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}>
                              {prop.property_name}
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px', minWidth: 120 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 6, background: 'var(--card-b)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                <div style={{
                                  height: '100%',
                                  width: `${prop.score ?? 0}%`,
                                  background: scoreColor(prop.score),
                                  borderRadius: 3,
                                  transition: 'width 0.4s ease',
                                }} />
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 600, color: scoreColor(prop.score), minWidth: 36, textAlign: 'right' }}>
                                {prop.score !== null ? `${prop.score}%` : '—'}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <FmBadge variant={conditionVariant(prop.score)}>
                              {conditionLabel(prop.score)}
                            </FmBadge>
                          </td>
                          <td style={{ padding: '10px 8px', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                            {fmtDate(prop.completed_at)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </FmCard>
        </div>

        {/* Right: Life Safety & ADA Deficiencies */}
        <div style={{ flex: '2 1 300px', minWidth: 0 }}>
          <FmCard>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <AlertTriangle size={15} style={{ color: '#dc2626', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Life Safety &amp; ADA Deficiencies
                </span>
              </div>

              {sortedDeficiencies.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>
                  No open life safety or ADA deficiencies.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sortedDeficiencies.map(def => {
                    const type = deficiencyType(def.key)
                    return (
                      <div key={def.id} style={{
                        padding: '10px 12px',
                        background: 'var(--card-b)',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                      }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
                          {def.property_name}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {def.label ?? 'Unnamed item'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {/* Type badge */}
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 4,
                            background: `${type.color}22`,
                            color: type.color,
                            border: `1px solid ${type.color}55`,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            whiteSpace: 'nowrap',
                          }}>
                            {type.label}
                          </span>

                          {/* Cost estimate */}
                          <CostEstimateCell
                            deficiency={def}
                            canEdit={adminUser}
                            onSaved={handleCostSaved}
                          />

                          {/* WO button */}
                          <div style={{ marginLeft: 'auto' }}>
                            {def.work_order_id ? (
                              <a
                                href={`/dashboard/fm/work-orders/${def.work_order_id}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: 'var(--primary)',
                                  textDecoration: 'none',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <ExternalLink size={11} />
                                View WO
                              </a>
                            ) : (
                              <button
                                onClick={() => handleCreateWo(def)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: '#fff',
                                  background: 'var(--primary)',
                                  border: 'none',
                                  borderRadius: 4,
                                  padding: '3px 10px',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Create WO
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </FmCard>
        </div>
      </div>

      {/* ── Charts row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* WO Trend — 12 months */}
        <div style={{ flex: '3 1 360px', minWidth: 0 }}>
          <FmCard>
            <div style={{ padding: '16px 18px' }}>
              <FmSectionLabel>Work Order Activity — Last 12 Months</FmSectionLabel>
              <div style={{ marginTop: 14, height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={woTrend} barGap={2} barSize={10}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--card-b)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        fontSize: 12,
                        color: 'var(--fg)',
                      }}
                    />
                    <Bar dataKey="open"      name="Opened"    fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10, justifyContent: 'center' }}>
                {[{ color: '#3b82f6', label: 'Opened' }, { color: '#10b981', label: 'Completed' }].map(l => (
                  <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: 'inline-block' }} />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
          </FmCard>
        </div>

        {/* WO by Priority */}
        <div style={{ flex: '2 1 260px', minWidth: 0 }}>
          <FmCard>
            <div style={{ padding: '16px 18px' }}>
              <FmSectionLabel>Open Work Orders by Priority</FmSectionLabel>
              {priorityChartData.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13, padding: '16px 0' }}>
                  No open work orders.
                </div>
              ) : (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { priority: 'HIGH',   count: woByPriority.HIGH,   fill: '#ef4444' },
                    { priority: 'MEDIUM', count: woByPriority.MEDIUM, fill: '#f59e0b' },
                    { priority: 'LOW',    count: woByPriority.LOW,    fill: '#10b981' },
                  ].map(row => {
                    const total = woByPriority.HIGH + woByPriority.MEDIUM + woByPriority.LOW + woByPriority.NONE
                    const pct = total > 0 ? (row.count / total) * 100 : 0
                    return (
                      <div key={row.priority}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: row.fill }}>{row.priority}</span>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{row.count}</span>
                        </div>
                        <div style={{ height: 8, background: 'var(--card-b)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                          <div style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: row.fill,
                            borderRadius: 4,
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </FmCard>
        </div>

      </div>
    </div>
  )
}
