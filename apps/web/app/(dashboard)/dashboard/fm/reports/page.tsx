'use client'

import { useEffect, useState } from 'react'
import {
  Download, Trash2, Loader2, AlertTriangle, FileBarChart,
  RefreshCw, BarChart3, Clock, CheckCircle2, AlertCircle, TrendingUp,
} from 'lucide-react'

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
  completionTrend: { date: string; count: number }[]
  inspections: { total: number; completed: number; avgScore: number | null; passRate: number | null }
}

type MainTab = 'REPORTS' | 'ANALYTICS'
type ReportTab = 'ALL' | 'INSPECTION' | 'PORTFOLIO'

// ── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  PLOMERIA: 'Plomería', CARPINTERIA: 'Carpintería', ELECTRICIDAD: 'Electricidad',
  CISTERNA: 'Cisterna', TRAMPA_GRASA: 'Trampa Grasa', AREAS_VERDES: 'Áreas Verdes',
  AIRE_ACONDICIONADO: 'Aire Acondicionado', REFRIGERACION: 'Refrigeración',
  ALARMA_INCENDIO: 'Alarma Incendio', EXTINTORES: 'Extintores',
  CONTROL_ACCESO: 'Control de Acceso', CONTROL_PLAGAS: 'Control de Plagas',
  ESTRUCTURA: 'Estructura', FILTRACIONES: 'Filtraciones', GENERADOR: 'Generador',
  PINTURA: 'Pintura', POZO_SEPTICO: 'Pozo Séptico', ROTULACION: 'Rotulación',
}
const ASSIGNEE_LABELS: Record<string, string> = {
  HS_STAFF: 'Head Start Staff', MUNICIPALITY: 'Municipio',
  EXTERNAL_SUPPLIER: 'Suplidor Externo', DIRECTOR_REFERRAL: 'Referido al Director',
  UNASSIGNED: 'Sin asignar',
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

const REPORT_TABS: { value: ReportTab; label: string }[] = [
  { value: 'ALL',        label: 'All' },
  { value: 'INSPECTION', label: 'Inspection' },
  { value: 'PORTFOLIO',  label: 'Portfolio' },
]

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

// ── Analytics panel ────────────────────────────────────────────────────────

function AnalyticsPanel() {
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

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
      <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
    </div>
  )
  if (error || !data) return (
    <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--red)' }}>
      <AlertTriangle size={24} style={{ margin: '0 auto 0.75rem' }} />
      <p style={{ fontSize: '0.875rem' }}>{error ?? 'No data'}</p>
    </div>
  )

  const { summary, avgResolutionHours, byCategory, byPriority, byAssigneeType, completionTrend, inspections } = data

  const maxCat = Math.max(...byCategory.map((c) => c.count), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
        <StatCard label="Total WOs"       value={summary.total} />
        <StatCard label="Open"            value={summary.open}        accent="var(--primary)" />
        <StatCard label="In Progress"     value={summary.inProgress}  accent="var(--amber)" />
        <StatCard label="Completed"       value={summary.completed}   accent="var(--teal)" />
        <StatCard label="Pending Review"  value={summary.pendingReview} accent={summary.pendingReview > 0 ? 'var(--amber)' : undefined} />
        <StatCard label="Overdue"         value={summary.overdue}     accent={summary.overdue > 0 ? 'var(--red)' : undefined} />
        <StatCard label="High Priority"   value={summary.highPriority} accent={summary.highPriority > 0 ? 'var(--red)' : undefined}
          sub="open / in progress" />
        <StatCard
          label="Avg Resolution"
          value={avgResolutionHours != null ? formatHours(avgResolutionHours) : '—'}
          sub="time to complete"
        />
      </div>

      {/* 14-day completion sparkline */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.125rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
          <TrendingUp size={14} style={{ color: 'var(--teal)' }} />
          <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--fg)' }}>Completions — last 14 days</p>
        </div>
        <Sparkline data={completionTrend} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>

        {/* WO by category */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
            <BarChart3 size={14} style={{ color: 'var(--primary)' }} />
            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--fg)' }}>WOs por Categoría</p>
          </div>
          {byCategory.length === 0 ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>No hay datos</p>
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
            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--fg)' }}>Por Prioridad</p>
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
              <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--fg)' }}>Por Tipo de Asignación</p>
            </div>
            {Object.entries(byAssigneeType)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', minWidth: 120, flexShrink: 0 }}>
                    {ASSIGNEE_LABELS[key] ?? key.replace(/_/g, ' ')}
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
            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--fg)' }}>Inspecciones</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {[
              { label: 'Total',       value: inspections.total },
              { label: 'Completadas', value: inspections.completed },
              { label: 'Puntaje Prom.', value: inspections.avgScore != null ? `${inspections.avgScore}%` : '—' },
              { label: 'Tasa de Aprobación', value: inspections.passRate != null ? `${inspections.passRate}%` : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'var(--card-b)', borderRadius: 8, padding: '0.625rem 0.75rem' }}>
                <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 600 }}>{label}</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--fg)' }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function FMReportsPage() {
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
        setGenMsg('Portfolio report generation started — refresh in a moment.')
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
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Reports</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
            {reports.length} generated report{reports.length !== 1 ? 's' : ''}
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
              Generate Portfolio Report
            </button>
          </div>
        )}
      </div>

      {/* Main tabs: Reports | Analytics */}
      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {([
          { value: 'REPORTS' as MainTab,   label: 'Generated Reports', icon: FileBarChart },
          { value: 'ANALYTICS' as MainTab, label: 'Analytics',         icon: BarChart3 },
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
            {REPORT_TABS.map((tab) => (
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
              <p style={{ fontSize: '0.875rem' }}>No reports found</p>
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
                    {report.status === 'READY' && report.signed_url ? (
                      <a href={report.signed_url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.375rem 0.75rem', background: 'var(--teal)', color: '#fff', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none' }}>
                        <Download size={13} />
                        Download
                      </a>
                    ) : <div />}

                    {confirmDelete === report.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button onClick={() => handleDelete(report.id)} disabled={deleting === report.id}
                          style={{ fontSize: '0.75rem', color: 'var(--red)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                          {deleting === report.id ? 'Deleting…' : 'Confirm'}
                        </button>
                        <button onClick={() => setConfirmDelete(null)}
                          style={{ fontSize: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                          Cancel
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
