'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function linkInspectionWorkOrder(
  inspectionId: string,
  workOrderId: string | null,
): Promise<{ error?: string }> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: roleData } = await supabase
    .from('user_roles').select('role, org_id').eq('user_id', user.id).single()

  if (!roleData || !['admin', 'supervisor', 'inspector'].includes(roleData.role)) {
    return { error: 'Insufficient permissions.' }
  }

  const { error } = await supabase
    .from('inspections')
    .update({ work_order_id: workOrderId })
    .eq('id', inspectionId)
    .eq('org_id', roleData.org_id)
    .is('deleted_at', null)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/inspections/${inspectionId}`)
  return {}
}
