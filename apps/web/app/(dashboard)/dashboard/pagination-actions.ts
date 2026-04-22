'use server'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@sentinel/db'
import { PAGE_SIZE } from './pagination-constants'

type WorkOrder = Database['public']['Tables']['work_orders']['Row'] & { assignee_name: string | null }
type PotholeReport = Database['public']['Tables']['pothole_reports']['Row'] & { assignee_name: string | null; reporter_name: string | null }
type Inspection = Database['public']['Tables']['inspections']['Row'] & { inspector_name: string | null; project_name: string | null; project_code: string | null }
type Contract = Database['public']['Tables']['contracts']['Row']

async function verifyOrg(supabase: ReturnType<typeof createClient>, orgId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('user_roles').select('org_id').eq('user_id', user.id).eq('org_id', orgId).single()
  return !!data
}

export async function loadMoreWorkOrders(orgId: string, offset: number): Promise<WorkOrder[]> {
  const supabase = createClient()
  if (!(await verifyOrg(supabase, orgId))) return []

  const { data } = await supabase
    .from('work_orders')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  const rows = (data ?? []) as Database['public']['Tables']['work_orders']['Row'][]
  const assigneeIds = [...new Set(rows.map((r) => r.assigned_to).filter(Boolean) as string[])]
  let nameMap: Record<string, string> = {}
  if (assigneeIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', assigneeIds)
    for (const p of profiles ?? []) { if (p.id && p.full_name) nameMap[p.id] = p.full_name }
  }
  return rows.map((r) => ({ ...r, assignee_name: r.assigned_to ? (nameMap[r.assigned_to] ?? null) : null }))
}

export async function loadMorePotholes(orgId: string, offset: number): Promise<PotholeReport[]> {
  const supabase = createClient()
  if (!(await verifyOrg(supabase, orgId))) return []

  const { data } = await supabase
    .from('pothole_reports')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  const rows = (data ?? []) as Database['public']['Tables']['pothole_reports']['Row'][]
  const personIds = [...new Set([...rows.map((r) => r.assigned_to), ...rows.map((r) => r.reported_by)].filter(Boolean) as string[])]
  let personMap: Record<string, string> = {}
  if (personIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', personIds)
    for (const p of profiles ?? []) { if (p.id && p.full_name) personMap[p.id] = p.full_name }
  }
  return rows.map((r) => ({
    ...r,
    assignee_name: r.assigned_to ? (personMap[r.assigned_to] ?? null) : null,
    reporter_name: r.reported_by ? (personMap[r.reported_by] ?? null) : null,
  }))
}

export async function loadMoreInspections(orgId: string, offset: number): Promise<Inspection[]> {
  const supabase = createClient()
  if (!(await verifyOrg(supabase, orgId))) return []

  const { data } = await supabase
    .from('inspections')
    .select('*, project:projects!inspections_project_id_fkey(name, code)')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  type RawRow = Database['public']['Tables']['inspections']['Row'] & { project: { name: string; code: string } | null }
  const rows = (data ?? []) as RawRow[]
  const inspectorIds = [...new Set(rows.map((r) => r.inspector_id).filter(Boolean) as string[])]
  let inspectorMap: Record<string, string> = {}
  if (inspectorIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', inspectorIds)
    for (const p of profiles ?? []) { if (p.id && p.full_name) inspectorMap[p.id] = p.full_name }
  }
  return rows.map((r) => ({
    ...r,
    inspector_name: r.inspector_id ? (inspectorMap[r.inspector_id] ?? null) : null,
    project_name:   r.project?.name ?? null,
    project_code:   r.project?.code ?? null,
  }))
}

export async function loadMoreContracts(orgId: string, offset: number): Promise<Contract[]> {
  const supabase = createClient()
  if (!(await verifyOrg(supabase, orgId))) return []

  const { data } = await supabase
    .from('contracts')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  return (data ?? []) as Contract[]
}
