import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, Edit2, DollarSign, Calendar, User, Building2, Mail } from 'lucide-react'
import { ContractStatusBadge } from '@/components/contracts/ContractStatusBadge'
import { BidStatusBadge } from '@/components/contracts/BidStatusBadge'
import { DeleteButton } from '@/components/ui/DeleteButton'
import { ContractAttachmentsSection } from '@/components/contracts/ContractAttachmentsSection'
import { ArchiveButton } from '@/components/contracts/ArchiveButton'
import type { Database } from '@sentinel/db'

type ContractRow = Database['public']['Tables']['contracts']['Row']
type BidRow = Database['public']['Tables']['contract_bids']['Row']

const BID_TYPE_LABELS = { informal_quote: 'Informal Quote', sealed_bid: 'Sealed Bid' }

export async function generateMetadata() {
  return { title: 'Contract — Sentinel' }
}

export default async function ContractDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: roleData } = await supabase
    .from('user_roles').select('role, org_id').eq('user_id', user.id).single()
  const isAdmin = roleData?.role === 'admin'
  const orgId = (roleData as { org_id?: string } | null)?.org_id ?? ''

  if (!orgId) redirect('/dashboard')

  // Use admin client to bypass RLS — org_id check enforces isolation
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('contracts')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .single()

  if (error || !data) notFound()

  const contractRaw = data as ContractRow
  let creatorName: string | null = null
  if (contractRaw.created_by) {
    const { data: profileData } = await admin
      .from('profiles').select('full_name').eq('id', contractRaw.created_by).single()
    creatorName = profileData?.full_name ?? null
  }
  const contract = { ...contractRaw, creator: creatorName ? { full_name: creatorName } : null } as ContractRow & { creator: { full_name: string | null } | null }

  const [{ data: bidsData }, { data: attachmentsData }] = await Promise.all([
    admin
      .from('contract_bids')
      .select('*')
      .eq('contract_id', params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    admin
      .from('attachments')
      .select('*')
      .eq('related_id', params.id)
      .eq('related_table', 'contracts')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const bids = (bidsData as BidRow[] | null) ?? []
  const acceptedBid = bids.find((b) => b.status === 'accepted')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/dashboard/contracts"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Contracts
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/contracts/${params.id}/edit`}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Edit2 size={14} />
            Edit
          </Link>
          {contract.status !== 'expired' && (
            <ArchiveButton contractId={params.id} contractNumber={contract.number} />
          )}
          {isAdmin && (
            <DeleteButton
              id={params.id}
              table="contracts"
              label={`Contract ${contract.number}`}
              redirectTo="/dashboard/contracts"
            />
          )}
        </div>
      </div>

      {/* Title card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-mono text-slate-400">{contract.number}</p>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{contract.title}</h1>
          </div>
          <ContractStatusBadge status={contract.status} />
        </div>
        {contract.description && (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
            {contract.description}
          </p>
        )}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contract details */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Contract Details</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <DollarSign size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-slate-400 text-xs">Contract Value</dt>
                <dd className="text-slate-900 dark:text-white mt-0.5 font-semibold">
                  {contract.contract_value != null
                    ? `$${contract.contract_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                    : <span className="font-normal text-slate-400">Not set</span>}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-slate-400 text-xs">Period</dt>
                <dd className="text-slate-900 dark:text-white mt-0.5">
                  {contract.start_date && contract.end_date
                    ? `${format(new Date(contract.start_date), 'MMM d, yyyy')} – ${format(new Date(contract.end_date), 'MMM d, yyyy')}`
                    : contract.start_date
                    ? `Starts ${format(new Date(contract.start_date), 'MMM d, yyyy')}`
                    : contract.end_date
                    ? `Ends ${format(new Date(contract.end_date), 'MMM d, yyyy')}`
                    : <span className="text-slate-400">Not set</span>}
                </dd>
              </div>
            </div>

            {contract.signed_at && (
              <div className="flex items-start gap-3">
                <Calendar size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-slate-400 text-xs">Signed</dt>
                  <dd className="text-slate-900 dark:text-white mt-0.5">
                    {format(new Date(contract.signed_at), 'MMM d, yyyy')}
                  </dd>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <User size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-slate-400 text-xs">Created By</dt>
                <dd className="text-slate-900 dark:text-white mt-0.5">
                  {contract.creator?.full_name ?? '—'}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <dt className="text-slate-400 text-xs">Created</dt>
                <dd className="text-slate-900 dark:text-white mt-0.5">
                  {format(new Date(contract.created_at), 'MMM d, yyyy')}
                </dd>
              </div>
            </div>
          </dl>

          {contract.terminated_at && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-xs font-medium text-red-700 dark:text-red-400">
                Terminated {format(new Date(contract.terminated_at), 'MMM d, yyyy')}
              </p>
              {contract.termination_reason && (
                <p className="text-xs text-red-600 dark:text-red-300 mt-1">{contract.termination_reason}</p>
              )}
            </div>
          )}
        </div>

        {/* Vendor */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Vendor</h2>
          {!contract.vendor_name ? (
            <p className="text-sm text-slate-400">No vendor assigned yet.</p>
          ) : (
            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <Building2 size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-slate-400 text-xs">Company</dt>
                  <dd className="text-slate-900 dark:text-white mt-0.5 font-medium">{contract.vendor_name}</dd>
                </div>
              </div>
              {contract.vendor_contact && (
                <div className="flex items-start gap-3">
                  <User size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <dt className="text-slate-400 text-xs">Contact</dt>
                    <dd className="text-slate-900 dark:text-white mt-0.5">{contract.vendor_contact}</dd>
                  </div>
                </div>
              )}
              {contract.vendor_email && (
                <div className="flex items-start gap-3">
                  <Mail size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <dt className="text-slate-400 text-xs">Email</dt>
                    <dd className="mt-0.5">
                      <a href={`mailto:${contract.vendor_email}`} className="text-blue-600 hover:underline">
                        {contract.vendor_email}
                      </a>
                    </dd>
                  </div>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>

      {/* Notes */}
      {contract.notes && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Notes</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{contract.notes}</p>
        </div>
      )}

      {/* Attachments */}
      <ContractAttachmentsSection
        contractId={params.id}
        orgId={orgId}
        userId={user.id}
        initialAttachments={(attachmentsData as Database['public']['Tables']['attachments']['Row'][] | null) ?? []}
      />

      {/* Bids */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Bids & Quotes
            {bids.length > 0 && <span className="ml-2 text-xs font-normal text-slate-400">({bids.length})</span>}
          </h2>
          <Link
            href={`/dashboard/contracts/${params.id}/bids/new`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            + Add Bid
          </Link>
        </div>

        {bids.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No bids recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {bids.map((bid) => (
              <div
                key={bid.id}
                className={[
                  'flex flex-wrap items-start justify-between gap-3 p-4 rounded-lg border',
                  bid.status === 'accepted'
                    ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/10'
                    : 'border-slate-100 dark:border-slate-800',
                ].join(' ')}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{bid.vendor_name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {BID_TYPE_LABELS[bid.bid_type]}
                    </span>
                    <BidStatusBadge status={bid.status} />
                  </div>
                  {bid.vendor_email && (
                    <p className="text-xs text-slate-400">{bid.vendor_email}</p>
                  )}
                  {bid.notes && (
                    <p className="text-xs text-slate-500 mt-1">{bid.notes}</p>
                  )}
                  {bid.submitted_at && (
                    <p className="text-xs text-slate-400">
                      Submitted {format(new Date(bid.submitted_at), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {bid.amount != null && (
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      ${bid.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {acceptedBid && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-sm">
            <span className="text-slate-500">Accepted bid total</span>
            <span className="font-bold text-green-700 dark:text-green-400 text-base">
              {acceptedBid.amount != null
                ? `$${acceptedBid.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                : '—'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
