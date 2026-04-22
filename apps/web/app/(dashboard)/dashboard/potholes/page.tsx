import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PotholesClient } from './potholes-client'
import { PAGE_SIZE } from '../pagination-constants'
import type { Database } from '@sentinel/db'

type PotholeRow = Database['public']['Tables']['pothole_reports']['Row']

export const metadata = { title: 'Potholes & Road Damage — Sentinel' }

export default async function PotholesPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orgData } = await supabase
    .from('user_roles').select('org_id').eq('user_id', user.id).limit(1).single()
  const orgId = (orgData as { org_id: string } | null)?.org_id
  if (!orgId) return <PotholesClient reports={[]} totalCount={0} orgId="" />

  const { data, error, count } = await supabase
    .from('pothole_reports')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1)

  if (error) console.error('pothole_reports fetch error', error)

  const rows = (data ?? []) as PotholeRow[]

  const personIds = [...new Set([
    ...rows.map((r) => r.assigned_to),
    ...rows.map((r) => r.reported_by),
  ].filter(Boolean) as string[])]
  let personMap: Record<string, string> = {}
  if (personIds.length > 0) {
    const { data: profileData } = await supabase
      .from('profiles').select('id, full_name').in('id', personIds)
    for (const p of profileData ?? []) {
      if (p.id && p.full_name) personMap[p.id] = p.full_name
    }
  }

  const reports = rows.map((r) => ({
    ...r,
    assignee_name: r.assigned_to ? (personMap[r.assigned_to] ?? null) : null,
    reporter_name: r.reported_by ? (personMap[r.reported_by] ?? null) : null,
  }))

  return <PotholesClient reports={reports} totalCount={count ?? reports.length} orgId={orgId} />
}
