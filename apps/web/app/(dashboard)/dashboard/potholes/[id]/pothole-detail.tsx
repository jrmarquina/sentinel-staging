'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  ArrowLeft, Edit2, MapPin, RefreshCw, AlertTriangle,
  Camera, ChevronLeft, ChevronRight, ExternalLink, Wrench,
} from 'lucide-react'
import { createWorkOrderFromPothole } from '../actions'
import { PotholeStatusBadge } from '@/components/potholes/PotholeStatusBadge'
import { PCIBadge } from '@/components/potholes/PCIBadge'
import { PotholeForm } from '../pothole-form'
import { DeleteButton } from '@/components/ui/DeleteButton'
import { useT } from '@/lib/locale'
import type { Database } from '@sentinel/db'

type PotholeReport = Database['public']['Tables']['pothole_reports']['Row'] & {
  assignee_name?: string | null
  reporter_name?: string | null
}
type Attachment = Database['public']['Tables']['attachments']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

interface Props {
  report: PotholeReport
  attachments: Attachment[]
  members: Profile[]
  orgId: string
  userId: string
  isAdmin: boolean
  userRole: string
  linkedWorkOrder: { id: string; number: string; title: string; status: string } | null
}

const DEFECT_LABELS: Record<string, string> = {
  pothole:               'Pothole',
  alligator_crack:       'Alligator Crack',
  linear_crack:          'Linear Crack',
  edge_failure:          'Edge Failure',
  subsidence:            'Subsidence',
  rutting:               'Rutting',
  surface_deterioration: 'Surface Deterioration',
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-600 dark:text-red-400',
  high:     'text-orange-600 dark:text-orange-400',
  medium:   'text-yellow-600 dark:text-yellow-400',
  low:      'text-slate-500 dark:text-slate-400',
}

