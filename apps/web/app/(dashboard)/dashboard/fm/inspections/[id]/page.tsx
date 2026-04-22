'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle, Download, Paperclip } from 'lucide-react'

interface FmInspectionItem {
  id: string
  key: string
  label: string
  result: string | null
  severity: string | null
  notes: string | null
}

interface FmAttachment {
  id: string
  filename: string
  file_size: number | null
  signed_url: string | null
}

interface FmInspection {
  id: string
  status: string
  score: number | null
  started_at: string | null
  completed_at: string | null
  scheduled_for: string | null
  fm_properties?: { id: string; name: string } | null
  template?: { name: string } | null
  inspector?: { full_name: string } | null
  approved_by?: { full_name: string } | null
  fm_inspection_items?: FmInspectionItem[]
  fm_attachments?: FmAttachment[]
}

const STATUS_BADGE: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  PENDING_APPROVAL: 'bg-orange-100 text-orange-700',
  DRAFT: 'bg-slate-100 text-slate-600',
}

const RESULT_BADGE: Record<string, string> = {
  PASS: 'bg-green-100 text-green-700',
  FAIL: 'bg-red-100 text-red-700',
  NA: 'bg-slate-100 text-slate-500',
}

const SEVERITY_BADGE: Record<string, string> = {
  LOW: 'bg-yellow-100 text-yellow-700',
  MEDIUM: 'bg-orange-100 text-orange-700',
  HIGH: 'bg-red-100 text-red-700',
}

function fileSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FMInspectionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [inspection, setInspection] = useState<FmInspection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/fm/inspections/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Inspection not found')
        return r.json() as Promise<FmInspection>
      })
      .then(setInspection)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleApprove() {
    setApproving(true)
    setApproveError(null)
    try {
      const res = await fetch(`/api/fm/inspections/${id}/approve`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to approve')
      }
      const updated = await res.json() as FmInspection
      setInspection(updated)
    } catch (e: unknown) {
      setApproveError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setApproving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !inspection) {
    return (
      <div className="py-16 text-center text-red-500">
        <AlertTriangle size={28} className="mx-auto mb-2" />
        <p>{error ?? 'Inspection not found'}</p>
        <button onClick={() => router.push('/dashboard/fm/inspections')} className="mt-4 text-sm text-blue-600 hover:underline">
          Back to inspections
        </button>
      </div>
    )
  }

  const items = inspection.fm_inspection_items ?? []
  const attachments = inspection.fm_attachments ?? []
  const isRunnable = inspection.status === 'DRAFT' || inspection.status === 'IN_PROGRESS'
  const isPendingApproval = inspection.status === 'PENDING_APPROVAL'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push('/dashboard/fm/inspections')}
          className="mt-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              {inspection.fm_properties?.name ?? 'Inspection'}
            </h1>
            {inspection.template?.name && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                {inspection.template.name}
              </span>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[inspection.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {inspection.status.replace(/_/g, ' ')}
            </span>
            {inspection.score != null && (
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Score: {inspection.score}%
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isPendingApproval && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {approving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Approve
            </button>
          )}
          {isRunnable && (
            <Link
              href={`/dashboard/fm/inspections/${id}/run`}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Continue Inspection
            </Link>
          )}
        </div>
      </div>

      {approveError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{approveError}</p>
      )}

      {/* Meta info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {inspection.inspector?.full_name && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Inspector</p>
            <p className="font-semibold text-slate-900 dark:text-white">{inspection.inspector.full_name}</p>
          </div>
        )}
        {inspection.started_at && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Started</p>
            <p className="font-semibold text-slate-900 dark:text-white">
              {new Date(inspection.started_at).toLocaleDateString()}
            </p>
          </div>
        )}
        {inspection.completed_at && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Completed</p>
            <p className="font-semibold text-slate-900 dark:text-white">
              {new Date(inspection.completed_at).toLocaleDateString()}
            </p>
          </div>
        )}
        {inspection.approved_by?.full_name && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Approved By</p>
            <p className="font-semibold text-slate-900 dark:text-white">{inspection.approved_by.full_name}</p>
          </div>
        )}
      </div>

      {/* Checklist */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">
            Checklist Items ({items.length})
          </h2>
        </div>
        {items.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No checklist items</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Item</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Result</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500 hidden md:table-cell">Severity</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500 hidden lg:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{item.label}</td>
                    <td className="px-5 py-3">
                      {item.result ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${RESULT_BADGE[item.result] ?? 'bg-slate-100 text-slate-600'}`}>
                          {item.result}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      {item.severity ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_BADGE[item.severity] ?? 'bg-slate-100 text-slate-600'}`}>
                          {item.severity}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-500 hidden lg:table-cell max-w-xs truncate">
                      {item.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-semibold text-slate-900 dark:text-white">Attachments</h2>
          </div>
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
                  <a href={att.signed_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 shrink-0">
                    <Download size={16} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
