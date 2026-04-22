import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ContractsClient } from './contracts-client'
import { PAGE_SIZE } from '../pagination-constants'
import type { Database } from '@sentinel/db'

type ContractRow = Database['public']['Tables']['contracts']['Row']

export const metadata = { title: 'Contracts — Sentinel' }

export default async function ContractsPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orgData } = await supabase
    .from('user_roles').select('org_id').eq('user_id', user.id).limit(1).single()
  const orgId = (orgData as { org_id: string } | null)?.org_id
  if (!orgId) return <ContractsClient contracts={[]} totalCount={0} orgId="" />

  const { data, error, count } = await supabase
    .from('contracts')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1)

  if (error) console.error('contracts fetch error', error)

  const contracts = (data as ContractRow[] | null) ?? []

  return <ContractsClient contracts={contracts} totalCount={count ?? contracts.length} orgId={orgId} />
}
