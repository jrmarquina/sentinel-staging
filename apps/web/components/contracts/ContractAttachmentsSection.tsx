'use client'

import { useRef, useState, useTransition } from 'react'
import { FileText, FileImage, Upload, X, Loader2, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { UPLOAD_LIMITS } from '@sentinel/shared'
import type { Database } from '@sentinel/db'

type Attachment = Database['public']['Tables']['attachments']['Row']

interface Props {
  contractId: string
  orgId: string
  userId: string
  initialAttachments: Attachment[]
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith('image/')) return <FileImage size={18} className="text-blue-500 flex-shrink-0" />
  return <FileText size={18} className="text-slate-400 flex-shrink-0" />
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ContractAttachmentsSection({ contractId, orgId, userId, initialAttachments }: Props) {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    setUploading(true)

    try {
      for (const file of Array.from(files)) {
        if (file.size > UPLOAD_LIMITS.DOCUMENT_MAX_BYTES) {
          setError(`${file.name} exceeds 25 MB limit`)
          continue
        }

        const path = `${orgId}/contracts/${contractId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

        const { error: upErr } = await supabase.storage
          .from('attachments')
          .upload(path, file, { upsert: false })

        if (upErr) {
          setError(`Upload failed: ${upErr.message}`)
          continue
        }

        const { data: inserted } = await supabase
          .from('attachments')
          .insert({
            org_id: orgId,
            storage_path: path,
            file_name: file.name,
            file_type: file.type || `application/octet-stream`,
            file_size: file.size,
            related_id: contractId,
            related_table: 'contracts',
            uploaded_by: userId,
          })
          .select('*')
          .single()

        if (inserted) {
          setAttachments((prev) => [inserted as Attachment, ...prev])
        }
      }
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove(att: Attachment) {
    startTransition(async () => {
      await supabase.from('attachments').update({ deleted_at: new Date().toISOString() }).eq('id', att.id)
      setAttachments((prev) => prev.filter((a) => a.id !== att.id))
    })
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Attachments
          {attachments.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-400">({attachments.length})</span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? 'Uploading…' : 'Upload file'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {attachments.length === 0 ? (
        <div className="py-10 text-center">
          <FileText size={24} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-400">No attachments yet</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Upload a file
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {attachments.map((att) => (
            <li key={att.id} className="flex items-center gap-3 py-2.5 group">
              <FileIcon type={att.file_type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{att.file_name}</p>
                <p className="text-xs text-slate-400">{fmtSize(att.file_size)}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={`/api/attachments/${att.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  title="Download"
                >
                  <Download size={14} />
                </a>
                <button
                  type="button"
                  onClick={() => handleRemove(att)}
                  className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
