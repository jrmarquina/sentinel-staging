'use client'

import { useEffect, useState } from 'react'
import { Download, Trash2, Loader2, AlertTriangle, FileBarChart, RefreshCw } from 'lucide-react'

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

type TabValue = 'ALL' | 'INSPECTION' | 'PORTFOLIO'

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  READY: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
}

const TYPE_BADGE: Record<string, string> = {
  PORTFOLIO_COMPLIANCE: 'bg-blue-100 text-blue-700',
  INSPECTION_DETAIL: 'bg-purple-100 text-purple-700',
}

const TABS: { value: TabValue; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'INSPECTION', label: 'Inspection' },
  { value: 'PORTFOLIO', label: 'Portfolio' },
]

function isInspectionReport(r: FmReport): boolean {
  return r.type.toLowerCase().includes('inspection')
}

function isPortfolioReport(r: FmReport): boolean {
  return r.type.toLowerCase().includes('portfolio')
}

export default function FMReportsPage() {
  const [reports, setReports] = useState<FmReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabValue>('ALL')
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
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
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== id))
      }
    } finally {
      setDeleting(null)
      setConfirmDelete(null)
    }
  }

  const filtered = reports.filter((r) => {
    if (activeTab === 'ALL') return true
    if (activeTab === 'INSPECTION') return isInspectionReport(r)
    if (activeTab === 'PORTFOLIO') return isPortfolioReport(r)
    return true
  })

  const tabCount = (tab: TabValue) => {
    if (tab === 'ALL') return reports.length
    if (tab === 'INSPECTION') return reports.filter(isInspectionReport).length
    if (tab === 'PORTFOLIO') return reports.filter(isPortfolioReport).length
    return 0
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">{reports.length} generated reports</p>
        </div>
        <div className="flex items-center gap-2">
          {genMsg && (
            <span className="text-xs text-green-600 font-medium max-w-xs">{genMsg}</span>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Generate Portfolio Report
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab.value
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white',
            ].join(' ')}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-slate-400">({tabCount(tab.value)})</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="py-16 text-center text-red-500">
          <AlertTriangle size={28} className="mx-auto mb-2" />
          <p>{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <FileBarChart size={32} className="mx-auto mb-3 opacity-40" />
          <p>No reports found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((report) => (
            <div
              key={report.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900 dark:text-white flex-1 min-w-0 leading-snug">
                  {report.name}
                </p>
                <span
                  className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[report.status] ?? 'bg-slate-100 text-slate-600'}`}
                >
                  {report.status}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[report.type] ?? 'bg-slate-100 text-slate-600'}`}
                >
                  {report.type.replace(/_/g, ' ')}
                </span>
                {report.fm_properties?.name && (
                  <span className="text-xs text-slate-500">{report.fm_properties.name}</span>
                )}
              </div>

              <p className="text-xs text-slate-400">
                {new Date(report.created_at).toLocaleDateString()}
              </p>

              <div className="flex items-center justify-between mt-auto pt-1">
                {report.status === 'READY' && report.signed_url ? (
                  <a
                    href={report.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                  >
                    <Download size={14} />
                    Download
                  </a>
                ) : (
                  <div />
                )}

                {confirmDelete === report.id ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDelete(report.id)}
                      disabled={deleting === report.id}
                      className="text-xs text-red-600 font-medium hover:text-red-700"
                    >
                      {deleting === report.id ? 'Deleting...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="text-xs text-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(report.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
