import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { differenceInDays, parseISO } from 'date-fns'
import { OverdueClient } from './overdue-client'

export const metadata = { title: 'Overdue Items — Sentinel' }

export type OverdueItem = {
  id: string
  type: 'work_order' | 'project'
  number: string
  title: string
  dueDate: string
  daysOverdue: number
  status: string
  blocked: boolean
  blockedBy: string | null
  assigneeName: string | null
  href: string
}

export default async function OverduePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orgData } = await supabase
    .from('user_roles').select('org_id').eq('user_id', user.id).limit(1).single()
  const orgId = (orgData as { org_id: string } | null)?.org_id
  if (!orgId) return <OverdueClient items={[]} />

  const today = new Date()

  const [woRes, projRes] = await Promise.all([
    // Note: assigned_to FK points to auth.users, not profiles — fetch without join
    supabase
      .from('work_orders')
      .select('id, number, title, due_date, status, blocked, blocked_by, assigned_to')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .not('status', 'in', '("closed","cancelled")')
      .lt('due_date', today.toISOString().split('T')[0])
      .order('due_date', { ascending: true }),

    supabase
      .from('projects')
      .select('id, number, name, status, planned_end_date, blocked, blocked_by')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .not('status', 'in', '("completed","cancelled")')
      .lt('planned_end_date', today.toISOString().split('T')[0])
      .order('planned_end_date', { ascending: true }),
  ])

  type WORow = {
    id: string; number: string; title: string; due_date: string
    status: string; blocked: boolean; blocked_by: string | null
    assigned_to: string | null
  }
  type ProjRow = {
    id: string; number: string; name: string; planned_end_date: string
    status: string; blocked: boolean; blocked_by: string | null
  }

  // Resolve assignee names separately
  const woRows = (woRes.data ?? []) as WORow[]
  const overdueAssigneeIds = [...new Set(woRows.map((w) => w.assigned_to).filter(Boolean) as string[])]
  let overdueNameMap: Record<string, string> = {}
  if (overdueAssigneeIds.length > 0) {
    const { data: profileData } = await supabase
      .from('profiles').select('id, full_name').in('id', overdueAssigneeIds)
    for (const p of profileData ?? []) {
      if (p.id && p.full_name) overdueNameMap[p.id] = p.full_name
    }
  }

  const woItems: OverdueItem[] = woRows.map((wo) => ({
    id:           wo.id,
    type:         'work_order',
    number:       wo.number,
    title:        wo.title,
    dueDate:      wo.due_date,
    daysOverdue:  differenceInDays(today, parseISO(wo.due_date)),
    status:       wo.status,
    blocked:      wo.blocked,
    blockedBy:    wo.blocked_by,
    assigneeName: wo.assigned_to ? (overdueNameMap[wo.assigned_to] ?? null) : null,
    href:         `/dashboard/work-orders/${wo.id}`,
  }))

  const projItems: OverdueItem[] = ((projRes.data ?? []) as ProjRow[]).map((p) => ({
    id:           p.id,
    type:         'project',
    number:       p.number,
    title:        p.name,
    dueDate:      p.planned_end_date,
    daysOverdue:  differenceInDays(today, parseISO(p.planned_end_date)),
    status:       p.status,
    blocked:      p.blocked,
    blockedBy:    p.blocked_by,
    assigneeName: null,
    href:         `/dashboard/projects/${p.id}`,
  }))

  // Merge and sort by most days overdue first
  const items = [...woItems, ...projItems].sort((a, b) => b.daysOverdue - a.daysOverdue)

  return <OverdueClient items={items} />
}
