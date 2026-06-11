import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsClient, type Member, type AuditEntry } from './settings-client'

export const metadata = { title: 'Settings — Sentinel' }

export default async function SettingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Admin-only
  const { data: myRoleData } = await supabase
    .from('user_roles')
    .select('org_id, role')
    .eq('user_id', user.id)
    .single()

  const myRole = myRoleData as { org_id: string; role: string } | null
  if (!myRole || myRole.role !== 'admin') redirect('/dashboard')

  const orgId = myRole.org_id

  // Fetch all non-deleted profiles in the org
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, created_at')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  // Fetch role assignments for this org
  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .eq('org_id', orgId)

  // Fetch email addresses via admin API (service role — not bound by RLS)
  const admin = createAdminClient()
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })

  const emailMap: Record<string, string> = {}
  for (const u of authList?.users ?? []) {
    emailMap[u.id] = u.email ?? ''
  }

  const roleMap: Record<string, string> = {}
  for (const r of (roles ?? []) as { user_id: string; role: string }[]) {
    roleMap[r.user_id] = r.role
  }

  type ProfileRow = { id: string; full_name: string | null; avatar_url: string | null; created_at: string }

  const members: Member[] = ((profiles ?? []) as ProfileRow[]).map((p) => ({
    id:         p.id,
    full_name:  p.full_name ?? 'Unknown',
    email:      emailMap[p.id] ?? '—',
    role:       roleMap[p.id] ?? 'viewer',
    avatar_url: p.avatar_url,
    created_at: p.created_at,
    is_me:      p.id === user.id,
  }))

  // Fetch last 100 audit log entries — old_data/new_data JSON blobs are heavy,
  // and all rows are serialized into the RSC payload (500 rows ≈ 300 KB HTML)
  const { data: auditRows } = await admin
    .from('audit_log')
    .select('id, user_id, action, table_name, record_id, old_data, new_data, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100)

  // Build a name map for audit entries
  const nameMap: Record<string, string> = {}
  for (const p of (profiles ?? []) as ProfileRow[]) {
    nameMap[p.id] = p.full_name ?? 'Unknown'
  }

  type AuditRow = { id: string; user_id: string | null; action: string; table_name: string; record_id: string; old_data: unknown; new_data: unknown; created_at: string }
  const auditLog: AuditEntry[] = ((auditRows ?? []) as AuditRow[]).map((r) => ({
    id:         r.id,
    user_id:    r.user_id,
    user_name:  r.user_id ? (nameMap[r.user_id] ?? emailMap[r.user_id] ?? 'Unknown') : 'System',
    action:     r.action,
    table_name: r.table_name,
    record_id:  r.record_id,
    old_data:   r.old_data as Record<string, unknown> | null,
    new_data:   r.new_data as Record<string, unknown> | null,
    created_at: r.created_at,
  }))

  return <SettingsClient members={members} auditLog={auditLog} />
}
