'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, isPast, isWithinInterval, addDays } from 'date-fns'
import {
  ArrowLeft, Edit2, MapPin, ExternalLink, Camera,
  ClipboardCheck, ClipboardList, Plus,
  ChevronRight, ChevronLeft,
} from 'lucide-react'
import { DeleteButton } from '@/components/ui/DeleteButton'
import { ProjectForm } from '../project-form'
import { useT } from '@/lib/locale'
import type { Database, ProjectStatus, InspectionStatus } from '@sentinel/db'
import type { TranslationKey } from '@/lib/translations/en'

type Project = Database['public']['Tables']['projects']['Row'] & { manager_name?: string | null }
type Attachment = Database['public']['Tables']['attachments']['Row']
type Inspection = Database['public']['Tables']['inspections']['Row'] & { inspector_name?: string | null }
type WorkOrder = Pick<Database['public']['Tables']['work_orders']['Row'], 'id'|'number'|'title'|'status'|'priority'|'due_date'|'total_cost'>
type Profile = Database['public']['Tables']['profiles']['Row']

type Tab = 'overview' | 'workOrders' | 'inspections' | 'gallery'

interface Props {
  project: Project
  attachments: Attachment[]
  inspections: Inspection[]
  workOrders: WorkOrder[]
  members: Profile[]
  orgId: string
  userId: string
  isAdmin: boolean
}

const STATUS_COLOR: Record<ProjectStatus, string> = {
  planning:  'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  active:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  on_hold:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
}

