import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'
import { redirect } from 'next/navigation'
import { FmTeamClient } from './team-client'

export const metadata = { title: 'FM Team — Sentinel' }

function isFmManager(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager'].includes(cap)
  return ['admin', 'supervisor'].includes(role)
}

function getFmAccessLevel(cap: string | null, role: string): string | null {
  if (cap) {
    if (['org_admin', 'fm_manager'].includes(cap)) return 'manager'
    if (cap === 'fm_viewer')  return 'viewer'
    if (cap === 'fm_contributor') return 'fm_contributor'
    if (cap === 'fm_worker')      return 'fm_worker'
    return null
  }
  if (['admin', 'supervisor'].includes(role)) return 'manager'
  if (role === 'viewer')    return 'viewer'
  if (role === 'inspector') return 'fm_contributor'
  if (role === 'vendor')    return 'fm_worker'
  return null
}

export default async function FmTeamPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const accessLevel = getFmAccessLevel(session.capability, session.role)
  if (!accessLevel) redirect('/dashboard/fm')

  const supabase = createClient()
  const isManager = isFmManager(session.capability, session.role)

  // Parallel fetch: team members, role definitions
  const [{ data: rolesData }, { data: roleDefsData }, { data: profilesData }] = await Promise.all([
    supabase
      .from('user_roles')
      .select(`
        user_id,
        role,
        capability,
        created_at,
        role_definition:org_role_definitions(id, name, slug, capability_level),
        department:org_departments(id, name, slug)
      `)
      .eq('org_id', session.orgId)
      .not('capability', 'is', null)
      .order('created_at', { ascending: true }),

    supabase
      .from('org_role_definitions')
      .select('id, name, slug, capability_level, description, color')
      .eq('org_id', session.orgId)
      .eq('active', true)
      .order('capability_level', { ascending: true }),

    supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('org_id', session.orgId)
      .is('deleted_at', null),
  ])

  const profileMap = new Map(
    (profilesData ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => [p.id, p])
  )

  // Emails — manager only via admin API
  let emailMap = new Map<string, string>()
  if (isManager) {
    try {
      const admin = createAdminClient()
      const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 })
      emailMap = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? '']))
    } catch { /* non-fatal */ }
  }

  type RoleRow = {
    user_id: string
    role: string
    capability: string
    created_at: string
    role_definition: { id: string; name: string; slug: string; capability_level: string } | null
    department: { id: string; name: string; slug: string } | null
  }

  const members = ((rolesData as unknown as RoleRow[]) ?? []).map((r) => {
    const profile = profileMap.get(r.user_id)
    return {
      user_id:         r.user_id,
      full_name:       profile?.full_name ?? 'Unknown',
      avatar_url:      profile?.avatar_url ?? null,
      email:           emailMap.get(r.user_id) ?? null,
      role:            r.role,
      capability:      r.capability,
      role_definition: r.role_definition ?? null,
      joined_at:       r.created_at,
      is_me:           r.user_id === session.userId,
    }
  })

  type RoleDefRow = {
    id: string
    name: string
    slug: string
    capability_level: string
    description: string | null
    color: string | null
  }

  return (
    <FmTeamClient
      members={members}
      roleDefs={(roleDefsData ?? []) as RoleDefRow[]}
      isManager={isManager}
      currentUserId={session.userId}
    />
  )
}
