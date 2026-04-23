'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

const VALID_ROLES = ['admin', 'supervisor', 'inspector', 'vendor', 'viewer'] as const

export async function createTeamMember(
  email: string,
  password: string,
  fullName: string,
  role: string,
  department: string = 'pw'
): Promise<{ error?: string }> {
  if (!email || !email.includes('@')) return { error: 'Valid email required' }
  if (!password || password.length < 6) return { error: 'Password must be at least 6 characters' }
  if (!fullName.trim()) return { error: 'Full name required' }
  if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) return { error: 'Invalid role' }

  const validDepts = ['pw', 'fm', 'both']
  const dept = validDepts.includes(department) ? department : 'pw'

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: myRole } = await supabase
    .from('user_roles').select('org_id, role').eq('user_id', user.id).single()

  if ((myRole as { role: string } | null)?.role !== 'admin') {
    return { error: 'Only admins can create members' }
  }

  const orgId = (myRole as { org_id: string }).org_id
  const admin = createAdminClient()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError) return { error: createError.message }

  if (created?.user?.id) {
    await admin
      .from('user_roles')
      .upsert({ user_id: created.user.id, org_id: orgId, role }, { onConflict: 'org_id,user_id' })

    await admin
      .from('profiles')
      .upsert(
        { id: created.user.id, org_id: orgId, full_name: fullName.trim(), avatar_url: null, deleted_at: null, department: dept },
        { onConflict: 'id' }
      )
  }

  return {}
}

export async function inviteTeamMember(
  email: string,
  role: string
): Promise<{ error?: string }> {
  if (!email || !email.includes('@')) return { error: 'Valid email required' }
  if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) return { error: 'Invalid role' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: myRole } = await supabase
    .from('user_roles').select('org_id, role').eq('user_id', user.id).single()

  if ((myRole as { role: string } | null)?.role !== 'admin') {
    return { error: 'Only admins can invite members' }
  }

  const orgId = (myRole as { org_id: string }).org_id
  const admin = createAdminClient()

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { org_id: orgId, role },
  })

  if (inviteError) return { error: inviteError.message }

  // Create user_roles immediately so the invite appears in the team list
  if (invited?.user?.id) {
    await admin
      .from('user_roles')
      .upsert({ user_id: invited.user.id, org_id: orgId, role }, { onConflict: 'user_id' })

    // Create a placeholder profile so the member list shows the email
    await admin
      .from('profiles')
      .upsert(
        { id: invited.user.id, org_id: orgId, full_name: email.split('@')[0], avatar_url: null },
        { onConflict: 'id', ignoreDuplicates: true }
      )
  }

  return {}
}
