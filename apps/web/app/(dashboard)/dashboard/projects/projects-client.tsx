'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Plus, Search, MapPin, ClipboardCheck, ClipboardList, ArrowRight, FolderKanban, Ban } from 'lucide-react'
import { format, isPast, isWithinInterval, addDays } from 'date-fns'
import { useT } from '@/lib/locale'
import type { Database, ProjectStatus, ProjectDelayStatus } from '@sentinel/db'
import type { TranslationKey } from '@/lib/translations/en'

type Project = Database['public']['Tables']['projects']['Row'] & {
  manager_name?: string | null
  inspection_count?: number
  work_order_count?: number
}

type Tab = ProjectStatus | 'all'

const TABS: { value: Tab; labelKey: TranslationKey }[] = [
  { value: 'all',       labelKey: 'proj.all' },
  { value: 'active',    labelKey: 'proj.status.active' },
  { value: 'planning',  labelKey: 'proj.status.planning' },
  { value: 'on_hold',   labelKey: 'proj.status.on_hold' },
  { value: 'completed', labelKey: 'proj.status.completed' },
]

const STATUS_COLOR: Record<ProjectStatus, string> = {
  planning:  'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  active:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  on_hold:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
}

function getDelayStatus(p: Project): ProjectDelayStatus {
  if (p.status === 'completed' || p.status === 'cancelled') return 'closed'
  if (!p.planned_end_date) return 'unknown'
  const end = new Date(p.planned_end_date)
  if (isPast(end)) return 'overdue'
  if (isWithinInterval(end, { start: new Date(), end: addDays(new Date(), 14) })) return 'at_risk'
  return 'on_track'
}

const DELAY_COLOR: Record<ProjectDelayStatus, string> = {
  on_track: 'bg-green-500',
  at_risk:  'bg-amber-500',
  overdue:  'bg-red-500',
  closed:   'bg-slate-400',
  unknown:  'bg-slate-300',
}

const DELAY_LABEL: Record<ProjectDelayStatus, string> = {
  on_track: 'On Track',
  at_risk:  'At Risk',
  overdue:  'Overdue',
  closed:   'Closed',
  unknown:  'No Date',
}

export function ProjectsClient({ projects }: { projects: Project[] }) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return projects.filter((p) => {
      const matchesSearch = !q ||
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.address ?? '').toLowerCase().includes(q)
      const matchesTab = activeTab === 'all' || p.status === activeTab
      return matchesSearch && matchesTab
    })
  }, [projects, activeTab, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: projects.length }
    for (const p of projects) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [projects])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{t('proj.pageTitle')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{projects.length} {t('common.total')}</p>
        </div>
        <Link
          href="/dashboard/projects/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          {t('proj.newBtn')}
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={t('proj.searchPlaceholder')}
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
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab.value
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white',
            ].join(' ')}
          >
            {t(tab.labelKey)}
            <span className="ml-1.5 text-xs text-slate-400">({counts[tab.value] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Card grid — v2 Properties style */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <FolderKanban size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{t('proj.noResults')}</p>
          <Link href="/dashboard/projects/new" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
            {t('common.createFirst')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p) => {
            const delay = getDelayStatus(p)
            const budgetPct = p.budget && p.budget > 0
              ? Math.min(100, Math.round((p.actual_cost / p.budget) * 100))
              : null

            return (
              <Link
                key={p.id}
                href={`/dashboard/projects/${p.id}`}
                className="group flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all"
              >
                {/* Cover image / placeholder */}
                <div className="relative h-36 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 overflow-hidden">
                  {(p.cover_url || p.cover_image_id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.cover_url ?? `/api/attachments/${p.cover_image_id}`}
                      alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <MapPin size={40} className="text-slate-300 dark:text-slate-600" />
                    </div>
                  )}

                  {/* Blocked badge */}
                  {p.blocked && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white bg-amber-500/90 backdrop-blur-sm">
                      <Ban size={10} />
                      Blocked
                    </span>
                  )}

                  {/* Delay status badge */}
                  <span className={`absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white backdrop-blur-sm bg-black/40`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${DELAY_COLOR[delay]}`} />
                    {DELAY_LABEL[delay]}
                  </span>

                  {/* Status badge */}
                  <span className={`absolute bottom-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${STATUS_COLOR[p.status]}`}>
                    {t(('proj.status.' + p.status) as TranslationKey)}
                  </span>
                </div>

                {/* Card body */}
                <div className="flex flex-col gap-2 p-4 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-white leading-tight line-clamp-2">
                      {p.name}
                    </h3>
                    <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider shrink-0 mt-0.5">
                      {p.code}
                    </span>
                  </div>

                  {p.address && (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin size={11} className="text-blue-500 shrink-0" />
                      <span className="truncate">{p.address}</span>
                    </div>
                  )}

                  {/* Budget progress */}
                  {budgetPct !== null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Budget</span>
                        <span className={budgetPct > 90 ? 'text-red-500 font-bold' : ''}>{budgetPct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${budgetPct > 100 ? 'bg-red-500' : budgetPct > 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(100, budgetPct)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Planned end date */}
                  {p.planned_end_date && (
                    <p className="text-xs text-slate-400">
                      Due {format(new Date(p.planned_end_date), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>

                {/* Footer stats */}
                <div className="flex items-center border-t border-slate-100 dark:border-slate-800 px-4 py-2.5 gap-4">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <ClipboardCheck size={12} />
                    <span>{p.inspection_count ?? 0} {t('proj.detail.inspectionCount')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <ClipboardList size={12} />
                    <span>{p.work_order_count ?? 0} {t('proj.detail.workOrderCount')}</span>
                  </div>
                  <ArrowRight size={14} className="ml-auto text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
