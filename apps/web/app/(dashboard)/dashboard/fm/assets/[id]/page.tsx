'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertTriangle, Download, Paperclip } from 'lucide-react'

interface FmAttachment {
  id: string
  filename: string
  file_size: number | null
  mime_type: string | null
  signed_url: string | null
  created_at: string
}

interface FmInspectionSummary {
  id: string
  status: string
  score: number | null
  completed_at: string | null
  fm_users?: { full_name: string } | null
}

interface FmPropertySummary {
  id: string
  name: string
}

interface FmAsset {
  id: string
  name: string
  code: string
  category: string
  condition: string
  location: string | null
  last_inspection: string | null
  fm_properties?: FmPropertySummary | null
  fm_inspections?: FmInspectionSummary[]
  fm_attachments?: FmAttachment[]
}

const CONDITION_BADGE: Record<string, string> = {
  GOOD: 'bg-green-100 text-green-700',
  FAIR: 'bg-yellow-100 text-yellow-700',
  POOR: 'bg-red-100 text-red-700',
}

const INSP_STATUS_BADGE: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  PENDING_APPROVAL: 'bg-orange-100 text-orange-700',
  DRAFT: 'bg-slate-100 text-slate-600',
}

function fileSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FMAssetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [asset, setAsset] = useState<FmAsset | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/fm/assets/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Asset not found')
        return r.json() as Promise<FmAsset>
      })
      .then(setAsset)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !asset) {
    return (
      <div className="py-16 text-center text-red-500">
        <AlertTriangle size={28} className="mx-auto mb-2" />
        <p>{error ?? 'Asset not found'}</p>
        <button onClick={() => router.push('/dashboard/fm/assets')} className="mt-4 text-sm text-blue-600 hover:underline">
          Back to assets
        </button>
      </div>
    )
  }

  const recentInspections = (asset.fm_inspections ?? []).slice(0, 5)
  const attachments = asset.fm_attachments ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push('/dashboard/fm/assets')}
          className="mt-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{asset.name}</h1>
            <span className="text-xs font-mono uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
              {asset.code}
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${CONDITION_BADGE[asset.condition] ?? 'bg-slate-100 text-slate-600'}`}
            >
              {asset.condition}
            </span>
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Category</p>
          <p className="font-semibold text-slate-900 dark:text-white">{asset.category.replace(/_/g, ' ')}</p>
        </div>
        {asset.location && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Location</p>
            <p className="font-semibold text-slate-900 dark:text-white">{asset.location}</p>
          </div>
        )}
        {asset.fm_properties && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Property</p>
            <Link
              href={`/dashboard/fm/properties/${asset.fm_properties.id}`}
              className="font-semibold text-blue-600 hover:underline"
            >
              {asset.fm_properties.name}
            </Link>
          </div>
        )}
        {asset.last_inspection && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Last Inspection</p>
            <p className="font-semibold text-slate-900 dark:text-white">
              {new Date(asset.last_inspection).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>

      {/* Recent inspections */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">Recent Inspections</h2>
        </div>
        {recentInspections.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No inspections for this asset</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500 hidden md:table-cell">Inspector</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Score</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500 hidden md:table-cell">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentInspections.map((insp) => (
                  <tr
                    key={insp.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    onClick={() => router.push(`/dashboard/fm/inspections/${insp.id}`)}
                  >
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${INSP_STATUS_BADGE[insp.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {insp.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 hidden md:table-cell">
                      {insp.fm_users?.full_name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                      {insp.score != null ? `${insp.score}%` : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500 hidden md:table-cell">
                      {insp.completed_at ? new Date(insp.completed_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Attachments */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">Attachments</h2>
        </div>
        {attachments.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No attachments</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-5">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3"
              >
                <Paperclip size={16} className="text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{att.filename}</p>
                  <p className="text-xs text-slate-400">{fileSize(att.file_size)}</p>
                </div>
                {att.signed_url && (
                  <a
                    href={att.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 shrink-0"
                  >
                    <Download size={16} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
