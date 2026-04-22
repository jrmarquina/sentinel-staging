'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Search, AlertTriangle, RefreshCw, ChevronRight, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import { PotholeStatusBadge } from '@/components/potholes/PotholeStatusBadge'
import { PCIScore } from '@/components/potholes/PCIBadge'
import { LoadMoreButton } from '@/components/ui/LoadMoreButton'
import { loadMorePotholes } from '../pagination-actions'
import { useT } from '@/lib/locale'
import type { Database, PotholeStatus, SurfaceDefectType } from '@sentinel/db'
import type { TranslationKey } from '@/lib/translations/en'

type PotholeReport = Database['public']['Tables']['pothole_reports']['Row'] & {
  assignee_name?: string | null
  reporter_name?: string | null
}

type Tab = 'all' | 'active' | 'queue' | 'recurring' | 'closed'
type SortKey = 'number' | 'title' | 'status' | 'severity' | 'defect_type' | 'pci_score' | 'address' | 'created_at'
type SortDir = 'asc' | 'desc'

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

function cmp(a: PotholeReport, b: PotholeReport, key: SortKey): number {
  switch (key) {
    case 'severity':
      return (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
    case 'pci_score':
      return (a.pci_score ?? 101) - (b.pci_score ?? 101)
    case 'created_at':
      return a.created_at.localeCompare(b.created_at)
    default: {
      const av = ((a as Record<string, unknown>)[key] ?? '') as string
      const bv = ((b as Record<string, unknown>)[key] ?? '') as string
      return av.localeCompare(bv)
    }
  }
}

const TABS: { value: Tab; labelKey: TranslationKey }[] = [
  { value: 'all',       labelKey: 'ph.tab.all' },
  { value: 'active',    labelKey: 'ph.tab.active' },
  { value: 'queue',     labelKey: 'ph.tab.queue' },
  { value: 'recurring', labelKey: 'ph.tab.recurring' },
  { value: 'closed',    labelKey: 'ph.tab.closed' },
]

const ACTIVE_STATUSES: PotholeStatus[] = ['reported', 'verified', 'assigned', 'in_repair']
const CLOSED_STATUSES: PotholeStatus[] = ['repaired', 'closed']

function priorityScore(r: PotholeReport): number {
  const pciComponent = r.pci_score != null ? 100 - r.pci_score : 50
  const severityComponent =
    r.severity === 'critical' ? 40 :
    r.severity === 'high'     ? 25 :
    r.severity === 'medium'   ? 10 : 0
  const recurringBonus = (r.recurrence_count * 10) + (r.is_recurring ? 20 : 0)
  return pciComponent + severityComponent + recurringBonus
}

const DEFECT_LABEL_KEY: Record<SurfaceDefectType, TranslationKey> = {
  pothole:               'ph.defect.pothole',
  alligator_crack:       'ph.defect.alligator_crack',
  linear_crack:          'ph.defect.linear_crack',
  edge_failure:          'ph.defect.edge_failure',
  subsidence:            'ph.defect.subsidence',
  rutting:               'ph.defect.rutting',
  surface_deterioration: 'ph.defect.surface_deterioration',
}

interface Props {
  reports: PotholeReport[]
  totalCount: number
  orgId: string
}

export function PotholesClient({ reports: initial, totalCount, orgId }: Props) {
  const t = useT()
  const [rows, setRows] = useState(initial)
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [isPending, startTransition] = useTransition()

  function handleLoadMore() {
    startTransition(async () => {
      const next = await loadMorePotholes(orgId, rows.length)
      setRows((prev) => [...prev, ...next])
    })
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let result = rows.filter((r) => {
      const matchesSearch =
        !q ||
        r.number.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (r.address ?? '').toLowerCase().includes(q)

      if (!matchesSearch) return false

      if (activeTab === 'active')    return ACTIVE_STATUSES.includes(r.status)
      if (activeTab === 'closed')    return CLOSED_STATUSES.includes(r.status)
      if (activeTab === 'recurring') return r.is_recurring
      return true
    })

    // Queue tab uses its own priority sort; all other tabs use user-selected sort
    if (activeTab === 'queue') {
      result = result
        .filter((r) => !CLOSED_STATUSES.includes(r.status))
        .sort((a, b) => priorityScore(b) - priorityScore(a))
    } else {
      result = [...result].sort((a, b) => {
        const v = cmp(a, b, sortKey)
        return sortDir === 'asc' ? v : -v
      })
    }

    return result
  }, [rows, activeTab, search, sortKey, sortDir])

  const counts = useMemo(() => ({
    all:       totalCount,
    active:    rows.filter((r) => ACTIVE_STATUSES.includes(r.status)).length,
    queue:     rows.filter((r) => !CLOSED_STATUSES.includes(r.status)).length,
    recurring: rows.filter((r) => r.is_recurring).length,
    closed:    rows.filter((r) => CLOSED_STATUSES.includes(r.status)).length,
  }), [rows, totalCount])

  function Th({ col, label, className }: { col: SortKey; label: string; className?: string }) {
    // Queue tab has its own fixed sort — disable column sorting while on it
    const isQueue = activeTab === 'queue'
    return (
      <th
        className={`text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap ${isQueue ? '' : 'cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200'} transition-colors ${className ?? ''}`}
        onClick={isQueue ? undefined : () => handleSort(col)}
      >
        <span className="inline-flex items-center">
          {label}
          {!isQueue && (
            col === sortKey
              ? sortDir === 'asc'
                ? <ChevronUp size={11} className="ml-1 text-blue-500" />
                : <ChevronDown size={11} className="ml-1 text-blue-500" />
              : <ChevronUp size={11} className="ml-1 opacity-20" />
          )}
        </span>
      </th>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{t('ph.pageTitle')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{totalCount.toLocaleString()} {t('common.total')}</p>
        </div>
        <Link
          href="/dashboard/potholes/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          {t('ph.newBtn')}
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={t('ph.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex items-center gap-1.5',
              activeTab === tab.value
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white',
            ].join(' ')}
          >
            {tab.value === 'recurring' && <RefreshCw size={12} />}
            {tab.value === 'queue' && <ArrowUpDown size={12} />}
            {t(tab.labelKey)}
            <span className="ml-0.5 text-xs text-slate-400">({counts[tab.value]})</span>
          </button>
        ))}
      </div>

      {/* Queue description banner */}
      {activeTab === 'queue' && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-300">
          <ArrowUpDown size={16} className="mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">{t('ph.repairQueue')}</span>
            {' — '}{t('ph.repairQueueDesc')}
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <AlertTriangle size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{t('ph.noResults')}</p>
          <Link href="/dashboard/potholes/new" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
            {t('common.createFirst')}
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <Th col="number" label={t('ph.colNumber')} />
                  <Th col="title" label={t('ph.colTitle')} />
                  <Th col="status" label={t('ph.colStatus')} />
                  <Th col="severity" label={t('ph.colSeverity')} />
                  <Th col="defect_type" label={t('ph.colType')} className="hidden md:table-cell" />
                  <Th col="pci_score" label={t('ph.colPCI')} className="hidden lg:table-cell" />
                  {activeTab === 'queue' && (
                    <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 hidden lg:table-cell whitespace-nowrap">{t('ph.priorityScore')}</th>
                  )}
                  <Th col="address" label={t('ph.colAddress')} className="hidden xl:table-cell" />
                  <Th col="created_at" label={t('ph.colReported')} className="hidden lg:table-cell" />
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    onClick={() => { window.location.href = `/dashboard/potholes/${r.id}` }}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-slate-500">{r.number}</span>
                      {r.is_recurring && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300">
                          <RefreshCw size={9} />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-[200px] truncate">{r.title}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><PotholeStatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <SeverityDot severity={r.severity} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell whitespace-nowrap text-xs">
                      {t(DEFECT_LABEL_KEY[r.defect_type])}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <PCIScore score={r.pci_score} />
                    </td>
                    {activeTab === 'queue' && (
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                          {priorityScore(r)}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-slate-500 hidden xl:table-cell text-xs max-w-[180px] truncate">
                      {r.address ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell text-xs whitespace-nowrap">
                      {format(new Date(r.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-slate-400"><ChevronRight size={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <LoadMoreButton
        loadedCount={rows.length}
        totalCount={totalCount}
        isPending={isPending}
        onLoadMore={handleLoadMore}
      />
    </div>
  )
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500',
    high:     'bg-orange-500',
    medium:   'bg-yellow-500',
    low:      'bg-slate-400',
  }
  const labels: Record<string, string> = {
    critical: 'Critical',
    high:     'High',
    medium:   'Medium',
    low:      'Low',
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
      <span className={`w-2 h-2 rounded-full ${colors[severity] ?? 'bg-slate-400'}`} />
      {labels[severity] ?? severity}
    </span>
  )
}
