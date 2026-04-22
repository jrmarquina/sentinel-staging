import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ProjectDetail } from './project-detail'
import type { Database } from '@sentinel/db'

export const metadata = { title: 'Project — Sentinel' }

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
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

  // Note: project_manager and inspector_id FK to auth.users — fetch profiles separately
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.id)
    .is('deleted_at', null)
    .single()

  if (!project) notFound()

  const [
    { data: attachments },
    { data: inspections },
    { data: workOrders },
    { data: members },
  ] = await Promise.all([
    supabase
      .from('attachments')
      .select('*')
      .eq('related_id', params.id)
      .eq('related_table', 'projects')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),

    supabase
      .from('inspections')
      .select('*')
      .eq('project_id', params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),

    supabase
      .from('work_orders')
      .select('id, number, title, status, priority, due_date, total_cost')
      .eq('project_id', params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),

    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', orgData.org_id)
      .is('deleted_at', null)
      .order('full_name'),
  ])

  const memberList = (members ?? []) as Database['public']['Tables']['profiles']['Row'][]
  const p = project as Database['public']['Tables']['projects']['Row']

  const managerName = p.project_manager
    ? (memberList.find((m) => m.id === p.project_manager)?.full_name ?? null)
    : null

  const inspList = (inspections ?? []) as Database['public']['Tables']['inspections']['Row'][]

  return (
    <ProjectDetail
      project={{ ...p, manager_name: managerName }}
      attachments={(attachments ?? []) as Database['public']['Tables']['attachments']['Row'][]}
      inspections={inspList.map((i) => ({
        ...i,
        inspector_name: i.inspector_id
          ? (memberList.find((m) => m.id === i.inspector_id)?.full_name ?? null)
          : null,
      }))}
      workOrders={(workOrders ?? []) as Database['public']['Tables']['work_orders']['Row'][]}
      members={memberList}
      orgId={orgData.org_id}
      userId={user.id}
      isAdmin={isAdmin}
    />
  )
}
