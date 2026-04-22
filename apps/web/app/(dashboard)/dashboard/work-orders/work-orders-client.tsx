'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Search, Filter, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import { PriorityBadge } from '@/components/work-orders/PriorityBadge'
import { InlineStatusSelect } from '@/components/work-orders/InlineStatusSelect'
import { LoadMoreButton } from '@/components/ui/LoadMoreButton'
import { loadMoreWorkOrders } from '../pagination-actions'
import { useT } from '@/lib/locale'
import type { Database, WorkOrderStatus } from '@sentinel/db'
import type { TranslationKey } from '@/lib/translations/en'

type WorkOrder = Database['public']['Tables']['work_orders']['Row'] & {
  assignee_name?: string | null
}

type SortKey = 'number' | 'title' | 'priority' | 'status' | 'assignee_name' | 'due_date' | 'total_cost'
type SortDir = 'asc' | 'desc'

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const STATUS_TABS: { value: WorkOrderStatus | 'all'; labelKey: TranslationKey }[] = [
  { value: 'all',         labelKey: 'common.all' },
  { value: 'open',        labelKey: 'status.open' },
  { value: 'in_progress', labelKey: 'status.in_progress' },
  { value: 'on_hold',     labelKey: 'status.on_hold' },
  { value: 'closed',      labelKey: 'status.closed' },
]

function cmp(a: WorkOrder, b: WorkOrder, key: SortKey): number {
  switch (key) {
    case 'priority':
      return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
    case 'total_cost':
      return (a.total_cost ?? 0) - (b.total_cost ?? 0)
    case 'due_date':
      return (a.due_date ?? '').localeCompare(b.due_date ?? '')
    default: {
      const av = ((a as Record<string, unknown>)[key] ?? '') as string
      const bv = ((b as Record<string, unknown>)[key] ?? '') as string
      return av.localeCompare(bv)
    }
  }
}

interface Props {
  workOrders: WorkOrder[]
  totalCount: number
  orgId: string
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 opacity-20"><ChevronUp size={11} /></span>
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="ml-1 text-blue-500" />
    : <ChevronDown size={11} className="ml-1 text-blue-500" />
}

export function WorkOrdersClient({ workOrders: initial, totalCount, orgId }: Props) {
  const t = useT()
  const [rows, setRows] = useState(initial)
  const [activeStatus, setActiveStatus] = useState<WorkOrderStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('due_date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [isPending, startTransition] = useTransition()

  function handleLoadMore() {
    startTransition(async () => {
      const next = await loadMoreWorkOrders(orgId, rows.length)
      setRows((prev) => [...prev, ...next])
    })
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    const base = rows.filter((wo) => {
      const matchesStatus = activeStatus === 'all' || wo.status === activeStatus
      const q = search.toLowerCase()
      const matchesSearch =
        !q ||
        wo.number.toLowerCase().includes(q) ||
        wo.title.toLowerCase().includes(q) ||
        (wo.description ?? '').toLowerCase().includes(q)
      return matchesStatus && matchesSearch
    })
    return [...base].sort((a, b) => {
      const v = cmp(a, b, sortKey)
      return sortDir === 'asc' ? v : -v
    })
  }, [rows, activeStatus, search, sortKey, sortDir])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: totalCount }
    for (const wo of rows) {
      c[wo.status] = (c[wo.status] ?? 0) + 1
    }
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
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{t('wo.pageTitle')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{totalCount.toLocaleString()} {t('common.total')}</p>
        </div>
        <Link
          href="/dashboard/work-orders/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          {t('wo.newBtn')}
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={t('wo.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveStatus(tab.value)}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeStatus === tab.value
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white',
            ].join(' ')}
          >
            {t(tab.labelKey)}
            {counts[tab.value] !== undefined && (
              <span className="ml-1.5 text-xs text-slate-400">({counts[tab.value]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Filter size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{t('wo.noResults')}</p>
          <Link href="/dashboard/work-orders/new" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
            {t('common.createFirst')}
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <Th col="number" label={t('wo.colNumber')} />
                  <Th col="title" label={t('wo.colTitle')} />
                  <Th col="priority" label={t('wo.colPriority')} />
                  <Th col="status" label={t('wo.colStatus')} />
                  <Th col="assignee_name" label={t('wo.colAssignedTo')} className="hidden md:table-cell" />
                  <Th col="due_date" label={t('wo.colDueDate')} className="hidden lg:table-cell" />
                  <Th col="total_cost" label={t('wo.colCost')} className="hidden lg:table-cell" />
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((wo) => (
                  <tr
                    key={wo.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    onClick={() => { window.location.href = `/dashboard/work-orders/${wo.id}` }}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{wo.number}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-xs truncate">{wo.title}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><PriorityBadge priority={wo.priority} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <InlineStatusSelect workOrderId={wo.id} status={wo.status} stopPropagation />
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap hidden md:table-cell">
                      {wo.assignee_name ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap hidden lg:table-cell">
                      {wo.due_date ? format(new Date(wo.due_date), 'MMM d, yyyy') : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap hidden lg:table-cell">
                      {wo.total_cost > 0
                        ? `$${wo.total_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                        : <span className="text-slate-300">—</span>}
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
