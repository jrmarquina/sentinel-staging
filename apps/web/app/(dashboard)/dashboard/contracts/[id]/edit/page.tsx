import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ContractForm } from '@/components/contracts/ContractForm'
import type { Database } from '@sentinel/db'

type ContractRow = Database['public']['Tables']['contracts']['Row']

export const metadata = { title: 'Edit Contract — Sentinel' }

export default async function EditContractPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: roleData } = await supabase
    .from('user_roles').select('org_id').eq('user_id', user.id).single()
  const orgId = (roleData as { org_id?: string } | null)?.org_id ?? ''
  if (!orgId) redirect('/dashboard')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('contracts')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .single()

  if (error || !data) notFound()

  const contract = data as ContractRow

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/contracts/${params.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft size={16} />
          {contract.number}
        </Link>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="text-sm text-slate-900 dark:text-white font-medium">Edit</span>
      </div>
      <ContractForm orgId={orgId} userId={user.id} initial={contract} />
    </div>
  )
}
