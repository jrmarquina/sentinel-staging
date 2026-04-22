'use server'

import { createClient } from '@/lib/supabase/server'

export async function archiveContract(contractId: string): Promise<{ error?: string }> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: roleData } = await supabase
    .from('user_roles').select('org_id').eq('user_id', user.id).single()
  const orgId = (roleData as { org_id?: string } | null)?.org_id
  if (!orgId) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('contracts')
    .update({ status: 'expired' })
    .eq('id', contractId)
    .eq('org_id', orgId)

  if (error) return { error: error.message }
  return {}
}
