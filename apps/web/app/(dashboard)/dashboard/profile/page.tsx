import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileClient } from './profile-client'

export const metadata = { title: 'My Profile — Sentinel' }

export default async function ProfilePage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: roleData }] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_url, password_locked').eq('id', user.id).single(),
    supabase.from('user_roles').select('role').eq('user_id', user.id).single(),
  ])

  return (
    <ProfileClient
      userId={user.id}
      email={user.email ?? ''}
      fullName={profile?.full_name ?? null}
      avatarUrl={profile?.avatar_url ?? null}
      role={roleData?.role ?? 'viewer'}
      passwordLocked={(profile as { password_locked?: boolean } | null)?.password_locked ?? false}
    />
  )
}
