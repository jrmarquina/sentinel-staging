'use server'

/**
 * FM User Management Server Actions
 *
 * Replaces the FM Express routes:
 *   POST   /api/users  → createFmUserAction
 *   PATCH  /api/users/:id → updateFmUserAction
 *   DELETE /api/users/:id → deleteFmUserAction
 *   GET    /api/users  → listFmUsersAction
 *
 * All actions require admin or supervisor role.
 * User creation requires admin only (mirrors FM's original access control).
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { normalizeFmRole, type AppRole } from '@sentinel/shared'
import { getSession } from './get-session'

// ── Validation schemas ────────────────────────────────────────

const createUserSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(1, 'Full name required').max(100),
  /**
   * Accepts either FM role names (ADMIN, MANAGER, INSPECTOR, CLIENT_VIEWER)
   * or platform role names (admin, supervisor, inspector, vendor, viewer).
   */
  role: z.string().min(1, 'Role required'),
})

const updateUserSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  full_name: z.string().min(1).max(100).optional(),
  role: z.string().optional(),
  /** If provided, resets the user's password */
  new_password: z.string().min(8).optional(),
})

const deleteUserSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
})

// ── Actions ───────────────────────────────────────────────────

/**
 * Create a new FM user with email + password.
 *
 * FM's original flow: admin fills form with email, password, name, role →
 * POST /api/users → bcrypt hash + create User row.
 *
 * New flow: admin fills same form → createFmUserAction →
 * Supabase Admin creates auth.users row → trigger creates profiles row →
 * we insert user_roles row with normalized role.
 */
export async function createFmUserAction(formData: FormData) {
  const session = await getSession()
  if (!session) return { error: 'Unauthorized' }
  if (session.role !== 'admin') return { error: 'Only admins can create users' }

  const raw = {
    email:     formData.get('email') as string,
    password:  formData.get('password') as string,
    full_name: formData.get('full_name') as string,
    role:      formData.get('role') as string,
  }

  const parsed = createUserSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const normalizedRole: AppRole = normalizeFmRole(parsed.data.role)
  const admin = createAdminClient()

  // Create auth user — email_confirm: true skips confirmation email
  // (mirrors FM's behaviour: admin sets the password directly)
  const { data: authData, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      org_id:       session.orgId,
      full_name:    parsed.data.full_name,
      invited_role: normalizedRole,   // handle_new_user() trigger reads this
    },
  })

  if (createError) {
    // Surface friendly messages for common errors
    if (createError.message.includes('already registered')) {
      return { error: 'A user with this email already exists' }
    }
    return { error: createError.message }
  }

  // The handle_new_user() trigger (migration 023) already creates both
  // profiles AND user_roles when invited_role is set in metadata.
  // We do an explicit upsert here as a safety net in case the trigger
  // ran before user_roles was ready (race condition on first boot).
  if (authData.user) {
    await admin.from('user_roles').upsert(
      {
        org_id:  session.orgId,
        user_id: authData.user.id,
        role:    normalizedRole,
      },
      { onConflict: 'org_id,user_id' }
    )
  }

  revalidatePath('/dashboard/fm/admin/accounts')
  return { success: true, userId: authData.user?.id }
}

/**
 * Update an FM user's name, role, and/or password.
 *
 * FM's original: PATCH /api/users/:id
 */
export async function updateFmUserAction(formData: FormData) {
  const session = await getSession()
  if (!session) return { error: 'Unauthorized' }
  if (session.role !== 'admin') return { error: 'Only admins can update users' }

  const raw = {
    user_id:      formData.get('user_id') as string,
    full_name:    (formData.get('full_name') as string) || undefined,
    role:         (formData.get('role') as string) || undefined,
    new_password: (formData.get('new_password') as string) || undefined,
  }

  const parsed = updateUserSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const admin = createAdminClient()

  // Update auth user (password reset if provided)
  if (parsed.data.new_password) {
    const { error } = await admin.auth.admin.updateUserById(parsed.data.user_id, {
      password: parsed.data.new_password,
    })
    if (error) return { error: error.message }
  }

  // Update profile name
  if (parsed.data.full_name) {
    await admin
      .from('profiles')
      .update({ full_name: parsed.data.full_name })
      .eq('id', parsed.data.user_id)
  }

  // Update role
  if (parsed.data.role) {
    const normalizedRole: AppRole = normalizeFmRole(parsed.data.role)
    await admin
      .from('user_roles')
      .upsert(
        {
          org_id:  session.orgId,
          user_id: parsed.data.user_id,
          role:    normalizedRole,
        },
        { onConflict: 'org_id,user_id' }
      )
  }

  revalidatePath('/dashboard/fm/admin/accounts')
  return { success: true }
}

/**
 * Soft-delete an FM user.
 *
 * FM's original: DELETE /api/users/:id (hard delete).
 * We soft-delete: ban the Supabase auth user + set profiles.deleted_at.
 * This preserves audit history while preventing login.
 */
export async function deleteFmUserAction(formData: FormData) {
  const session = await getSession()
  if (!session) return { error: 'Unauthorized' }
  if (session.role !== 'admin') return { error: 'Only admins can delete users' }

  const raw = { user_id: formData.get('user_id') as string }
  const parsed = deleteUserSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  // Prevent self-deletion
  if (parsed.data.user_id === session.userId) {
    return { error: 'You cannot delete your own account' }
  }

  const admin = createAdminClient()

  // Ban the Supabase auth user (blocks all future sign-ins)
  const { error: banError } = await admin.auth.admin.updateUserById(
    parsed.data.user_id,
    { ban_duration: '87600h' } // 10 years ≈ permanent
  )
  if (banError) return { error: banError.message }

  // Soft-delete the profile
  await admin
    .from('profiles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', parsed.data.user_id)

  revalidatePath('/dashboard/fm/admin/accounts')
  return { success: true }
}

/**
 * List all FM users in the caller's org.
 *
 * FM's original: GET /api/users
 * Returns users with their profile name and current role.
 */
export async function listFmUsersAction(): Promise<{
  data: FmUserRow[] | null
  error: string | null
}> {
  const session = await getSession()
  if (!session) return { data: null, error: 'Unauthorized' }

  // supervisor and above can list users
  if (!['admin', 'supervisor'].includes(session.role)) {
    return { data: null, error: 'Forbidden' }
  }

  const supabase = createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      avatar_url,
      created_at,
      deleted_at,
      user_roles ( role )
    `)
    .eq('org_id', session.orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: error.message }

  // Also fetch emails from auth.users via admin client
  const admin = createAdminClient()
  const userIds = (data ?? []).map((p: any) => p.id)

  // Supabase Admin API: list users, filter to our IDs
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = new Map<string, string>()
  for (const u of authList?.users ?? []) {
    if (userIds.includes(u.id)) emailMap.set(u.id, u.email ?? '')
  }

  const rows: FmUserRow[] = (data ?? []).map((p: any) => ({
    id:        p.id,
    email:     emailMap.get(p.id) ?? '',
    fullName:  p.full_name ?? '',
    role:      (p.user_roles?.[0]?.role ?? 'viewer') as AppRole,
    createdAt: p.created_at,
  }))

  return { data: rows, error: null }
}

export interface FmUserRow {
  id:        string
  email:     string
  fullName:  string
  role:      AppRole
  createdAt: string
}
