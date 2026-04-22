'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function createWorkOrderFromPothole(potholeId: string): Promise<{ error?: string }> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: roleData } = await supabase
    .from('user_roles').select('org_id, role').eq('user_id', user.id).single()

  if (!roleData) return { error: 'Unauthorized' }
  if (!['admin', 'supervisor', 'inspector'].includes(roleData.role)) {
    return { error: 'Insufficient permissions to create work orders.' }
  }

  // Fetch the pothole
  const { data: ph, error: phErr } = await supabase
    .from('pothole_reports')
    .select('*')
    .eq('id', potholeId)
    .eq('org_id', roleData.org_id)
    .is('deleted_at', null)
    .single()

  if (phErr || !ph) return { error: 'Damage report not found.' }
  if (ph.work_order_id) return { error: 'A work order is already linked to this report.' }

  // Map pothole severity → WO severity
  const severityMap: Record<string, string> = {
    critical: 'critical',
    high:     'high',
    medium:   'medium',
    low:      'low',
  }

  // Map pothole severity → WO priority
  const priorityMap: Record<string, string> = {
    critical: 'P1',
    high:     'P2',
    medium:   'P3',
    low:      'P4',
  }

  const woSeverity = severityMap[ph.severity] ?? 'medium'
  const woPriority = priorityMap[ph.severity] ?? 'P3'

  const defectLabels: Record<string, string> = {
    pothole:               'Pothole',
    alligator_crack:       'Alligator Crack',
    linear_crack:          'Linear Crack',
    edge_failure:          'Edge Failure',
    subsidence:            'Subsidence',
    rutting:               'Rutting',
    surface_deterioration: 'Surface Deterioration',
  }

  const defectLabel = defectLabels[ph.defect_type] ?? ph.defect_type

  const title = `${defectLabel} Repair — ${ph.address ?? ph.number}`

  const description = [
    ph.description,
    ph.address ? `Location: ${ph.address}` : null,
    ph.pci_score != null ? `PCI Score: ${ph.pci_score}` : null,
    `Source: Damage Report ${ph.number}`,
  ].filter(Boolean).join('\n')

  // Create the work order
  const { data: wo, error: woErr } = await supabase
    .from('work_orders')
    .insert({
      org_id:      roleData.org_id,
      title,
      description,
      status:      'open',
      priority:    woPriority as 'P1' | 'P2' | 'P3' | 'P4',
      severity:    woSeverity as 'critical' | 'high' | 'medium' | 'low',
      assigned_to: ph.assigned_to ?? null,
      latitude:    ph.latitude ?? null,
      longitude:   ph.longitude ?? null,
      notes:       null,
      created_by:  user.id,
    })
    .select('id')
    .single()

  if (woErr || !wo) return { error: woErr?.message ?? 'Failed to create work order.' }

  // Link the pothole back to the new work order
  await supabase
    .from('pothole_reports')
    .update({ work_order_id: wo.id })
    .eq('id', potholeId)

  redirect(`/dashboard/work-orders/${wo.id}`)
}
