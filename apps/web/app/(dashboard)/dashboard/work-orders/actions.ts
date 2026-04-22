'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { WorkOrderStatus } from '@sentinel/db'

const ALLOWED_ROLES = ['admin', 'supervisor', 'inspector']

export async function updateWorkOrderStatus(
  id: string,
  status: WorkOrderStatus,
): Promise<{ error?: string }> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: roleData } = await supabase
    .from('user_roles').select('role, org_id').eq('user_id', user.id).single()

  if (!roleData || !ALLOWED_ROLES.includes(roleData.role)) {
    return { error: 'Insufficient permissions.' }
  }

  const update: Record<string, unknown> = { status }
  if (status === 'closed') update.closed_at = new Date().toISOString()
  // Clear closed_at if re-opening
  if (status !== 'closed') update.closed_at = null

  const { error } = await supabase
    .from('work_orders')
    .update(update)
    .eq('id', id)
    .eq('org_id', roleData.org_id)
    .is('deleted_at', null)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/work-orders')
  revalidatePath(`/dashboard/work-orders/${id}`)
  return {}
}
