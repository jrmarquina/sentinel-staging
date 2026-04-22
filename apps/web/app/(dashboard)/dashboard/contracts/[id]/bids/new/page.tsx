import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BidForm } from '@/components/contracts/BidForm'
import type { Database } from '@sentinel/db'

type ContractRow = Database['public']['Tables']['contracts']['Row']

export const metadata = { title: 'Add Bid — Sentinel' }

export default async function NewBidPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('contracts')
    .select('id, number, title, org_id')
    .eq('id', params.id)
    .is('deleted_at', null)
    .single()

  if (error || !data) notFound()

  const contract = data as Pick<ContractRow, 'id' | 'number' | 'title' | 'org_id'>

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/contracts/${params.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft size={16} />
          {contract.number}
        </Link>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="text-sm text-slate-900 dark:text-white font-medium">Add Bid</span>
      </div>

      <div className="max-w-xl">
        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <p className="text-xs text-slate-400">Adding bid for</p>
          <p className="text-sm font-medium text-slate-900 dark:text-white">{contract.title}</p>
        </div>
        <BidForm
          orgId={contract.org_id}
          contractId={contract.id}
          userId={user.id}
        />
      </div>
    </div>
  )
}
