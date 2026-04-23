'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { loginSchema, inviteUserSchema, setPasswordSchema } from '@sentinel/shared'
import type { AppRole } from '@sentinel/shared'

export async function loginAction(formData: FormData) {
  const raw = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return { error: 'Invalid email or password' }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function logoutAction() {
  const supabase = createClient()
  // Best-effort signOut — if the session is stale/broken, GoTrue may
  // reject it. We clear cookies unconditionally so the user is never stuck.
  try { await supabase.auth.signOut() } catch { /* ignore */ }

  // Force-clear all Supabase auth cookies regardless of signOut outcome
  const cookieStore = cookies()
  const allCookies = cookieStore.getAll()
  const authCookieNames = allCookies
    .map(c => c.name)
    .filter(n => n.startsWith('sb-') || n.includes('supabase') || n.includes('auth-token'))
  for (const name of authCookieNames) {
    cookieStore.set(name, '', { maxAge: 0, path: '/' })
  }

  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function inviteUserAction(formData: FormData) {
  const raw = {
    email: formData.get('email') as string,
    role: formData.get('role') as string,
    full_name: formData.get('full_name') as string,
  }

  const parsed = inviteUserSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const supabase = createClient()
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()

  if (!currentUser) return { error: 'Not authenticated' }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', currentUser.id)
    .single()

  const profile = profileData as { org_id: string } | null
  if (!profile) return { error: 'Profile not found' }

  const admin = createAdminClient()
  const { data: invitedUser, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    {
      data: {
        org_id: profile.org_id,
        full_name: parsed.data.full_name,
        invited_role: parsed.data.role,
      },
    }
  )

  if (inviteError) return { error: inviteError.message }

  if (invitedUser.user) {
    await admin.from('user_roles').insert({
      org_id: profile.org_id,
      user_id: invitedUser.user.id,
      role: parsed.data.role as AppRole,
    })
  }

  return { success: true }
}

export async function setPasswordAction(formData: FormData) {
  const raw = {
    password: formData.get('password') as string,
    confirm_password: formData.get('confirm_password') as string,
  }

  const parsed = setPasswordSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const supabase = createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) return { error: error.message }

  redirect('/dashboard')
}

export async function forgotPasswordAction(formData: FormData) {
  const email = formData.get('email') as string
  if (!email) return { error: 'Email is required' }

  const supabase = createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/callback?next=/auth/reset-password`,
  })

  if (error) return { error: error.message }
  return { success: true }
}