const INSP_STATUS_COLOR: Record<InspectionStatus, string> = {
  draft:       'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  completed:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  approved:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

const WO_PRIORITY_COLOR: Record<string, string> = {
  P1: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  P2: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  P3: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  P4: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

function ScoreRing({ score }: { score: number | null }) {
  if (score == null) return <span className="text-slate-400 text-sm">—</span>
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'
  const r = 20, circumference = 2 * Math.PI * r
  const dash = (score / 100) * circumference
  return (
    <div className="flex items-center gap-2">
      <svg width="52" height="52" className="-rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200 dark:text-slate-700" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
      </svg>
      <span className="text-xl font-black" style={{ color }}>{score}%</span>
    </div>
  )
}

export function ProjectDetail({ project, attachments, inspections, workOrders, members, orgId, userId, isAdmin }: Props) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  if (editing) {
    return <ProjectForm orgId={orgId} userId={userId} members={members} initial={project} />
  }

  const TABS: { value: Tab; labelKey: TranslationKey; count?: number }[] = [
    { value: 'overview',    labelKey: 'proj.tab.overview' },
    { value: 'workOrders',  labelKey: 'proj.tab.workOrders',  count: workOrders.length },
    { value: 'inspections', labelKey: 'proj.tab.inspections', count: inspections.length },
    { value: 'gallery',     labelKey: 'proj.tab.gallery',     count: attachments.length },
  ]

  const budgetPct = project.budget && project.budget > 0
    ? Math.min(100, Math.round((project.actual_cost / project.budget) * 100))
    : null

  const overBudget = budgetPct !== null && budgetPct > 100
  const variance = project.budget != null
    ? project.budget - project.actual_cost
    : null

  // Delay status
  let delayLabel = ''
  let delayColor = ''
  if (project.status === 'completed' || project.status === 'cancelled') {
    delayLabel = 'Closed'; delayColor = 'text-slate-400'
  } else if (!project.planned_end_date) {
    delayLabel = 'No Date Set'; delayColor = 'text-slate-400'
  } else {
    const end = new Date(project.planned_end_date)
    if (isPast(end)) { delayLabel = 'Overdue'; delayColor = 'text-red-600 dark:text-red-400' }
    else if (isWithinInterval(end, { start: new Date(), end: addDays(new Date(), 14) })) { delayLabel = 'At Risk'; delayColor = 'text-amber-600 dark:text-amber-400' }
    else { delayLabel = 'On Track'; delayColor = 'text-green-600 dark:text-green-400' }
  }

  return (
    <div className="space-y-5 max-w-5xl pb-[calc(80px+env(safe-area-inset-bottom,20px))] lg:pb-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard/projects" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                {project.number}
              </span>
              <span className="font-mono text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                {project.code}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[project.status]}`}>
                {t(('proj.status.' + project.status) as TranslationKey)}
              </span>
              <span className={`text-xs font-semibold ${delayColor}`}>{delayLabel}</span>
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white mt-1 truncate">{project.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Edit2 size={14} />{t('common.edit')}
          </button>
          {isAdmin && (
            <DeleteButton
              id={project.id}
              table="projects"
              label={`Project ${project.number}`}
              redirectTo="/dashboard/projects"
            />
          )}
        </div>
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
            {tab.count !== undefined && (
              <span className="ml-1.5 text-xs text-slate-400">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Cover image */}
          {(project.cover_url || project.cover_image_id) && (
            <div className="lg:col-span-3 rounded-xl overflow-hidden h-48">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={project.cover_url ?? `/api/attachments/${project.cover_image_id}`}
                alt={project.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Blocked banner */}
          {project.blocked && (
            <div className="lg:col-span-3 flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm">
              <span className="text-amber-500 mt-0.5">⚠️</span>
              <div>
                <p className="font-semibold text-amber-700 dark:text-amber-300">
                  Blocked by {project.blocked_by ?? 'unknown entity'}
                </p>
                {project.blocked_by_reason && (
                  <p className="text-amber-600 dark:text-amber-400 mt-0.5">{project.blocked_by_reason}</p>
                )}
                {project.blocked_since && (
                  <p className="text-amber-500 text-xs mt-1">Since {format(new Date(project.blocked_since), 'MMM d, yyyy')}</p>
                )}
              </div>
            </div>
          )}

          {/* Details card */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Details</h2>
              <InfoRow label={t('proj.detail.manager')}>
                {project.manager_name ?? <span className="text-slate-300">—</span>}
              </InfoRow>
              <InfoRow label={t('proj.detail.startDate')}>
                {project.start_date ? format(new Date(project.start_date), 'MMM d, yyyy') : '—'}
              </InfoRow>
              <InfoRow label={t('proj.detail.plannedEnd')}>
                {project.planned_end_date
                  ? <span className={delayColor}>{format(new Date(project.planned_end_date), 'MMM d, yyyy')}</span>
                  : '—'}
              </InfoRow>
              {project.end_date && (
                <InfoRow label={t('proj.detail.actualEnd')}>
                  {format(new Date(project.end_date), 'MMM d, yyyy')}
                </InfoRow>
              )}
            </div>

            {/* Budget card */}
            {project.budget != null && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('proj.form.sectionBudget')}</h2>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label={t('proj.detail.budget')} value={`$${project.budget.toLocaleString('en-US', { minimumFractionDigits: 0 })}`} />
                  <Stat label={t('proj.detail.actualCost')} value={`$${project.actual_cost.toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
                    valueClass={overBudget ? 'text-red-600 dark:text-red-400' : ''} />
                  {variance != null && (
                    <Stat
                      label={t('proj.detail.variance')}
                      value={`${variance >= 0 ? '+' : ''}$${Math.abs(variance).toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
                      valueClass={variance < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}
                    />
                  )}
                </div>
                {budgetPct !== null && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Budget utilization</span>
                      <span className={overBudget ? 'text-red-500 font-bold' : ''}>{budgetPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : budgetPct > 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(100, budgetPct)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            {project.description && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Description</h2>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{project.description}</p>
              </div>
            )}
          </div>

          {/* Right: location + quick stats */}
          <div className="space-y-4">
            {/* Inspection score summary */}
            {inspections.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Latest Inspection Score</h2>
                <ScoreRing score={inspections[0].score} />
                <p className="text-xs text-slate-400">{inspections[0].title}</p>
                <p className="text-xs text-slate-400">
                  {inspections[0].completed_at
                    ? format(new Date(inspections[0].completed_at), 'MMM d, yyyy')
                    : 'Not completed'}
                </p>
              </div>
            )}

            {/* Location */}
            {(project.address || project.latitude) && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <MapPin size={12} /> Location
                </h2>
                {project.address && <p className="text-sm text-slate-700 dark:text-slate-300">{project.address}</p>}
                {project.latitude && project.longitude && (
                  <>
                    <p className="font-mono text-xs text-slate-500">{project.latitude.toFixed(6)}, {project.longitude.toFixed(6)}</p>
                    <a href={`https://maps.google.com/?q=${project.latitude},${project.longitude}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      {t('proj.detail.viewOnMaps')} <ExternalLink size={10} />
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Work Orders tab ── */}
      {activeTab === 'workOrders' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          {workOrders.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <ClipboardList size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('proj.detail.noWorkOrders')}</p>
              <Link href="/dashboard/work-orders/new" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
                {t('common.createFirst')}
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">{t('wo.colNumber')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t('wo.colTitle')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">{t('wo.colPriority')}</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">{t('wo.colStatus')}</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {workOrders.map((wo) => (
                  <tr key={wo.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    onClick={() => { window.location.href = `/dashboard/work-orders/${wo.id}` }}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{wo.number}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-xs truncate">{wo.title}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${WO_PRIORITY_COLOR[wo.priority] ?? ''}`}>{wo.priority}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 capitalize">{wo.status.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-slate-400"><ChevronRight size={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Inspections tab ── */}
      {activeTab === 'inspections' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Link
              href={`/dashboard/inspections/new?project=${project.id}`}
              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={14} />{t('proj.detail.addInspection')}
            </Link>
          </div>

          {inspections.length === 0 ? (
            <div className="py-16 text-center text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
              <ClipboardCheck size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('proj.detail.noInspections')}</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t('insp.colNumber')}</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t('insp.colTitle')}</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t('insp.colStatus')}</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t('insp.colScore')}</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t('insp.colInspector')}</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {inspections.map((insp) => (
                    <tr key={insp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                      onClick={() => { window.location.href = `/dashboard/inspections/${insp.id}` }}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{insp.number}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-xs truncate">{insp.title}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${INSP_STATUS_COLOR[insp.status]}`}>
                          {t(('insp.status.' + insp.status) as TranslationKey)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {insp.score != null
                          ? <span className={`font-mono font-bold text-sm ${insp.score >= 80 ? 'text-green-600' : insp.score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{insp.score}%</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{insp.inspector_name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-400"><ChevronRight size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Gallery tab ── */}
      {activeTab === 'gallery' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          {attachments.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Camera size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('proj.detail.noPhotos')}</p>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {attachments.map((att, i) => (
                <button key={att.id} onClick={() => setLightboxIndex(i)}
                  className="relative group aspect-video overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 hover:ring-2 hover:ring-blue-500 transition-all">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/attachments/${att.id}`} alt={att.file_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                  {att.id === project.cover_image_id && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500 text-white">Cover</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}>
          <button onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i! > 0 ? i! - 1 : attachments.length - 1)) }}
            className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="max-w-5xl max-h-[90vh] px-16" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/attachments/${attachments[lightboxIndex].id}`} alt={attachments[lightboxIndex].file_name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            <p className="mt-2 text-center text-sm text-white/60">
              {attachments[lightboxIndex].file_name} · {lightboxIndex + 1} / {attachments.length}
            </p>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i! < attachments.length - 1 ? i! + 1 : 0)) }}
            className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
            <ChevronRight size={24} />
          </button>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-slate-400 shrink-0">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-300 text-right">{children}</span>
    </div>
  )
}

function Stat({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{label}</p>
      <p className={`text-base font-bold text-slate-900 dark:text-white ${valueClass}`}>{value}</p>
    </div>
  )
}
