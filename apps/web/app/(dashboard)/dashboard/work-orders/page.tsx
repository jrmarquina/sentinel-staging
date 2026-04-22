import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WorkOrdersClient } from './work-orders-client'
import { PAGE_SIZE } from '../pagination-constants'
import type { Database } from '@sentinel/db'

type WorkOrderRow = Database['public']['Tables']['work_orders']['Row']

export const metadata = { title: 'Work Orders — Sentinel' }

export default async function WorkOrdersPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orgData } = await supabase
    .from('user_roles').select('org_id').eq('user_id', user.id).limit(1).single()
  const orgId = (orgData as { org_id: string } | null)?.org_id
  if (!orgId) return <WorkOrdersClient workOrders={[]} totalCount={0} orgId="" />

  const { data, error, count } = await supabase
    .from('work_orders')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1)

  if (error) console.error('work_orders fetch error', error)

  const rows = (data ?? []) as WorkOrderRow[]

  const assigneeIds = [...new Set(rows.map((wo) => wo.assigned_to).filter(Boolean) as string[])]
  let nameMap: Record<string, string> = {}
  if (assigneeIds.length > 0) {
    const { data: profileData } = await supabase
      .from('profiles').select('id, full_name').in('id', assigneeIds)
    for (const p of profileData ?? []) {
      if (p.id && p.full_name) nameMap[p.id] = p.full_name
    }
  }

  const workOrders = rows.map((wo) => ({
    ...wo,
    assignee_name: wo.assigned_to ? (nameMap[wo.assigned_to] ?? null) : null,
  }))

  return <WorkOrdersClient workOrders={workOrders} totalCount={count ?? workOrders.length} orgId={orgId} />
}
