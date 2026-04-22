'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Search, ClipboardCheck, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react'
import { LoadMoreButton } from '@/components/ui/LoadMoreButton'
import { loadMoreInspections } from '../pagination-actions'
import { format } from 'date-fns'
import { useT } from '@/lib/locale'
import type { Database, InspectionStatus } from '@sentinel/db'
import type { TranslationKey } from '@/lib/translations/en'

type Inspection = Database['public']['Tables']['inspections']['Row'] & {
  inspector_name?: string | null
  project_name?: string | null
  project_code?: string | null
}

type Tab = InspectionStatus | 'all'
type SortKey = 'number' | 'title' | 'status' | 'score' | 'project_code' | 'inspector_name' | 'scheduled_at'
type SortDir = 'asc' | 'desc'

const TABS: { value: Tab; labelKey: TranslationKey }[] = [
  { value: 'all',         labelKey: 'common.all' },
  { value: 'draft',       labelKey: 'insp.status.draft' },
  { value: 'in_progress', labelKey: 'insp.status.in_progress' },
  { value: 'completed',   labelKey: 'insp.status.completed' },
  { value: 'approved',    labelKey: 'insp.status.approved' },
]

const STATUS_COLOR: Record<InspectionStatus, string> = {
  draft:       'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  completed:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  approved:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

function cmp(a: Inspection, b: Inspection, key: SortKey): number {
  switch (key) {
    case 'score':
      return (a.score ?? -Infinity) - (b.score ?? -Infinity)
    case 'scheduled_at':
      return (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')
    default: {
      const av = ((a as Record<string, unknown>)[key] ?? '') as string
      const bv = ((b as Record<string, unknown>)[key] ?? '') as string
      return av.localeCompare(bv)
    }
  }
}

interface Props {
  inspections: Inspection[]
  totalCount: number
  orgId: string
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 opacity-20"><ChevronUp size={11} /></span>
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="ml-1 text-blue-500" />
    : <ChevronDown size={11} className="ml-1 text-blue-500" />
}

export function InspectionsClient({ inspections: initial, totalCount, orgId }: Props) {
  const t = useT()
  const [rows, setRows] = useState(initial)
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('scheduled_at')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [isPending, startTransition] = useTransition()

  function handleLoadMore() {
    startTransition(async () => {
      const next = await loadMoreInspections(orgId, rows.length)
      setRows((prev) => [...prev, ...next])
    })
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const base = rows.filter((i) => {
      const matchesSearch = !q ||
        i.number.toLowerCase().includes(q) ||
        i.title.toLowerCase().includes(q) ||
        (i.project_name ?? '').toLowerCase().includes(q)
      const matchesTab = activeTab === 'all' || i.status === activeTab
      return matchesSearch && matchesTab
    })
    return [...base].sort((a, b) => {
      const v = cmp(a, b, sortKey)
      return sortDir === 'asc' ? v : -v
    })
  }, [rows, activeTab, search, sortKey, sortDir])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: totalCount }
    for (const i of rows) c[i.status] = (c[i.status] ?? 0) + 1
    return c
  }, [rows, totalCount])

  function Th({ col, label, className }: { col: SortKey; label: string; className?: string }) {
    return (
      <th
        className={`text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors ${className ?? ''}`}
        onClick={() => handleSort(col)}
      >
        <span className="inline-flex items-center">
          {label}
          <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
        </span>
      </th>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{t('insp.pageTitle')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{totalCount.toLocaleString()} {t('common.total')}</p>
        </div>
        <Link
          href="/dashboard/inspections/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />{t('insp.newBtn')}
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder={t('insp.searchPlaceholder')} value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {TABS.map((tab) => (
          <button key={tab.value} onClick={() => setActiveTab(tab.value)}
            className={['px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab.value ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'].join(' ')}>
            {t(tab.labelKey)}
            <span className="ml-1.5 text-xs text-slate-400">({counts[tab.value] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <ClipboardCheck size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{t('insp.noResults')}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <Th col="number" label={t('insp.colNumber')} />
                  <Th col="title" label={t('insp.colTitle')} />
                  <Th col="status" label={t('insp.colStatus')} />
                  <Th col="score" label={t('insp.colScore')} />
                  <Th col="project_code" label={t('insp.colProject')} className="hidden md:table-cell" />
                  <Th col="inspector_name" label={t('insp.colInspector')} className="hidden lg:table-cell" />
                  <Th col="scheduled_at" label={t('insp.colScheduled')} className="hidden lg:table-cell" />
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((insp) => (
                  <tr key={insp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    onClick={() => { window.location.href = `/dashboard/inspections/${insp.id}` }}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{insp.number}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-xs truncate">{insp.title}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[insp.status]}`}>
                        {t(('insp.status.' + insp.status) as TranslationKey)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {insp.score != null
                        ? <span className={`font-mono font-bold text-sm ${insp.score >= 80 ? 'text-green-600 dark:text-green-400' : insp.score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{insp.score}%</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-500 text-xs">
                      {insp.project_code
                        ? <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{insp.project_code}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-500 text-xs whitespace-nowrap">
                      {insp.inspector_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-500 text-xs whitespace-nowrap">
                      {insp.scheduled_at ? format(new Date(insp.scheduled_at), 'MMM d, yyyy') : '—'}
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
