'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Download, Trash2, Loader2, AlertTriangle, FileBarChart,
  RefreshCw, BarChart3, Clock, CheckCircle2, AlertCircle, TrendingUp, Building2, Eye,
  Pencil, Check, X as XIcon,
} from 'lucide-react'
import { useFmT } from '@/lib/locale'

// ── Types ──────────────────────────────────────────────────────────────────

interface FmReport {
  id: string
  name: string
  type: string
  status: string
  signed_url: string | null
  created_at: string
  property_id: string | null
  fm_properties?: { name: string } | null
}

interface Analytics {
  summary: {
    total: number; open: number; inProgress: number; completed: number
    pendingReview: number; overdue: number; highPriority: number
  }
  avgResolutionHours: number | null
  byCategory: { category: string; count: number }[]
  byPriority: Record<string, number>
  byAssigneeType: Record<string, number>
  bySource: Record<string, number>
  byProperty: {
    property_id: string; property_name: string; property_code: string | null
    total: number; open: number; inProgress: number; completed: number
    pendingReview: number; overdue: number; avgResolutionHours: number | null
  }[]
  completionTrend: { date: string; count: number }[]
  inspections: { total: number; completed: number; avgScore: number | null; passRate: number | null }
}

type MainTab = 'REPORTS' | 'ANALYTICS'
type ReportTab = 'ALL' | 'INSPECTION' | 'PORTFOLIO'

// ── Static label maps (non-UI, always the same) ────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  PLOMERIA: 'Plomería', CARPINTERIA: 'Carpintería', ELECTRICIDAD: 'Electricidad',
  CISTERNA: 'Cisterna', TRAMPA_GRASA: 'Trampa Grasa', AREAS_VERDES: 'Áreas Verdes',
  AIRE_ACONDICIONADO: 'Aire Acondicionado', REFRIGERACION: 'Refrigeración',
  ALARMA_INCENDIO: 'Alarma Incendio', EXTINTORES: 'Extintores',
  CONTROL_ACCESO: 'Control de Acceso', CONTROL_PLAGAS: 'Control de Plagas',
  ESTRUCTURA: 'Estructura', FILTRACIONES: 'Filtraciones', GENERADOR: 'Generador',
  PINTURA: 'Pintura', POZO_SEPTICO: 'Pozo Séptico', ROTULACION: 'Rotulación',
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  READY:   'bg-green-100 text-green-700',
  FAILED:  'bg-red-100 text-red-700',
}
const TYPE_BADGE: Record<string, string> = {
  PORTFOLIO_COMPLIANCE: 'bg-blue-100 text-blue-700',
  INSPECTION_DETAIL:    'bg-purple-100 text-purple-700',
}

function isInspectionReport(r: FmReport) { return r.type.toLowerCase().includes('inspection') }
function isPortfolioReport(r: FmReport)  { return r.type.toLowerCase().includes('portfolio') }

