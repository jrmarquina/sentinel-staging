import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TeamClient } from './team-client'

export const metadata = { title: 'Team — Sentinel' }

export default async function TeamPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myRole } = await supabase
    .from('user_roles').select('org_id, role').eq('user_id', user.id).limit(1).single()

  const orgId = (myRole as { org_id: string; role: string } | null)?.org_id
  const role  = (myRole as { org_id: string; role: string } | null)?.role ?? ''

  if (!orgId || !['admin', 'supervisor'].includes(role)) redirect('/dashboard')

  // Note: user_roles.user_id FK points to auth.users — join profiles separately
  const [{ data: membersData }, { data: profilesData }] = await Promise.all([
    supabase
      .from('user_roles')
      .select('user_id, role, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('org_id', orgId)
      .is('deleted_at', null),
  ])

  type MemberRow = { user_id: string; role: string; created_at: string }
  type ProfileRow = { id: string; full_name: string | null; avatar_url: string | null }

  const profileMap: Record<string, ProfileRow> = {}
  for (const p of (profilesData ?? []) as ProfileRow[]) {
    if (p.id) profileMap[p.id] = p
  }

  const team = ((membersData ?? []) as MemberRow[]).map((m) => ({
    user_id:    m.user_id,
    role:       m.role,
    joined_at:  m.created_at,
    full_name:  profileMap[m.user_id]?.full_name ?? 'Unknown',
    avatar_url: profileMap[m.user_id]?.avatar_url ?? null,
    is_me:      m.user_id === user.id,
  }))

  return <TeamClient team={team} currentRole={role} />
}
