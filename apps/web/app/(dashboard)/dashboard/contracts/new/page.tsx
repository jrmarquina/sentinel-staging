import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ContractForm } from '@/components/contracts/ContractForm'

export const metadata = { title: 'New Contract — Sentinel' }

export default async function NewContractPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  const orgId = (profileData as { org_id: string } | null)?.org_id
  if (!orgId) redirect('/login')

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/contracts"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft size={16} />
          Contracts
        </Link>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="text-sm text-slate-900 dark:text-white font-medium">New</span>
      </div>
      <ContractForm orgId={orgId} userId={user.id} />
    </div>
  )
}
