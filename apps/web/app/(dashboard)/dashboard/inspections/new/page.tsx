import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InspectionForm } from '../inspection-form'
import type { Database } from '@sentinel/db'

export const metadata = { title: 'New Inspection — Sentinel' }

export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: { project?: string }
}) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orgData } = await supabase
    .from('user_roles')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!orgData) redirect('/dashboard')

  const [{ data: members }, { data: projects }, { data: workOrders }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('org_id', orgData.org_id).is('deleted_at', null).order('full_name'),
    supabase.from('projects').select('id, name, code').eq('org_id', orgData.org_id).is('deleted_at', null).order('name'),
    supabase.from('work_orders').select('id, number, title').eq('org_id', orgData.org_id).is('deleted_at', null).order('created_at', { ascending: false }).limit(100),
  ])

  return (
    <InspectionForm
      orgId={orgData.org_id}
      userId={user.id}
      members={(members ?? []) as Database['public']['Tables']['profiles']['Row'][]}
      projects={(projects ?? []) as Database['public']['Tables']['projects']['Row'][]}
      workOrders={(workOrders ?? []) as Database['public']['Tables']['work_orders']['Row'][]}
      defaultProjectId={searchParams.project}
    />
  )
}