function formatHours(h: number): string {
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  const rem  = h % 24
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`
}

// ── Mini horizontal bar ────────────────────────────────────────────────────

function HBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ flex: 1, height: 6, background: 'var(--card-b)', borderRadius: 9999, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 9999, transition: 'width 0.5s ease' }} />
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: 'var(--card)', border: `1px solid ${accent ?? 'var(--border)'}`,
      borderRadius: 12, padding: '1rem 1.125rem',
    }}>
      <p style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '1.75rem', fontWeight: 800, color: accent ?? 'var(--fg)', margin: '0.3rem 0 0', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.25rem' }}>{sub}</p>}
    </div>
  )
}

// ── Completion sparkline ───────────────────────────────────────────────────

function Sparkline({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  const recent = data.slice(-14) // show last 14 days
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>
      {recent.map((d) => {
        const pct = (d.count / max) * 100
        const day = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)
        return (
          <div key={d.date} title={`${d.date}: ${d.count} completed`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 2 }}>
            <div style={{
              width: '100%', height: Math.max(pct * 0.36, d.count > 0 ? 3 : 0),
              background: d.count > 0 ? 'var(--teal)' : 'var(--card-b)',
              borderRadius: 3, transition: 'height 0.3s ease',
            }} />
            <span style={{ fontSize: 8, color: 'var(--faint)', lineHeight: 1 }}>{day}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Portfolio types ────────────────────────────────────────────────────────

interface PropertyScore {
  property_id: string; property_name: string
  score: number | null; completed_at: string | null; inspection_id: string
}
interface Deficiency {
  id: string; key: string | null; label: string | null
  result: string | null; severity: string | null; rating: number | null
  notes: string | null; cost_estimate: number | null
  inspection_id: string; property_id: string | null; property_name: string
  work_order_id: string | null; wo_status: string | null; wo_title: string | null
}
interface PortfolioData {
  kpis: { totalProperties: number; avgPortfolioScore: number; openDeficiencies: number; lifeSafetyCount: number; openWos: number; overdueWos: number }
  propertiesWithScores: PropertyScore[]
  lifeSafetyDeficiencies: Deficiency[]
  session: { capability: string | null; role: string }
}

function scoreColor(s: number | null) {
  if (s === null) return 'var(--muted)'
  return s >= 80 ? '#10b981' : s >= 50 ? '#f59e0b' : '#ef4444'
}
function conditionLabel(s: number | null) {
  if (s === null) return 'N/A'
  return s >= 80 ? 'GOOD' : s >= 50 ? 'FAIR' : 'POOR'
}
function defType(key: string | null): { label: string; color: string } {
  if (!key) return { label: 'HIGH PRIORITY', color: '#f97316' }
  if (/^ls_\d+c$/.test(key)) return { label: 'LIFE SAFETY', color: '#dc2626' }
  if (/^ad_\d+c$/.test(key)) return { label: 'ADA', color: '#d97706' }
  return { label: 'HIGH PRIORITY', color: '#f97316' }
}
function fmtCurrency(v: number | null) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
}
function isFmAdmin(cap: string | null, role: string) {
  if (cap) return ['org_admin', 'fm_manager'].includes(cap)
  return ['admin', 'supervisor'].includes(role)
}
function sortDefs(items: Deficiency[]) {
  const rank = (d: Deficiency) => {
    const k = d.key ?? ''
    if (/^ls_\d+c$/.test(k)) return 0
    if (/^ad_\d+c$/.test(k)) return 1
    return 2
  }
  return [...items].sort((a, b) => rank(a) - rank(b))
}

function CostCell({ def, canEdit, onSaved }: { def: Deficiency; canEdit: boolean; onSaved: (id: string, v: number | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(def.cost_estimate != null ? String(def.cost_estimate) : '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const parsed = val.trim() === '' ? null : parseFloat(val)
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) { setSaving(false); return }
    const res = await fetch(`/api/fm/deficiencies/${def.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cost_estimate: parsed }),
    })
    if (res.ok) { onSaved(def.id, parsed); setEditing(false) }
    setSaving(false)
  }

  if (!canEdit) return <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtCurrency(def.cost_estimate)}</span>
  if (editing) return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input type="number" min={0} step={100} value={val} onChange={e => setVal(e.target.value)} autoFocus
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        style={{ width: 80, fontSize: 12, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card-b)', color: 'var(--fg)' }} />
      <button onClick={save} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', padding: 0 }}>
        {saving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
      </button>
      <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}>
        <XIcon size={12} />
      </button>
    </span>
  )
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
      <span style={{ color: def.cost_estimate != null ? 'var(--fg)' : 'var(--muted)' }}>{fmtCurrency(def.cost_estimate)}</span>
      <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}>
        <Pencil size={10} />
      </button>
    </span>
  )
}

// ── Portfolio section (renders inside AnalyticsPanel) ──────────────────────

