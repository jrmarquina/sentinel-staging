'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { UPLOAD_LIMITS } from '@sentinel/shared'
import type { Database, ContractStatus } from '@sentinel/db'

type ContractRow = Database['public']['Tables']['contracts']['Row']

interface ContractFormProps {
  orgId: string
  userId: string
  initial?: Partial<ContractRow>
}

const STATUS_OPTIONS: { value: ContractStatus; label: string }[] = [
  { value: 'draft',            label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'active',           label: 'Active' },
  { value: 'completed',        label: 'Completed' },
  { value: 'terminated',       label: 'Terminated' },
  { value: 'expired',          label: 'Expired' },
]

export function ContractForm({ orgId, userId, initial }: ContractFormProps) {
  const router = useRouter()
  const isEdit = !!initial?.id

  const [title, setTitle]                       = useState(initial?.title ?? '')
  const [description, setDescription]           = useState(initial?.description ?? '')
  const [status, setStatus]                     = useState<ContractStatus>(initial?.status ?? 'draft')
  const [vendorName, setVendorName]             = useState(initial?.vendor_name ?? '')
  const [vendorContact, setVendorContact]       = useState(initial?.vendor_contact ?? '')
  const [vendorEmail, setVendorEmail]           = useState(initial?.vendor_email ?? '')
  const [contractValue, setContractValue]       = useState(initial?.contract_value != null ? String(initial.contract_value) : '')
  const [startDate, setStartDate]               = useState(initial?.start_date ?? '')
  const [endDate, setEndDate]                   = useState(initial?.end_date ?? '')
  const [signedAt, setSignedAt]                 = useState(initial?.signed_at ? initial.signed_at.slice(0, 10) : '')
  const [terminatedAt, setTerminatedAt]         = useState(initial?.terminated_at ? initial.terminated_at.slice(0, 10) : '')
  const [terminationReason, setTerminationReason] = useState(initial?.termination_reason ?? '')
  const [notes, setNotes]                       = useState(initial?.notes ?? '')

  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [error, setError]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) { setError('Title is required.'); return }

    startTransition(async () => {
      const payload = {
        org_id: orgId,
        title: title.trim(),
        description: description.trim() || null,
        status,
        vendor_name: vendorName.trim() || null,
        vendor_contact: vendorContact.trim() || null,
        vendor_email: vendorEmail.trim() || null,
        contract_value: contractValue ? parseFloat(contractValue) : null,
        start_date: startDate || null,
        end_date: endDate || null,
        signed_at: signedAt ? new Date(signedAt).toISOString() : null,
        terminated_at: terminatedAt ? new Date(terminatedAt).toISOString() : null,
        termination_reason: terminationReason.trim() || null,
        notes: notes.trim() || null,
      }

      let contractId: string
      if (isEdit && initial?.id) {
        const { error: err } = await supabase
          .from('contracts')
          .update(payload as Database['public']['Tables']['contracts']['Update'])
          .eq('id', initial.id)
        if (err) { setError(err.message); return }
        contractId = initial.id
      } else {
        const { data: inserted, error: err } = await supabase
          .from('contracts')
          .insert({ ...payload, created_by: userId } as Database['public']['Tables']['contracts']['Insert'])
          .select('id')
          .single()
        if (err || !inserted) { setError(err?.message ?? 'Insert failed'); return }
        contractId = (inserted as { id: string }).id
      }

      // Upload pending files
      for (const file of pendingFiles) {
        const path = `${orgId}/contracts/${contractId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { error: upErr } = await supabase.storage
          .from('attachments')
          .upload(path, file, { upsert: false })
        if (upErr) { setError(`File upload failed: ${upErr.message}`); return }

        await supabase.from('attachments').insert({
          org_id: orgId,
          storage_path: path,
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
          related_id: contractId,
          related_table: 'contracts',
          uploaded_by: userId,
        })
      }

      router.push(`/dashboard/contracts/${contractId}`)
      router.refresh()
    })
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1'

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
      {/* Basic info */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Contract Information</h2>

        <div>
          <label htmlFor="title" className={labelCls}>Title <span className="text-red-500">*</span></label>
          <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Road Resurfacing — Calle San Jorge" className={inputCls} required />
        </div>

        <div>
          <label htmlFor="description" className={labelCls}>Description</label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Scope of work, location, deliverables…" rows={3} className={inputCls} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="status" className={labelCls}>Status</label>
            <select id="status" value={status} onChange={(e) => setStatus(e.target.value as ContractStatus)} className={inputCls}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="contract_value" className={labelCls}>Contract Value ($)</label>
            <input id="contract_value" type="number" min="0" step="0.01" value={contractValue}
              onChange={(e) => setContractValue(e.target.value)} placeholder="0.00" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Dates</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label htmlFor="start_date" className={labelCls}>Start Date</label>
            <input id="start_date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="end_date" className={labelCls}>End Date</label>
            <input id="end_date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="signed_at" className={labelCls}>Date Signed</label>
            <input id="signed_at" type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} className={inputCls} />
          </div>
          {(status === 'terminated' || terminatedAt) && (
            <div>
              <label htmlFor="terminated_at" className={labelCls}>Termination Date</label>
              <input id="terminated_at" type="date" value={terminatedAt}
                onChange={(e) => setTerminatedAt(e.target.value)} className={inputCls} />
            </div>
          )}
        </div>

        {(status === 'terminated' || terminationReason) && (
          <div>
            <label htmlFor="termination_reason" className={labelCls}>Termination Reason</label>
            <textarea id="termination_reason" value={terminationReason}
              onChange={(e) => setTerminationReason(e.target.value)}
              placeholder="Reason for termination…" rows={2} className={inputCls} />
          </div>
        )}
      </div>

      {/* Vendor */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Vendor</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="vendor_name" className={labelCls}>Company Name</label>
            <input id="vendor_name" type="text" value={vendorName} onChange={(e) => setVendorName(e.target.value)}
              placeholder="Contratista ABC, LLC" className={inputCls} />
          </div>
          <div>
            <label htmlFor="vendor_contact" className={labelCls}>Contact Name</label>
            <input id="vendor_contact" type="text" value={vendorContact}
              onChange={(e) => setVendorContact(e.target.value)} placeholder="Juan García" className={inputCls} />
          </div>
          <div>
            <label htmlFor="vendor_email" className={labelCls}>Contact Email</label>
            <input id="vendor_email" type="email" value={vendorEmail}
              onChange={(e) => setVendorEmail(e.target.value)} placeholder="juan@contractor.pr" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Notes</h2>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional notes, special conditions, approvals…" rows={4} className={inputCls} />
      </div>

      {/* Attachments */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Attachments</h2>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).filter((f) => f.size <= UPLOAD_LIMITS.DOCUMENT_MAX_BYTES)
            setPendingFiles((prev) => [...prev, ...files])
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
        />
        {pendingFiles.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {pendingFiles.map((f, i) => (
              <li key={i} className="flex items-center gap-2 py-2">
                <Paperclip size={14} className="text-slate-400 flex-shrink-0" />
                <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">{f.name}</span>
                <button type="button" onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                  className="text-slate-400 hover:text-red-500 transition-colors">
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors text-slate-500"
        >
          <Paperclip size={13} />
          Attach files (PDF, images, docs — max 25 MB each)
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pb-6">
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={isPending}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors">
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Contract'}
        </button>
      </div>
    </form>
  )
}
