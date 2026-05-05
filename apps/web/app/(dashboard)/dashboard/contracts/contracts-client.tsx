'use client'

import { useState, useMemo, useTransition } from 'react'
import { isPast, parseISO } from 'date-fns'
import Link from 'next/link'
import { Plus, Search, ChevronRight, FileText, ChevronUp, ChevronDown, GitCommitHorizontal } from 'lucide-react'
import { LoadMoreButton } from '@/components/ui/LoadMoreButton'
import { loadMoreContracts } from '../pagination-actions'
import { format } from 'date-fns'
import { ContractStatusBadge } from '@/components/contracts/ContractStatusBadge'
import { useT } from '@/lib/locale'
import type { Database, ContractStatus } from '@sentinel/db'
import type { TranslationKey } from '@/lib/translations/en'

type Contract = Database['public']['Tables']['contracts']['Row']
type SortKey = 'number' | 'title' | 'status' | 'vendor_name' | 'contract_value' | 'end_date'
type SortDir = 'asc' | 'desc'

// ── Amendment ghost rows ───────────────────────────────────────────────────────
// Amended contracts are stored as a single DB row (the current/valid version).
// The previous values are kept in previous_value / previous_end_date / amended_at.
// In the table we render a "ghost" row immediately above the valid row to show
// what the contract looked like before the amendment.
interface GhostRow {
  __ghost: true
  ghostId: string          // stable key
  parentContract: Contract // the current (valid) contract
}
type DisplayRow = Contract | GhostRow

function isGhost(row: DisplayRow): row is GhostRow {
  return '__ghost' in row && row.__ghost === true
}

function effectiveStatus(c: Contract): ContractStatus {
  if (c.status === 'active' && c.end_date && isPast(parseISO(c.end_date))) return 'expired'
  return c.status
}

function cmp(a: Contract, b: Contract, key: SortKey): number {
  switch (key) {
    case 'contract_value':
      return (a.contract_value ?? -Infinity) - (b.contract_value ?? -Infinity)
    case 'end_date':
      return (a.end_date ?? '').localeCompare(b.end_date ?? '')
    case 'status':
      return effectiveStatus(a).localeCompare(effectiveStatus(b))
    default: {
      const av = (a[key] ?? '') as string
      const bv = (b[key] ?? '') as string
      return av.localeCompare(bv)
    }
  }
}

const STATUS_TABS: { value: ContractStatus | 'all'; labelKey: TranslationKey }[] = [
  { value: 'all',              labelKey: 'common.all' },
  { value: 'draft',            labelKey: 'ct.status.draft' },
  { value: 'pending_approval', labelKey: 'ct.status.pending_approval' },
  { value: 'active',           labelKey: 'ct.status.active' },
  { value: 'completed',        labelKey: 'ct.status.completed' },
  { value: 'terminated',       labelKey: 'ct.status.terminated' },
  { value: 'expired',          labelKey: 'ct.status.expired' },
]

interface Props {
  contracts: Contract[]
  totalCount: number
  orgId: string
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 opacity-20"><ChevronUp size={11} /></span>
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="ml-1 text-blue-500" />
    : <ChevronDown size={11} className="ml-1 text-blue-500" />
}