function PortfolioSection() {
  const router = useRouter()
  const [data, setData] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/fm/analytics/portfolio')
      .then(r => r.ok ? r.json() as Promise<PortfolioData> : Promise.reject())
      .then(setData)
      .catch(() => {/* silent — WO analytics still shows */})
      .finally(() => setLoading(false))
  }, [])

  const handleCostSaved = useCallback((id: string, v: number | null) => {
    setData(prev => prev ? {
      ...prev,
      lifeSafetyDeficiencies: prev.lifeSafetyDeficiencies.map(d => d.id === id ? { ...d, cost_estimate: v } : d),
    } : prev)
  }, [])

  const handleCreateWo = useCallback(async (def: Deficiency) => {
    const res = await fetch(`/api/fm/deficiencies/${def.id}/work-order`, { method: 'POST' }).catch(() => null)
    if (!res?.ok) return
    const body = await res.json() as { work_order_id: string }
    router.push(`/dashboard/fm/work-orders/${body.work_order_id}`)
  }, [router])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
    </div>
  )
  if (!data) return null

  const { kpis, propertiesWithScores, lifeSafetyDeficiencies, session: sess } = data
  const admin = isFmAdmin(sess.capability, sess.role)
  const sorted = sortDefs(lifeSafetyDeficiencies)
  const propsSorted = [...propertiesWithScores].sort((a, b) => (a.score ?? 100) - (b.score ?? 100))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '0.5rem' }}>

      {/* Alert banner */}
      {kpis.lifeSafetyCount > 0 && (
        <div style={{ background: '#dc26261a', border: '1px solid #dc2626', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
          <AlertTriangle size={16} />
          {kpis.lifeSafetyCount} Life Safety &amp; ADA {kpis.lifeSafetyCount === 1 ? 'Deficiency Requires' : 'Deficiencies Require'} Immediate Attention
        </div>
      )}

      {/* Two-column: property condition | life safety panel */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>

        {/* Property condition table */}
        <div style={{ flex: '3 1 340px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.875rem' }}>
            <Building2 size={14} style={{ color: 'var(--primary)' }} />
            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--fg)' }}>Property Condition</p>
          </div>
          {propsSorted.length === 0 ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>No completed inspections yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Property', 'Score', 'Condition', 'Last Inspection'].map(h => (
                    <th key={h} style={{ padding: '0.3rem 0.5rem', textAlign: h === 'Property' ? 'left' : 'center', color: 'var(--muted)', fontWeight: 600, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {propsSorted.map(p => (
                  <tr key={p.property_id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--card-b)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}>
                    <td style={{ padding: '0.45rem 0.5rem', color: 'var(--fg)', fontWeight: 600, whiteSpace: 'nowrap' }}>{p.property_name}</td>
                    <td style={{ padding: '0.45rem 0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--card-b)', borderRadius: 9999, overflow: 'hidden', minWidth: 60 }}>
                          <div style={{ height: '100%', width: `${p.score ?? 0}%`, background: scoreColor(p.score), borderRadius: 9999 }} />
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: scoreColor(p.score), minWidth: 36, textAlign: 'right' }}>
                          {p.score != null ? `${p.score}%` : '—'}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: scoreColor(p.score), background: `${scoreColor(p.score)}1a`, padding: '2px 6px', borderRadius: 9999 }}>
                        {conditionLabel(p.score)}
                      </span>
                    </td>
                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                      {p.completed_at ? new Date(p.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Life Safety & ADA panel */}
        <div style={{ flex: '2 1 280px', background: 'var(--card)', border: kpis.lifeSafetyCount > 0 ? '1px solid #dc262640' : '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.875rem' }}>
            <AlertTriangle size={14} style={{ color: kpis.lifeSafetyCount > 0 ? '#dc2626' : 'var(--muted)' }} />
            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--fg)' }}>⚠ Life Safety &amp; ADA Deficiencies</p>
          </div>
          {sorted.length === 0 ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--teal)', fontWeight: 600 }}>✓ No open life safety or ADA deficiencies.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {sorted.map(def => {
                const { label: typeLabel, color: typeColor } = defType(def.key)
                return (
                  <div key={def.id} style={{ padding: '0.625rem 0.75rem', background: 'var(--card-b)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 600 }}>{def.property_name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--fg)', fontWeight: 600, lineHeight: 1.3 }}>{def.label ?? '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: typeColor, background: `${typeColor}1a`, padding: '2px 7px', borderRadius: 9999, whiteSpace: 'nowrap' }}>
                        {typeLabel}
                      </span>
                      <CostCell def={def} canEdit={admin} onSaved={handleCostSaved} />
                      {def.work_order_id ? (
                        <a href={`/dashboard/fm/work-orders/${def.work_order_id}`}
                          style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--primary)', textDecoration: 'none', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                          View WO →
                        </a>
                      ) : (
                        <button onClick={() => handleCreateWo(def)}
                          style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--primary)', background: 'none', border: '1px solid var(--primary)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                          Create WO
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0.5rem 0' }} />
    </div>
  )
}

// ── Analytics panel ────────────────────────────────────────────────────────

function AnalyticsPanel() {
  const t = useFmT()
  const [data, setData]   = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/fm/reports/analytics')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load analytics')
        return r.json() as Promise<Analytics>
      })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false))
  }, [])

  const assigneeLabels: Record<string, string> = {
    HS_STAFF:          t('wo.fm.assignee.HS_STAFF'),
    MUNICIPALITY:      t('wo.fm.assignee.MUNICIPALITY'),
    EXTERNAL_SUPPLIER: t('wo.fm.assignee.EXTERNAL_SUPPLIER'),
    DIRECTOR_REFERRAL: t('wo.fm.assignee.DIRECTOR_REFERRAL'),
    UNASSIGNED:        t('wo.fm.assignee.UNASSIGNED'),
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
      <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
    </div>
  )
  if (error || !data) return (
    <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--red)' }}>
      <AlertTriangle size={24} style={{ margin: '0 auto 0.75rem' }} />
      <p style={{ fontSize: '0.875rem' }}>{error ?? t('ana.loadError')}</p>
    </div>
  )

  const { summary, avgResolutionHours, byCategory, byPriority, byAssigneeType, byProperty, completionTrend, inspections } = data

  const maxCat = Math.max(...byCategory.map((c) => c.count), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Portfolio condition + life safety section */}
      <PortfolioSection />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
        <StatCard label={t('ana.totalWO')}       value={summary.total} />
        <StatCard label={t('ana.open')}           value={summary.open}          accent="var(--primary)" />
        <StatCard label={t('ana.inProgress')}     value={summary.inProgress}    accent="var(--amber)" />
        <StatCard label={t('ana.completed')}      value={summary.completed}     accent="var(--teal)" />
        <StatCard label={t('ana.pendingReview')}  value={summary.pendingReview} accent={summary.pendingReview > 0 ? 'var(--amber)' : undefined} />
        <StatCard label={t('ana.overdue')}        value={summary.overdue}       accent={summary.overdue > 0 ? 'var(--red)' : undefined} />
        <StatCard label={t('ana.highPriority')}   value={summary.highPriority}  accent={summary.highPriority > 0 ? 'var(--red)' : undefined}
          sub={t('ana.openInProgress')} />
        <StatCard
          label={t('ana.avgResolution')}
          value={avgResolutionHours != null ? formatHours(avgResolutionHours) : '—'}
          sub={t('ana.timeToComplete')}
        />
      </div>

      {/* 14-day completion sparkline */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.125rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
          <TrendingUp size={14} style={{ color: 'var(--teal)' }} />
          <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--fg)' }}>{t('ana.sparklineLabel')}</p>
        </div>
        <Sparkline data={completionTrend} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>

        {/* WO by category */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
            <BarChart3 size={14} style={{ color: 'var(--primary)' }} />
            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--fg)' }}>{t('ana.byCategory')}</p>
          </div>
          {byCategory.length === 0 ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{t('ana.noData')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {byCategory.map(({ category, count }) => (
                <div key={category} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', minWidth: 120, flexShrink: 0 }}>
                    {CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ')}
                  </span>
                  <HBar value={count} max={maxCat} color="var(--primary)" />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--fg)', minWidth: 20, textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Priority breakdown */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
            <AlertCircle size={14} style={{ color: 'var(--red)' }} />
            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--fg)' }}>{t('ana.byPriority')}</p>
          </div>
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map((p) => {
            const count = byPriority[p] ?? 0
            const color = p === 'HIGH' ? 'var(--red)' : p === 'MEDIUM' ? 'var(--amber)' : 'var(--teal)'
            return (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.55rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', minWidth: 60, flexShrink: 0 }}>{p}</span>
                <HBar value={count} max={summary.total || 1} color={color} />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--fg)', minWidth: 20, textAlign: 'right' }}>{count}</span>
              </div>
            )
          })}

          {/* Assignee type */}
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <CheckCircle2 size={14} style={{ color: 'var(--teal)' }} />
              <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--fg)' }}>{t('ana.byAssignee')}</p>
            </div>
            {Object.entries(byAssigneeType)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', minWidth: 120, flexShrink: 0 }}>
                    {assigneeLabels[key] ?? key.replace(/_/g, ' ')}
                  </span>
                  <HBar value={count} max={summary.total || 1} color="var(--primary-c)" />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--fg)', minWidth: 20, textAlign: 'right' }}>{count}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Inspection stats */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
            <Clock size={14} style={{ color: 'var(--amber)' }} />
            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--fg)' }}>{t('ana.inspections')}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {[
              { label: t('ana.insp.total'),     value: inspections.total },
              { label: t('ana.insp.completed'), value: inspections.completed },
              { label: t('ana.insp.avgScore'),  value: inspections.avgScore != null ? `${inspections.avgScore}%` : '—' },
              { label: t('ana.insp.passRate'),  value: inspections.passRate != null ? `${inspections.passRate}%` : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'var(--card-b)', borderRadius: 8, padding: '0.625rem 0.75rem' }}>
                <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 600 }}>{label}</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--fg)' }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* By-property breakdown */}
      {byProperty && byProperty.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Building2 size={14} style={{ color: 'var(--primary)' }} />
            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--fg)' }}>{t('ana.byProperty')}</p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[
                    t('ana.col.site'), t('ana.col.total'), t('ana.col.open'),
                    t('ana.col.inProgress'), t('ana.col.completed'), t('ana.col.pending'),
                    t('ana.col.overdue'), t('ana.col.avgTime'),
                  ].map((h) => (
                    <th key={h} style={{ padding: '0.4rem 0.75rem', textAlign: h === t('ana.col.site') ? 'left' : 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byProperty.map((p) => (
                  <tr key={p.property_id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--card-b)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--fg)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {p.property_name}
                      {p.property_code && (
                        <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', color: 'var(--faint)', fontWeight: 400 }}>{p.property_code}</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}>{p.total}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: p.open > 0 ? 'var(--primary)' : 'var(--faint)' }}>{p.open}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: p.inProgress > 0 ? 'var(--amber)' : 'var(--faint)' }}>{p.inProgress}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: p.completed > 0 ? 'var(--teal)' : 'var(--faint)' }}>{p.completed}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: p.pendingReview > 0 ? 'var(--amber)' : 'var(--faint)' }}>{p.pendingReview}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: p.overdue > 0 ? 'var(--red)' : 'var(--faint)', fontWeight: p.overdue > 0 ? 700 : 400 }}>{p.overdue}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--muted)' }}>
                      {p.avgResolutionHours != null ? formatHours(p.avgResolutionHours) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function FMReportsPage() {
  const t = useFmT()
  const [mainTab, setMainTab] = useState<MainTab>('REPORTS')

  // Reports state
  const [reports,       setReports]       = useState<FmReport[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const [activeTab,     setActiveTab]     = useState<ReportTab>('ALL')
  const [generating,    setGenerating]    = useState(false)
  const [genMsg,        setGenMsg]        = useState<string | null>(null)
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const reportTabs: { value: ReportTab; label: string }[] = [
    { value: 'ALL',        label: t('rep.filter.all') },
    { value: 'INSPECTION', label: t('rep.filter.inspection') },
    { value: 'PORTFOLIO',  label: t('rep.filter.portfolio') },
  ]

  function load() {
    setLoading(true)
    fetch('/api/fm/reports')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load reports')
        return r.json() as Promise<FmReport[]>
      })
      .then(setReports)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleGenerate() {
    setGenerating(true)
    setGenMsg(null)
    try {
      const res = await fetch('/api/fm/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PORTFOLIO_COMPLIANCE' }),
      })
      if (res.ok) {
        setGenMsg(t('rep.genMsg'))
        load()
      } else {
        const body = await res.json() as { error?: string }
        setGenMsg(body.error ?? 'Generation failed')
      }
    } finally {
      setGenerating(false)
      setTimeout(() => setGenMsg(null), 6000)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/fm/reports/${id}`, { method: 'DELETE' })
      if (res.ok) setReports((prev) => prev.filter((r) => r.id !== id))
    } finally {
      setDeleting(null)
      setConfirmDelete(null)
    }
  }

  const filtered = reports.filter((r) => {
    if (activeTab === 'ALL')        return true
    if (activeTab === 'INSPECTION') return isInspectionReport(r)
    if (activeTab === 'PORTFOLIO')  return isPortfolioReport(r)
    return true
  })

  const tabCount = (tab: ReportTab) => {
    if (tab === 'ALL')        return reports.length
    if (tab === 'INSPECTION') return reports.filter(isInspectionReport).length
    if (tab === 'PORTFOLIO')  return reports.filter(isPortfolioReport).length
    return 0
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>{t('rep.title')}</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
            {reports.length} {reports.length !== 1 ? t('rep.generated_plural') : t('rep.generated')}
          </p>
        </div>
        {mainTab === 'REPORTS' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {genMsg && <span style={{ fontSize: '0.75rem', color: 'var(--teal)', fontWeight: 600, maxWidth: 260 }}>{genMsg}</span>}
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.45rem 0.875rem',
                background: generating ? 'var(--card-b)' : 'var(--primary)', color: 'var(--primary-fg)',
                border: 'none', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                opacity: generating ? 0.7 : 1, transition: 'opacity 0.15s ease',
              }}
            >
              {generating
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : <RefreshCw size={14} />}
              {generating ? t('rep.generating') : t('rep.generateBtn')}
            </button>
          </div>
        )}
      </div>

      {/* Main tabs: Reports | Analytics */}
      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {([
          { value: 'REPORTS' as MainTab,   label: t('rep.tab.reports'),   icon: FileBarChart },
          { value: 'ANALYTICS' as MainTab, label: t('rep.tab.analytics'), icon: BarChart3 },
        ]).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setMainTab(value)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.5rem 0.875rem',
              fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer',
              borderBottom: mainTab === value ? '2px solid var(--primary)' : '2px solid transparent',
              color: mainTab === value ? 'var(--primary)' : 'var(--muted)',
              background: 'none', marginBottom: -1, transition: 'color 0.15s ease',
            }}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {mainTab === 'ANALYTICS' ? (
        <AnalyticsPanel />
      ) : (
        <>
          {/* Report type filter tabs */}
          <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
            {reportTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                style={{
                  padding: '0.4rem 0.75rem', fontSize: '0.8rem', fontWeight: 500,
                  border: 'none', cursor: 'pointer', background: 'none',
                  borderBottom: activeTab === tab.value ? '2px solid var(--primary)' : '2px solid transparent',
                  color: activeTab === tab.value ? 'var(--primary)' : 'var(--muted)',
                  marginBottom: -1, transition: 'color 0.15s ease',
                }}
              >
                {tab.label}
                <span style={{ marginLeft: 5, opacity: 0.6, fontSize: '0.72rem' }}>({tabCount(tab.value)})</span>
              </button>
            ))}
          </div>

          {/* Report list */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
              <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--red)' }}>
              <AlertTriangle size={24} style={{ margin: '0 auto 0.75rem' }} />
              <p style={{ fontSize: '0.875rem' }}>{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--muted)' }}>
              <FileBarChart size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.35 }} />
              <p style={{ fontSize: '0.875rem' }}>{t('rep.empty')}</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.875rem' }}>
              {filtered.map((report) => (
                <div
                  key={report.id}
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1rem 1.125rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <p style={{ fontWeight: 700, color: 'var(--fg)', margin: 0, fontSize: '0.875rem', lineHeight: 1.35, flex: 1 }}>
                      {report.name}
                    </p>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[report.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {report.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[report.type] ?? 'bg-slate-100 text-slate-600'}`}>
                      {report.type.replace(/_/g, ' ')}
                    </span>
                    {report.fm_properties?.name && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{report.fm_properties.name}</span>
                    )}
                  </div>

                  <p style={{ fontSize: '0.72rem', color: 'var(--faint)', margin: 0 }}>
                    {new Date(report.created_at).toLocaleDateString()}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '0.25rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <a
                        href={`/print/fm/report/${report.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.375rem 0.75rem', background: 'var(--primary)', color: 'var(--primary-fg)', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none' }}
                      >
                        <Eye size={13} />
                        View
                      </a>
                      {report.status === 'READY' && report.signed_url && (
                        <a href={report.signed_url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.375rem 0.75rem', background: 'var(--teal)', color: '#fff', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none' }}>
                          <Download size={13} />
                          {t('rep.download')}
                        </a>
                      )}
                    </div>

                    {confirmDelete === report.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button onClick={() => handleDelete(report.id)} disabled={deleting === report.id}
                          style={{ fontSize: '0.75rem', color: 'var(--red)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                          {deleting === report.id ? t('rep.deleting') : t('rep.confirm')}
                        </button>
                        <button onClick={() => setConfirmDelete(null)}
                          style={{ fontSize: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {t('rep.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(report.id)}
                        style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
