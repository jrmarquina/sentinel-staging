import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { InspectionDetail } from './inspection-detail'
import type { Database } from '@sentinel/db'

export const metadata = { title: 'Inspection — Sentinel' }

export default async function InspectionDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orgData } = await supabase
    .from('user_roles')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!orgData) redirect('/dashboard')
  const isAdmin = orgData.role === 'admin'

  // Note: inspector_id FK points to auth.users — fetch profiles separately
  const { data: inspection } = await supabase
    .from('inspections')
    .select(`
      *,
      project:projects!inspections_project_id_fkey(id, name, code)
    `)
    .eq('id', params.id)
    .is('deleted_at', null)
    .single()

  if (!inspection) notFound()

  const [
    { data: checklistItems },
    { data: attachments },
    { data: members },
    { data: projects },
    { data: workOrders },
  ] = await Promise.all([
    supabase
      .from('inspection_checklist_items')
      .select('*')
      .eq('inspection_id', params.id)
      .order('item_number', { ascending: true }),
    supabase
      .from('attachments')
      .select('*')
      .eq('related_id', params.id)
      .eq('related_table', 'inspections')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase.from('profiles').select('id, full_name').eq('org_id', orgData.org_id).is('deleted_at', null).order('full_name'),
    supabase.from('projects').select('id, name, code').eq('org_id', orgData.org_id).is('deleted_at', null).order('name'),
    supabase.from('work_orders').select('id, number, title').eq('org_id', orgData.org_id).is('deleted_at', null).order('created_at', { ascending: false }).limit(100),
  ])

  type RawInspection = Database['public']['Tables']['inspections']['Row'] & {
    project: { id: string; name: string; code: string } | null
  }

  const insp = inspection as RawInspection

  // Look up inspector name from profiles (already fetched in members)
  const inspectorName = insp.inspector_id
    ? ((members ?? []).find((m) => m.id === insp.inspector_id)?.full_name ?? null)
    : null

  return (
    <InspectionDetail
      inspection={{ ...insp, inspector_name: inspectorName, project_name: insp.project?.name ?? null, project_code: insp.project?.code ?? null }}
      checklistItems={(checklistItems ?? []) as Database['public']['Tables']['inspection_checklist_items']['Row'][]}
      attachments={(attachments ?? []) as Database['public']['Tables']['attachments']['Row'][]}
      members={(members ?? []) as Database['public']['Tables']['profiles']['Row'][]}
      projects={(projects ?? []) as Database['public']['Tables']['projects']['Row'][]}
      workOrders={(workOrders ?? []) as Database['public']['Tables']['work_orders']['Row'][]}
      orgId={orgData.org_id}
      userId={user.id}
      isAdmin={isAdmin}
    />
  )
}
