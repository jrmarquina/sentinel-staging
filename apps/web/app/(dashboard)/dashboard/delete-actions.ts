'use server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type DeletableTable = 'work_orders' | 'projects' | 'pothole_reports' | 'inspections' | 'contracts'

const TABLE_REVALIDATE: Record<DeletableTable, string> = {
  work_orders:     '/dashboard/work-orders',
  projects:        '/dashboard/projects',
  pothole_reports: '/dashboard/potholes',
  inspections:     '/dashboard/inspections',
  contracts:       '/dashboard/contracts',
}

export async function softDelete(input: {
  id:    string
  table: DeletableTable
}): Promise<{ error?: string }> {
  // Require admin role
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!roleData || roleData.role !== 'admin') return { error: 'Only administrators can delete records.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from(input.table)
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', input.id)

  if (error) return { error: error.message }

  revalidatePath(TABLE_REVALIDATE[input.table])
  return {}
}