export function ContractsClient({ contracts: initial, totalCount, orgId }: Props) {
  const t = useT()
  const [rows, setRows] = useState(initial)
  const [activeStatus, setActiveStatus] = useState<ContractStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('end_date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [isPending, startTransition] = useTransition()

  function handleLoadMore() {
    startTransition(async () => {
      const next = await loadMoreContracts(orgId, rows.length)
      setRows((prev) => [...prev, ...next])
    })
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  // filtered = sorted list of real contracts (no ghost rows yet)
  const filtered = useMemo(() => {
    const base = rows.filter((c) => {
      const matchesStatus = activeStatus === 'all' || c.status === activeStatus
      const q = search.toLowerCase()
      const matchesSearch =
        !q ||
        c.number.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (c.vendor_name ?? '').toLowerCase().includes(q)
      return matchesStatus && matchesSearch
    })
    return [...base].sort((a, b) => {
      const v = cmp(a, b, sortKey)
      return sortDir === 'asc' ? v : -v
    })
  }, [rows, activeStatus, search, sortKey, sortDir])

  // displayRows = filtered list with ghost rows injected before each amended contract
  const displayRows = useMemo((): DisplayRow[] => {
    const result: DisplayRow[] = []
    for (const c of filtered) {
      if (c.amended_at != null && c.previous_value != null) {
        result.push({ __ghost: true, ghostId: `ghost-${c.id}`, parentContract: c })
      }
      result.push(c)
    }
    return result
  }, [filtered])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: totalCount }
    for (const contract of rows) {
      c[contract.status] = (c[contract.status] ?? 0) + 1
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
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{t('ct.pageTitle')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{totalCount.toLocaleString()} {t('common.total')}</p>
        </div>
        <Link
          href="/dashboard/contracts/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          {t('ct.newBtn')}
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={t('ct.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
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
          <FileText size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{t('ct.noResults')}</p>
          {rows.length === 0 && activeStatus === 'all' && !search && (
            <Link href="/dashboard/contracts/new" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
              {t('common.createFirst')}
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <Th col="number" label={t('ct.colNumber')} />
                  <Th col="title" label={t('ct.colTitle')} />
                  <Th col="status" label={t('ct.colStatus')} />
                  <Th col="vendor_name" label={t('ct.colVendor')} className="hidden md:table-cell" />
                  <Th col="contract_value" label={t('ct.colValue')} className="hidden lg:table-cell" />
                  <Th col="end_date" label={t('ct.colEndDate')} className="hidden lg:table-cell" />
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {displayRows.map((row) => {
                  // ── Ghost row (superseded / amended version) ─────────────
                  if (isGhost(row)) {
                    const c = row.parentContract
                    return (
                      <tr
                        key={row.ghostId}
                        className="bg-amber-50 dark:bg-amber-900/20 opacity-75"
                        title="This contract was amended — values below were valid before the amendment"
                      >
                        <td className="px-4 py-2 font-mono text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <GitCommitHorizontal size={13} className="text-amber-500 flex-shrink-0" />
                            {c.number}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-amber-700 dark:text-amber-400 max-w-xs truncate">
                          <span className="flex items-center gap-2">
                            <span className="text-xs line-through opacity-70">{c.title}</span>
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 uppercase tracking-wide flex-shrink-0">
                              Modified
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-300 text-amber-900 dark:bg-amber-700 dark:text-amber-100">
                            Superseded
                          </span>
                        </td>
                        <td className="px-4 py-2 text-amber-600 dark:text-amber-500 hidden md:table-cell max-w-[160px] truncate text-xs opacity-70">
                          {c.vendor_name ?? <span className="opacity-50">—</span>}
                        </td>
                        <td className="px-4 py-2 text-amber-700 dark:text-amber-400 whitespace-nowrap hidden lg:table-cell text-xs">
                          {c.previous_value != null
                            ? <span className="line-through opacity-70">${c.previous_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            : <span className="opacity-40">—</span>}
                        </td>
                        <td className="px-4 py-2 text-amber-700 dark:text-amber-400 whitespace-nowrap hidden lg:table-cell text-xs">
                          {c.previous_end_date
                            ? <span className="line-through opacity-70">{format(new Date(c.previous_end_date), 'MMM d, yyyy')}</span>
                            : <span className="opacity-40">—</span>}
                        </td>
                        <td className="px-4 py-2 text-amber-400 opacity-30"><ChevronRight size={16} /></td>
                      </tr>
                    )
                  }

                  // ── Current (valid) contract row ─────────────────────────
                  // TypeScript narrows `row` to Contract after the isGhost guard above
                  const c = row
                  const isExpired = effectiveStatus(c) === 'expired'
                  return (
                    <tr
                      key={c.id}
                      className={[
                        'transition-colors cursor-pointer',
                        isExpired
                          ? 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
                      ].join(' ')}
                      onClick={() => { window.location.href = `/dashboard/contracts/${c.id}` }}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{c.number}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-xs truncate">{c.title}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><ContractStatusBadge status={effectiveStatus(c)} /></td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell max-w-[160px] truncate">
                        {c.vendor_name ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap hidden lg:table-cell">
                        {c.contract_value != null
                          ? `$${c.contract_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap hidden lg:table-cell">
                        {c.end_date ? format(new Date(c.end_date), 'MMM d, yyyy') : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400"><ChevronRight size={16} /></td>
                    </tr>
                  )
                })}
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
