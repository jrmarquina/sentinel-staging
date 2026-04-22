'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Database, BidType, BidStatus } from '@sentinel/db'

interface BidFormProps {
  orgId: string
  contractId: string
  userId: string
}

const BID_TYPE_OPTIONS: { value: BidType; label: string; description: string }[] = [
  { value: 'informal_quote', label: 'Informal Quote', description: 'Verbal or informal written quote from vendor' },
  { value: 'sealed_bid',     label: 'Sealed Bid',     description: 'Formal sealed bid submission process' },
]

const STATUS_OPTIONS: { value: BidStatus; label: string }[] = [
  { value: 'pending',      label: 'Pending' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'accepted',     label: 'Accepted' },
  { value: 'rejected',     label: 'Rejected' },
  { value: 'withdrawn',    label: 'Withdrawn' },
]

export function BidForm({ orgId, contractId, userId }: BidFormProps) {
  const router = useRouter()

  const [bidType, setBidType]           = useState<BidType>('informal_quote')
  const [vendorName, setVendorName]     = useState('')
  const [vendorContact, setVendorContact] = useState('')
  const [vendorEmail, setVendorEmail]   = useState('')
  const [amount, setAmount]             = useState('')
  const [status, setStatus]             = useState<BidStatus>('pending')
  const [submittedAt, setSubmittedAt]   = useState('')
  const [notes, setNotes]               = useState('')

  const [error, setError]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!vendorName.trim()) { setError('Vendor name is required.'); return }

    startTransition(async () => {
      const { error: err } = await supabase
        .from('contract_bids')
        .insert({
          org_id: orgId,
          contract_id: contractId,
          bid_type: bidType,
          vendor_name: vendorName.trim(),
          vendor_contact: vendorContact.trim() || null,
          vendor_email: vendorEmail.trim() || null,
          amount: amount ? parseFloat(amount) : null,
          status,
          submitted_at: submittedAt || null,
          notes: notes.trim() || null,
          created_by: userId,
        } satisfies Database['public']['Tables']['contract_bids']['Insert'])

      if (err) { setError(err.message); return }

      router.push(`/dashboard/contracts/${contractId}`)
      router.refresh()
    })
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1'

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-5">
      {/* Bid type */}
      <div>
        <p className={labelCls}>Bid Type</p>
        <div className="grid grid-cols-2 gap-3">
          {BID_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setBidType(opt.value)}
              className={[
                'p-3 rounded-lg border-2 text-left transition-colors',
                bidType === opt.value
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300',
              ].join(' ')}
            >
              <p className={`text-sm font-medium ${bidType === opt.value ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-white'}`}>
                {opt.label}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Vendor */}
      <div>
        <label htmlFor="vendor_name" className={labelCls}>Vendor Name <span className="text-red-500">*</span></label>
        <input id="vendor_name" type="text" value={vendorName} onChange={(e) => setVendorName(e.target.value)}
          placeholder="Contratista XYZ, Inc." className={inputCls} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="vendor_contact" className={labelCls}>Contact Name</label>
          <input id="vendor_contact" type="text" value={vendorContact}
            onChange={(e) => setVendorContact(e.target.value)} placeholder="Pedro López" className={inputCls} />
        </div>
        <div>
          <label htmlFor="vendor_email" className={labelCls}>Contact Email</label>
          <input id="vendor_email" type="email" value={vendorEmail}
            onChange={(e) => setVendorEmail(e.target.value)} placeholder="pedro@vendor.pr" className={inputCls} />
        </div>
      </div>

      {/* Amount + dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="amount" className={labelCls}>Bid Amount ($)</label>
          <input id="amount" type="number" min="0" step="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={inputCls} />
        </div>
        <div>
          <label htmlFor="submitted_at" className={labelCls}>Submission Date</label>
          <input id="submitted_at" type="date" value={submittedAt}
            onChange={(e) => setSubmittedAt(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Status */}
      <div>
        <label htmlFor="bid_status" className={labelCls}>Status</label>
        <select id="bid_status" value={status} onChange={(e) => setStatus(e.target.value as BidStatus)} className={inputCls}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="bid_notes" className={labelCls}>Notes</label>
        <textarea id="bid_notes" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Scope clarifications, conditions, remarks…" rows={3} className={inputCls} />
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={isPending}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors">
          {isPending ? 'Saving…' : 'Save Bid'}
        </button>
      </div>
    </form>
  )
}
