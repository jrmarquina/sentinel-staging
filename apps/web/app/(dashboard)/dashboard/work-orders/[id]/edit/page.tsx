import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { WorkOrderForm } from '@/components/work-orders/WorkOrderForm'
import type { Database } from '@sentinel/db'

type WorkOrderRow = Database['public']['Tables']['work_orders']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Location = Database['public']['Tables']['locations']['Row']

export const metadata = { title: 'Edit Work Order — Sentinel' }

export default async function EditWorkOrderPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: wo, error } = await supabase
    .from('work_orders')
    .select('*')
    .eq('id', params.id)
    .is('deleted_at', null)
    .single()

  if (error || !wo) notFound()

  const workOrder = wo as WorkOrderRow

  const orgId = workOrder.org_id

  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('full_name')

  const profiles = (profilesData as Pick<Profile, 'id' | 'full_name'>[] | null) ?? []

  const { data: locationsData } = await supabase
    .from('locations')
    .select('id, name, address')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('name')

  const locations = (locationsData as Pick<Location, 'id' | 'name' | 'address'>[] | null) ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/work-orders/${params.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          {workOrder.number}
        </Link>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="text-sm text-slate-900 dark:text-white font-medium">Edit</span>
      </div>

      <WorkOrderForm
        orgId={orgId}
        userId={user.id}
        profiles={profiles}
        locations={locations}
        initial={workOrder}
      />
    </div>
  )
}
