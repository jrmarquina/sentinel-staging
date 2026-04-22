import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProjectsClient } from './projects-client'
import type { Database } from '@sentinel/db'

type ProjectRow = Database['public']['Tables']['projects']['Row']

export const metadata = { title: 'Projects — Sentinel' }

export default async function ProjectsPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orgData } = await supabase
    .from('user_roles').select('org_id').eq('user_id', user.id).limit(1).single()
  const orgId = (orgData as { org_id: string } | null)?.org_id
  if (!orgId) return <ProjectsClient projects={[]} />

  // Note: project_manager FK points to auth.users — fetch profiles separately
  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      inspections:inspections(count),
      work_order_links:work_orders(count)
    `)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) console.error('projects fetch error', error)

  type RawRow = ProjectRow & {
    inspections: { count: number }[]
    work_order_links: { count: number }[]
  }

  const rows = (data ?? []) as RawRow[]

  // Resolve manager names
  const managerIds = [...new Set(rows.map((p) => p.project_manager).filter(Boolean) as string[])]
  let managerMap: Record<string, string> = {}
  if (managerIds.length > 0) {
    const { data: profileData } = await supabase
      .from('profiles').select('id, full_name').in('id', managerIds)
    for (const p of profileData ?? []) {
      if (p.id && p.full_name) managerMap[p.id] = p.full_name
    }
  }

  const projects = rows.map((p) => ({
    ...p,
    manager_name:     p.project_manager ? (managerMap[p.project_manager] ?? null) : null,
    inspection_count: p.inspections?.[0]?.count ?? 0,
    work_order_count: p.work_order_links?.[0]?.count ?? 0,
  }))

  return <ProjectsClient projects={projects} />
}
