import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProjectForm } from '../project-form'
import type { Database } from '@sentinel/db'

export const metadata = { title: 'New Project — Sentinel' }

export default async function NewProjectPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orgData } = await supabase
    .from('user_roles')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!orgData) redirect('/dashboard')

  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('org_id', orgData.org_id)
    .is('deleted_at', null)
    .order('full_name')

  return (
    <ProjectForm
      orgId={orgData.org_id}
      userId={user.id}
      members={(members ?? []) as Database['public']['Tables']['profiles']['Row'][]}
    />
  )
}
