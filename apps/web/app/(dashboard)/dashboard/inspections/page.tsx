import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InspectionsClient } from './inspections-client'
import { PAGE_SIZE } from '../pagination-constants'
import type { Database } from '@sentinel/db'

export const metadata = { title: 'Inspections — Sentinel' }

export default async function InspectionsPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orgData } = await supabase
    .from('user_roles').select('org_id').eq('user_id', user.id).limit(1).single()
  const orgId = (orgData as { org_id: string } | null)?.org_id
  if (!orgId) return <InspectionsClient inspections={[]} totalCount={0} orgId="" />

  const { data, error, count } = await supabase
    .from('inspections')
    .select('*, project:projects!inspections_project_id_fkey(name, code)', { count: 'exact' })
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1)

  if (error) console.error('inspections fetch error', error)

  type RawRow = Database['public']['Tables']['inspections']['Row'] & {
    project: { name: string; code: string } | null
  }

  const rows = (data ?? []) as RawRow[]

  const inspectorIds = [...new Set(rows.map((i) => i.inspector_id).filter(Boolean) as string[])]
  let inspectorMap: Record<string, string> = {}
  if (inspectorIds.length > 0) {
    const { data: profileData } = await supabase
      .from('profiles').select('id, full_name').in('id', inspectorIds)
    for (const p of profileData ?? []) {
      if (p.id && p.full_name) inspectorMap[p.id] = p.full_name
    }
  }

  const inspections = rows.map((i) => ({
    ...i,
    inspector_name: i.inspector_id ? (inspectorMap[i.inspector_id] ?? null) : null,
    project_name:   i.project?.name ?? null,
    project_code:   i.project?.code ?? null,
  }))

  return <InspectionsClient inspections={inspections} totalCount={count ?? inspections.length} orgId={orgId} />
}
