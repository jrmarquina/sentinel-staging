'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateProfile(input: {
  full_name: string
  avatar_url: string
}): Promise<{ error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name:  input.full_name.trim() || null,
      avatar_url: input.avatar_url.trim() || null,
    })
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/profile')
  return {}
}

export async function changePassword(input: {
  password: string
}): Promise<{ error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Enforce password_locked flag — cannot bypass via direct action call
  const { data: profile } = await supabase
    .from('profiles')
    .select('password_locked')
    .eq('id', user.id)
    .single()

  if ((profile as { password_locked?: boolean } | null)?.password_locked) {
    return { error: 'Your password is managed by an administrator and cannot be changed.' }
  }

  const { error } = await supabase.auth.updateUser({ password: input.password })
  if (error) return { error: error.message }
  return {}
}
