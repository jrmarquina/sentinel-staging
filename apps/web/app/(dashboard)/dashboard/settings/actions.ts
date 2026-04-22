'use server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ── Guard — only admins may call these actions ─────────────────────────────

async function requireAdmin(): Promise<{ callerId: string; orgId: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data } = await supabase
    .from('user_roles')
    .select('org_id, role')
    .eq('user_id', user.id)
    .single()

  const row = data as { org_id: string; role: string } | null
  if (!row || row.role !== 'admin') throw new Error('Forbidden')
  return { callerId: user.id, orgId: row.org_id }
}

// ── Create user ────────────────────────────────────────────────────────────

export async function createUser(input: {
  email: string
  full_name: string
  password: string
  role: string
}): Promise<{ error?: string }> {
  const { orgId } = await requireAdmin()
  const admin = createAdminClient()

  // 1. Create auth.users entry (email confirmed immediately)
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email:          input.email.trim().toLowerCase(),
    password:       input.password,
    email_confirm:  true,
    user_metadata:  { full_name: input.full_name },
  })
  if (authErr || !authData.user) {
    return { error: authErr?.message ?? 'Failed to create account' }
  }

  const uid = authData.user.id

  // 2. Upsert profile — handles the case where a soft-deleted profile with
  //    the same id already exists (e.g. delete + re-create same email)
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert(
      { id: uid, org_id: orgId, full_name: input.full_name, deleted_at: null },
      { onConflict: 'id' }
    )

  if (profileErr) {
    await admin.auth.admin.deleteUser(uid)
    return { error: profileErr.message }
  }

  // 3. Upsert user_role (same reason — may exist from a previous soft-delete)
  const { error: roleErr } = await admin
    .from('user_roles')
    .upsert({ user_id: uid, org_id: orgId, role: input.role }, { onConflict: 'org_id,user_id' })

  if (roleErr) {
    await admin.auth.admin.deleteUser(uid)
    return { error: roleErr.message }
  }

  revalidatePath('/dashboard/settings')
  return {}
}

// ── Update user name + role ────────────────────────────────────────────────

export async function updateUser(input: {
  userId:    string
  full_name: string
  email:     string
  role:      string
}): Promise<{ error?: string }> {
  const { callerId, orgId } = await requireAdmin()
  const admin = createAdminClient()

  // Update email in auth.users only if it changed and the auth user exists
  const normalizedEmail = input.email.trim().toLowerCase()
  const { data: existingAuth } = await admin.auth.admin.getUserById(input.userId)
  if (existingAuth?.user && existingAuth.user.email !== normalizedEmail) {
    const { error: authErr } = await admin.auth.admin.updateUserById(input.userId, {
      email: normalizedEmail,
    })
    if (authErr) return { error: authErr.message }
  }

  // Update display name in profiles
  const { error: profileErr } = await admin
    .from('profiles')
    .update({ full_name: input.full_name })
    .eq('id', input.userId)
    .eq('org_id', orgId)

  if (profileErr) return { error: profileErr.message }

  // Don't let admin demote themselves
  if (input.userId !== callerId) {
    const { error: roleErr } = await admin
      .from('user_roles')
      .update({ role: input.role })
      .eq('user_id', input.userId)
      .eq('org_id', orgId)

    if (roleErr) return { error: roleErr.message }
  }

  revalidatePath('/dashboard/settings')
  return {}
}

// ── Reset password ─────────────────────────────────────────────────────────

export async function resetUserPassword(input: {
  userId:   string
  password: string
}): Promise<{ error?: string }> {
  await requireAdmin()
  const admin = createAdminClient()

  const { error } = await admin.auth.admin.updateUserById(input.userId, {
    password: input.password,
  })

  if (error) return { error: error.message }
  return {}
}

// ── Delete user ────────────────────────────────────────────────────────────

export async function deleteUser(input: {
  userId: string
}): Promise<{ error?: string }> {
  const { callerId, orgId } = await requireAdmin()
  if (input.userId === callerId) return { error: 'You cannot delete your own account.' }

  const admin = createAdminClient()

  // Soft-delete profile first (preserves references in work orders, inspections, etc.)
  const { error: profileErr } = await admin
    .from('profiles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', input.userId)
    .eq('org_id', orgId)

  if (profileErr) return { error: profileErr.message }

  // Hard-delete from auth (revokes login)
  const { error: authErr } = await admin.auth.admin.deleteUser(input.userId)
  if (authErr) return { error: authErr.message }

  revalidatePath('/dashboard/settings')
  return {}
}
