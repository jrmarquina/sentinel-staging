'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  ArrowLeft, Edit2, Check, X, Minus, Eye, MapPin, ExternalLink,
  ChevronLeft, ChevronRight, Camera, Wrench, Link2, Unlink,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { InspectionForm } from '../inspection-form'
import { DeleteButton } from '@/components/ui/DeleteButton'
import { linkInspectionWorkOrder } from '../actions'
import { useT } from '@/lib/locale'
import type { Database, InspectionStatus, InspectionItemResult, InspectionItemSeverity } from '@sentinel/db'
import type { TranslationKey } from '@/lib/translations/en'

type Inspection = Database['public']['Tables']['inspections']['Row'] & {
  inspector_name?: string | null
  project_name?: string | null
  project_code?: string | null
}
type ChecklistItem = Database['public']['Tables']['inspection_checklist_items']['Row']
type Attachment = Database['public']['Tables']['attachments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Project = Pick<Database['public']['Tables']['projects']['Row'], 'id' | 'name' | 'code'>
type WorkOrder = Pick<Database['public']['Tables']['work_orders']['Row'], 'id' | 'number' | 'title'>

interface Props {
  inspection: Inspection
  checklistItems: ChecklistItem[]
  attachments: Attachment[]
  members: Profile[]
  projects: Project[]
  workOrders: WorkOrder[]
  orgId: string
  userId: string
  isAdmin: boolean
}

const STATUS_COLOR: Record<InspectionStatus, string> = {
  draft:       'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  completed:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  approved:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

const SEVERITY_LABEL: Record<InspectionItemSeverity, string> = {
  critical:      'Critical',
  major:         'Major',
  minor:         'Minor',
  informational: 'Info',
}

const SEVERITY_COLOR: Record<InspectionItemSeverity, string> = {
  critical:      'text-red-600 dark:text-red-400',
  major:         'text-orange-600 dark:text-orange-400',
  minor:         'text-slate-500',
  informational: 'text-blue-500',
}

function ScoreRing({ score }: { score: number | null }) {
  if (score == null) return (
    <div className="text-center">
      <p className="text-4xl font-black text-slate-300 dark:text-slate-600">—</p>
      <p className="text-xs text-slate-400 mt-1">Not scored</p>
    </div>
  )
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'
  const r = 36, circumference = 2 * Math.PI * r
  const dash = (score / 100) * circumference
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="88" height="88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-slate-200 dark:text-slate-700" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
      </svg>
      <p className="text-3xl font-black -mt-14" style={{ color }}>{score}%</p>
      <p className="text-xs text-slate-400 mt-6">Final Score</p>
    </div>
  )
}

export function InspectionDetail({ inspection, checklistItems, attachments, members, projects, workOrders, orgId, userId, isAdmin }: Props) {
  const t = useT()
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [items, setItems] = useState<ChecklistItem[]>(checklistItems)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState<string | null>(null)  // item id being saved

  // Work order linking state
  const [linkedWoId, setLinkedWoId] = useState<string | null>(inspection.work_order_id ?? null)
  const [showWoPicker, setShowWoPicker] = useState(false)
  const [selectedWoId, setSelectedWoId] = useState('')
  const [woError, setWoError] = useState<string | null>(null)
  const [isWoPending, startWoTransition] = useTransition()

  const linkedWo = linkedWoId ? workOrders.find((w) => w.id === linkedWoId) ?? null : null

  function handleLinkWo() {
    if (!selectedWoId) return
    setWoError(null)
    startWoTransition(async () => {
      const result = await linkInspectionWorkOrder(inspection.id, selectedWoId)
      if (result.error) { setWoError(result.error); return }
      setLinkedWoId(selectedWoId)
      setShowWoPicker(false)
      setSelectedWoId('')
    })
  }

  function handleUnlinkWo() {
    setWoError(null)
    startWoTransition(async () => {
      const result = await linkInspectionWorkOrder(inspection.id, null)
      if (result.error) { setWoError(result.error); return }
      setLinkedWoId(null)
      setShowWoPicker(false)
    })
  }

  if (editing) {
    return (
      <InspectionForm
        orgId={orgId}
        userId={userId}
        members={members}
        projects={projects}
        workOrders={workOrders}
        initial={inspection}
        initialChecklist={checklistItems}
      />
    )
  }

  const passFail = items.filter((i) => i.result === 'pass' || i.result === 'fail')
  const passCount = items.filter((i) => i.result === 'pass').length
  const failCount = items.filter((i) => i.result === 'fail').length
  const totalScored = passFail.length

  // Group checklist by category
  const categories = Array.from(new Set(items.map((i) => i.category)))

  async function setResult(itemId: string, result: InspectionItemResult | null) {
    setSaving(itemId)
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, result } : i))

    await supabase
      .from('inspection_checklist_items')
      .update({ result } as Database['public']['Tables']['inspection_checklist_items']['Update'])
      .eq('id', itemId)

    // Recalculate score — call DB function
    // (Client-side approximation while we wait for the RPC)
    const newItems = items.map((i) => i.id === itemId ? { ...i, result } : i)
    const newPassed = newItems.filter((i) => i.result === 'pass').length
    const newScored = newItems.filter((i) => i.result === 'pass' || i.result === 'fail').length
    const newScore = newScored > 0 ? Math.round((newPassed / newScored) * 100) : null

    await supabase
      .from('inspections')
      .update({ score: newScore } as Database['public']['Tables']['inspections']['Update'])
      .eq('id', inspection.id)

    setSaving(null)
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard/inspections" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{inspection.number}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[inspection.status]}`}>
                {t(('insp.status.' + inspection.status) as TranslationKey)}
              </span>
              {inspection.project_code && (
                <Link href={`/dashboard/projects/${inspection.project_id}`}
                  className="font-mono text-xs font-black text-blue-600 dark:text-blue-400 hover:underline">
                  {inspection.project_code}
                </Link>
              )}
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white mt-1 truncate">{inspection.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Edit2 size={14} />{t('common.edit')}
          </button>
          {isAdmin && (
            <DeleteButton
              id={inspection.id}
              table="inspections"
              label={`Inspection ${inspection.number}`}
              redirectTo="/dashboard/inspections"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: score + info */}
        <div className="space-y-4">
          {/* Score card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col items-center gap-3">
            <ScoreRing score={inspection.score} />
            <div className="w-full grid grid-cols-3 gap-2 text-center border-t border-slate-100 dark:border-slate-800 pt-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Items</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{items.length}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Passed</p>
                <p className="text-xl font-black text-green-600 dark:text-green-400">{passCount}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Failed</p>
                <p className="text-xl font-black text-red-600 dark:text-red-400">{failCount}</p>
              </div>
            </div>

            {totalScored > 0 && (
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${(passCount / items.length) * 100}%` }} />
                <div className="h-full bg-red-500 transition-all" style={{ width: `${(failCount / items.length) * 100}%` }} />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Details</h2>
            <InfoRow label={t('insp.detail.inspector')}>{inspection.inspector_name ?? '—'}</InfoRow>
            {inspection.project_name && (
              <InfoRow label={t('insp.detail.project')}>
                <Link href={`/dashboard/projects/${inspection.project_id}`} className="text-blue-600 hover:underline">
                  {inspection.project_name}
                </Link>
              </InfoRow>
            )}
            {inspection.scheduled_at && (
              <InfoRow label={t('insp.detail.scheduled')}>
                {format(new Date(inspection.scheduled_at), 'MMM d, yyyy')}
              </InfoRow>
            )}
            {inspection.completed_at && (
              <InfoRow label={t('insp.detail.completed')}>
                {format(new Date(inspection.completed_at), 'MMM d, yyyy')}
              </InfoRow>
            )}
          </div>

          {/* Work Order */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Wrench size={12} />
              Work Order
            </h2>

            {linkedWo ? (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-slate-500">{linkedWo.number}</span>
                    <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 mt-0.5">{linkedWo.title}</p>
                  </div>
                  <button
                    onClick={handleUnlinkWo}
                    disabled={isWoPending}
                    title="Unlink work order"
                    className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 disabled:opacity-40 transition-colors"
                  >
                    <Unlink size={13} />
                  </button>
                </div>
                <Link
                  href={`/dashboard/work-orders/${linkedWo.id}`}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  View work order <ExternalLink size={10} />
                </Link>
              </div>
            ) : showWoPicker ? (
              <div className="space-y-2">
                <select
                  value={selectedWoId}
                  onChange={(e) => setSelectedWoId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a work order…</option>
                  {workOrders.map((wo) => (
                    <option key={wo.id} value={wo.id}>{wo.number} — {wo.title}</option>
                  ))}
                </select>
                {woError && <p className="text-xs text-red-600 dark:text-red-400">{woError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleLinkWo}
                    disabled={!selectedWoId || isWoPending}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    <Link2 size={11} />
                    {isWoPending ? 'Linking…' : 'Link'}
                  </button>
                  <button
                    onClick={() => { setShowWoPicker(false); setSelectedWoId(''); setWoError(null) }}
                    className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-400">No work order linked.</p>
                <button
                  onClick={() => setShowWoPicker(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                >
                  <Link2 size={11} />
                  Link a work order
                </button>
              </div>
            )}
          </div>

          {/* Location */}
          {(inspection.address || inspection.latitude) && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <MapPin size={12} />Location
              </h2>
              {inspection.address && <p className="text-sm text-slate-700 dark:text-slate-300">{inspection.address}</p>}
              {inspection.latitude && inspection.longitude && (
                <a href={`https://maps.google.com/?q=${inspection.latitude},${inspection.longitude}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  View on Google Maps <ExternalLink size={10} />
                </a>
              )}
            </div>
          )}

          {/* Photos */}
          {attachments.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Camera size={12} />{t('insp.detail.sectionPhotos')} ({attachments.length})
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {attachments.map((att, i) => (
                  <button key={att.id} onClick={() => setLightboxIndex(i)}
                    className="relative group aspect-video overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 hover:ring-2 hover:ring-blue-500 transition-all">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/attachments/${att.id}`} alt={att.file_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {inspection.notes && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('insp.detail.sectionNotes')}</h2>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{inspection.notes}</p>
            </div>
          )}
        </div>

        {/* Right: Checklist runner */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('insp.detail.sectionChecklist')}
            <span className="ml-2 text-xs font-normal text-slate-400">{totalScored}/{items.length} {t('insp.detail.totalItems')}</span>
          </h2>

          {categories.map((cat) => (
            <div key={cat} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{cat}</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.filter((i) => i.category === cat).map((item) => (
                  <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                    {/* Item number */}
                    <span className="text-xs font-mono text-slate-300 dark:text-slate-600 w-5 shrink-0 mt-0.5">{item.item_number}</span>

                    {/* Description */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 dark:text-slate-200">{item.description}</p>
                      {item.notes && (
                        <p className="text-xs text-slate-400 mt-0.5 italic">{item.notes}</p>
                      )}
                    </div>

                    {/* Severity */}
                    <span className={`text-[10px] font-semibold shrink-0 ${SEVERITY_COLOR[item.severity]}`}>
                      {SEVERITY_LABEL[item.severity]}
                    </span>

                    {/* Result buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <ResultButton
                        icon={<Check size={13} />}
                        active={item.result === 'pass'}
                        activeClass="bg-green-500 text-white"
                        title="Pass"
                        disabled={saving === item.id}
                        onClick={() => setResult(item.id, item.result === 'pass' ? null : 'pass')}
                      />
                      <ResultButton
                        icon={<X size={13} />}
                        active={item.result === 'fail'}
                        activeClass="bg-red-500 text-white"
                        title="Fail"
                        disabled={saving === item.id}
                        onClick={() => setResult(item.id, item.result === 'fail' ? null : 'fail')}
                      />
                      <ResultButton
                        icon={<Minus size={13} />}
                        active={item.result === 'na'}
                        activeClass="bg-slate-500 text-white"
                        title="N/A"
                        disabled={saving === item.id}
                        onClick={() => setResult(item.id, item.result === 'na' ? null : 'na')}
                      />
                      <ResultButton
                        icon={<Eye size={13} />}
                        active={item.result === 'observation'}
                        activeClass="bg-blue-500 text-white"
                        title="Observation"
                        disabled={saving === item.id}
                        onClick={() => setResult(item.id, item.result === 'observation' ? null : 'observation')}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div className="py-16 text-center text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
              <p className="text-sm">No checklist items. Edit this inspection to add them.</p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}>
          <button onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i! > 0 ? i! - 1 : attachments.length - 1)) }}
            className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
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
            className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
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

function ResultButton({
  icon, active, activeClass, title, disabled, onClick,
}: {
  icon: React.ReactNode
  active: boolean
  activeClass: string
  title: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'w-7 h-7 rounded flex items-center justify-center transition-colors',
        active ? activeClass : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700',
        disabled ? 'opacity-50 cursor-wait' : '',
      ].join(' ')}
    >
      {icon}
    </button>
  )
}