export function PotholeDetail({ report, attachments, members, orgId, userId, isAdmin, userRole, linkedWorkOrder }: Props) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [woError, setWoError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const canCreateWo = ['admin', 'supervisor', 'inspector'].includes(userRole)

  function handleCreateWo() {
    setWoError(null)
    startTransition(async () => {
      const result = await createWorkOrderFromPothole(report.id)
      if (result?.error) setWoError(result.error)
    })
  }

  if (editing) {
    return (
      <PotholeForm
        orgId={orgId}
        userId={userId}
        members={members}
        initial={report}
      />
    )
  }

  const beforePhoto = report.before_photo_id
    ? attachments.find((a) => a.id === report.before_photo_id)
    : null
  const afterPhoto = report.after_photo_id
    ? attachments.find((a) => a.id === report.after_photo_id)
    : null

  // Photos not pinned as before/after — all others
  const pinnedIds = new Set([report.before_photo_id, report.after_photo_id].filter(Boolean))
  const otherPhotos = attachments.filter((a) => !pinnedIds.has(a.id))

  const allPhotos = attachments

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/potholes"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                {report.number}
              </span>
              <PotholeStatusBadge status={report.status} />
              {report.is_recurring && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                  <RefreshCw size={10} />
                  {t('ph.recurringBadge')} ×{report.recurrence_count}
                </span>
              )}
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white mt-1">{report.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Edit2 size={14} />
            {t('common.edit')}
          </button>
          {isAdmin && (
            <DeleteButton
              id={report.id}
              table="pothole_reports"
              label={`Report ${report.number}`}
              redirectTo="/dashboard/potholes"
            />
          )}
        </div>
      </div>

      {/* Recurring alert banner */}
      {report.is_recurring && (
        <div className="flex items-start gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg text-sm text-orange-800 dark:text-orange-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>{t('ph.detail.recurringAlert')}</strong>{' '}
            {report.recurrence_count}{' '}
            {t('ph.detail.recurringTimes')}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: details */}
        <div className="lg:col-span-1 space-y-4">
          {/* Core info card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('ph.detail.sectionInfo')}</h2>

            <InfoRow label={t('ph.detail.defectType')}>
              {DEFECT_LABELS[report.defect_type] ?? report.defect_type}
            </InfoRow>

            <InfoRow label="Severity">
              <span className={`font-medium capitalize ${SEVERITY_COLOR[report.severity]}`}>
                {report.severity}
              </span>
            </InfoRow>

            <InfoRow label={t('ph.detail.pciScore')}>
              <PCIBadge score={report.pci_score} />
            </InfoRow>

            {report.repair_cost > 0 && (
              <InfoRow label={t('ph.detail.repairCost')}>
                ${report.repair_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </InfoRow>
            )}

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
              <InfoRow label={t('ph.detail.assignedTo')}>
                {report.assignee_name ?? <span className="text-slate-300">—</span>}
              </InfoRow>
              <InfoRow label={t('ph.detail.reportedBy')}>
                {report.reporter_name ?? <span className="text-slate-300">—</span>}
              </InfoRow>
              <InfoRow label={t('ph.detail.reported')}>
                {format(new Date(report.created_at), 'MMM d, yyyy')}
              </InfoRow>
              {report.repaired_at && (
                <InfoRow label={t('ph.detail.repaired')}>
                  {format(new Date(report.repaired_at), 'MMM d, yyyy')}
                </InfoRow>
              )}
            </div>
          </div>

          {/* Work Order card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Wrench size={12} />
              Work Order
            </h2>

            {linkedWorkOrder ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                    Linked
                  </span>
                  <span className="font-mono text-xs text-slate-500">{linkedWorkOrder.number}</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">{linkedWorkOrder.title}</p>
                <Link
                  href={`/dashboard/work-orders/${linkedWorkOrder.id}`}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  View work order <ExternalLink size={10} />
                </Link>
              </div>
            ) : canCreateWo ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">No work order linked yet.</p>
                {woError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{woError}</p>
                )}
                <button
                  onClick={handleCreateWo}
                  disabled={isPending}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  <Wrench size={14} />
                  {isPending ? 'Creating…' : 'Create Work Order'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400">No work order linked.</p>
            )}
          </div>

          {/* Location card */}
          {(report.address || report.latitude) && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <MapPin size={12} />
                {t('ph.detail.address')}
              </h2>

              {report.address && (
                <p className="text-sm text-slate-700 dark:text-slate-300">{report.address}</p>
              )}

              {report.latitude && report.longitude && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-400">{t('ph.detail.coordinates')}</p>
                  <p className="font-mono text-xs text-slate-600 dark:text-slate-400">
                    {report.latitude.toFixed(6)}, {report.longitude.toFixed(6)}
                  </p>
                  <a
                    href={`https://maps.google.com/?q=${report.latitude},${report.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    Open in Google Maps <ExternalLink size={10} />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {report.description && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('ph.detail.sectionNotes')}</h2>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {report.description}
              </p>
            </div>
          )}
        </div>

        {/* Right: photos */}
        <div className="lg:col-span-2 space-y-4">
          {/* Before / After comparison */}
          {(beforePhoto || afterPhoto) && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('ph.detail.sectionPhotos')}</h2>
                {beforePhoto && afterPhoto && (
                  <button
                    onClick={() => setCompareMode((v) => !v)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {compareMode ? 'Grid view' : 'Compare side-by-side'}
                  </button>
                )}
              </div>

              {compareMode && beforePhoto && afterPhoto ? (
                /* Side-by-side slider comparison */
                <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-700">
                  <PhotoPanel label={t('ph.detail.beforePhoto')} attachment={beforePhoto} labelColor="bg-red-500" />
                  <PhotoPanel label={t('ph.detail.afterPhoto')} attachment={afterPhoto} labelColor="bg-green-500" />
                </div>
              ) : (
                <div className={`grid ${beforePhoto && afterPhoto ? 'grid-cols-2' : 'grid-cols-1'} gap-0 divide-x divide-slate-100 dark:divide-slate-800`}>
                  {beforePhoto && (
                    <PhotoPanel label={t('ph.detail.beforePhoto')} attachment={beforePhoto} labelColor="bg-red-500" />
                  )}
                  {afterPhoto && (
                    <PhotoPanel label={t('ph.detail.afterPhoto')} attachment={afterPhoto} labelColor="bg-green-500" />
                  )}
                </div>
              )}
            </div>
          )}

          {/* All photos grid */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Camera size={12} />
                {t('ph.detail.sectionPhotos')} ({allPhotos.length})
              </h2>
            </div>

            {allPhotos.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Camera size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t('ph.detail.noPhotos')}</p>
              </div>
            ) : (
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {allPhotos.map((att, i) => (
                  <button
                    key={att.id}
                    onClick={() => setLightboxIndex(i)}
                    className="relative group aspect-video overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 hover:ring-2 hover:ring-blue-500 transition-all"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/attachments/${att.id}`}
                      alt={att.file_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    {att.id === report.before_photo_id && (
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white">
                        {t('ph.detail.beforePhoto')}
                      </span>
                    )}
                    {att.id === report.after_photo_id && (
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500 text-white">
                        {t('ph.detail.afterPhoto')}
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i! > 0 ? i! - 1 : allPhotos.length - 1)) }}
            className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="max-w-5xl max-h-[90vh] px-16" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/attachments/${allPhotos[lightboxIndex].id}`}
              alt={allPhotos[lightboxIndex].file_name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
            <p className="mt-2 text-center text-sm text-white/60">
              {allPhotos[lightboxIndex].file_name} · {lightboxIndex + 1} / {allPhotos.length}
            </p>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i! < allPhotos.length - 1 ? i! + 1 : 0)) }}
            className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-slate-400 shrink-0 mt-0.5">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-300 text-right">{children}</span>
    </div>
  )
}

function PhotoPanel({
  label,
  attachment,
  labelColor,
}: {
  label: string
  attachment: Database['public']['Tables']['attachments']['Row']
  labelColor: string
}) {
  return (
    <div className="relative">
      <span className={`absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-[10px] font-bold text-white ${labelColor}`}>
        {label}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/attachments/${attachment.id}`}
        alt={attachment.file_name}
        className="w-full aspect-video object-cover"
      />
    </div>
  )
}
