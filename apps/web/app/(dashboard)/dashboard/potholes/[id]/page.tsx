import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { PotholeDetail } from './pothole-detail'
import type { Database } from '@sentinel/db'

type PotholeRow = Database['public']['Tables']['pothole_reports']['Row']
type AttachmentRow = Database['public']['Tables']['attachments']['Row']
type ProfileRow = Database['public']['Tables']['profiles']['Row']

export const metadata = { title: 'Damage Report — Sentinel' }

export default async function PotholeDetailPage({ params }: { params: { id: string } }) {
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

  // Note: assigned_to and reported_by FK to auth.users — fetch profiles separately
  const { data: report } = await supabase
    .from('pothole_reports')
    .select('*')
    .eq('id', params.id)
    .is('deleted_at', null)
    .single()

  if (!report) notFound()

  const r = report as PotholeRow

  // Fetch attachments, team members, and linked work order in parallel
  const [{ data: attachments }, { data: members }, { data: linkedWo }] = await Promise.all([
    supabase
      .from('attachments')
      .select('*')
      .eq('related_id', params.id)
      .eq('related_table', 'pothole_reports')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', orgData.org_id)
      .is('deleted_at', null)
      .order('full_name'),
    r.work_order_id
      ? supabase
          .from('work_orders')
          .select('id, number, title, status')
          .eq('id', r.work_order_id)
          .is('deleted_at', null)
          .single()
      : Promise.resolve({ data: null }),
  ])
  const memberList = (members ?? []) as ProfileRow[]

  const assigneeName = r.assigned_to
    ? (memberList.find((m) => m.id === r.assigned_to)?.full_name ?? null)
    : null
  const reporterName = r.reported_by
    ? (memberList.find((m) => m.id === r.reported_by)?.full_name ?? null)
    : null

  return (
    <PotholeDetail
      report={{ ...r, assignee_name: assigneeName, reporter_name: reporterName }}
      attachments={(attachments ?? []) as AttachmentRow[]}
      members={(members ?? []) as ProfileRow[]}
      orgId={orgData.org_id}
      userId={user.id}
      isAdmin={isAdmin}
      userRole={orgData.role}
      linkedWorkOrder={linkedWo as { id: string; number: string; title: string; status: string } | null}
    />
  )
}
