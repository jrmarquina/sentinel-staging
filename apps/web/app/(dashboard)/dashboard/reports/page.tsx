import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReportsClient, type ReportsData } from './reports-client'

export const metadata = { title: 'Reports & Analytics — Sentinel' }

export default async function ReportsPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orgData } = await supabase
    .from('user_roles').select('org_id').eq('user_id', user.id).limit(1).single()
  const orgId = (orgData as { org_id: string } | null)?.org_id
  if (!orgId) redirect('/dashboard')

  // Parallel fetch of all raw data
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const [
    { data: woAll },
    { data: woRecent },
    { data: potholes },
    { data: inspections },
    { data: contracts },
  ] = await Promise.all([
    supabase
      .from('work_orders')
      .select('id, status, total_cost, project_id, created_at, closed_at, due_date')
      .eq('org_id', orgId).is('deleted_at', null).limit(5000),
    supabase
      .from('work_orders')
      .select('status, created_at, closed_at')
      .eq('org_id', orgId).is('deleted_at', null)
      .gte('created_at', sixMonthsAgo.toISOString()).limit(2000),
    supabase
      .from('pothole_reports')
      .select('severity, status, created_at, repaired_at')
      .eq('org_id', orgId).is('deleted_at', null).limit(5000),
    supabase
      .from('inspections')
      .select('inspector_id, status, score')
      .eq('org_id', orgId).is('deleted_at', null)
      .not('inspector_id', 'is', null).limit(2000),
    supabase
      .from('contracts')
      .select('status, value')
      .eq('org_id', orgId).is('deleted_at', null).limit(1000),
  ])

  // Resolve project names for WOs that have project_id
  const projectIds = [...new Set((woAll ?? []).map((w) => w.project_id).filter(Boolean) as string[])]
  let projectMap: Record<string, { number: string; name: string }> = {}
  if (projectIds.length > 0) {
    const { data: projects } = await supabase
      .from('projects').select('id, number, name').in('id', projectIds)
    for (const p of projects ?? []) {
      if (p.id) projectMap[p.id] = { number: p.number, name: p.name }
    }
  }

  // Resolve inspector names
  const inspectorIds = [...new Set((inspections ?? []).map((i) => i.inspector_id).filter(Boolean) as string[])]
  let inspectorMap: Record<string, string> = {}
  if (inspectorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles').select('id, full_name').in('id', inspectorIds)
    for (const p of profiles ?? []) {
      if (p.id && p.full_name) inspectorMap[p.id] = p.full_name
    }
  }

  // ── Aggregate ────────────────────────────────────────────────────────────────

  // WO status counts + KPIs
  const woStatusCounts: Record<string, number> = {}
  let totalWoCost = 0
  for (const wo of woAll ?? []) {
    woStatusCounts[wo.status] = (woStatusCounts[wo.status] ?? 0) + 1
    totalWoCost += wo.total_cost ?? 0
  }
  const totalWOs = Object.values(woStatusCounts).reduce((a, b) => a + b, 0)
  const closedWOs = woStatusCounts['closed'] ?? 0
  const activeWOs = totalWOs - (woStatusCounts['closed'] ?? 0) - (woStatusCounts['cancelled'] ?? 0)
  const completionRate = totalWOs > 0 ? Math.round((closedWOs / totalWOs) * 100) : 0

  // Overdue count
  const now = new Date()
  const overdueCount = (woAll ?? []).filter((wo) =>
    wo.due_date && new Date(wo.due_date) < now &&
    wo.status !== 'closed' && wo.status !== 'cancelled'
  ).length

  // Cost by project (top 10)
  const costByProjectMap: Record<string, { number: string; name: string; total_cost: number; wo_count: number }> = {}
  for (const wo of woAll ?? []) {
    if (!wo.project_id || !projectMap[wo.project_id]) continue
    const proj = projectMap[wo.project_id]
    if (!costByProjectMap[wo.project_id]) {
      costByProjectMap[wo.project_id] = { ...proj, total_cost: 0, wo_count: 0 }
    }
    costByProjectMap[wo.project_id].total_cost += wo.total_cost ?? 0
    costByProjectMap[wo.project_id].wo_count += 1
  }
  const costByProject = Object.values(costByProjectMap)
    .sort((a, b) => b.total_cost - a.total_cost)
    .slice(0, 10)

  // Monthly WO trend (last 6 months)
  const monthlyMap: Record<string, { created: number; closed: number }> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[key] = { created: 0, closed: 0 }
  }
  for (const wo of woRecent ?? []) {
    const ck = new Date(wo.created_at)
    const cKey = `${ck.getFullYear()}-${String(ck.getMonth() + 1).padStart(2, '0')}`
    if (monthlyMap[cKey]) monthlyMap[cKey].created++
    if (wo.closed_at) {
      const dk = new Date(wo.closed_at)
      const dKey = `${dk.getFullYear()}-${String(dk.getMonth() + 1).padStart(2, '0')}`
      if (monthlyMap[dKey]) monthlyMap[dKey].closed++
    }
  }
  const woMonthlyTrend = Object.entries(monthlyMap).map(([key, val]) => {
    const [yr, mo] = key.split('-')
    const d = new Date(parseInt(yr), parseInt(mo) - 1, 1)
    return { month: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }), ...val }
  })

  // Pothole resolution by severity
  const phBySev: Record<string, { total: number; resolved: number; totalDays: number }> = {}
  let openPotholes = 0
  const closedPotholeStatuses = ['repaired', 'closed']
  for (const ph of potholes ?? []) {
    const sev = (ph.severity as string) ?? 'unknown'
    if (!phBySev[sev]) phBySev[sev] = { total: 0, resolved: 0, totalDays: 0 }
    phBySev[sev].total++
    if (!closedPotholeStatuses.includes(ph.status)) openPotholes++
    if (ph.repaired_at) {
      phBySev[sev].resolved++
      phBySev[sev].totalDays +=
        (new Date(ph.repaired_at).getTime() - new Date(ph.created_at).getTime()) / 86_400_000
    }
  }
  const severityOrder = ['critical', 'high', 'medium', 'low']
  const potholeResolution = severityOrder
    .filter((s) => phBySev[s])
    .map((s) => ({
      severity: s,
      total: phBySev[s].total,
      resolved: phBySev[s].resolved,
      avg_days: phBySev[s].resolved > 0
        ? Math.round((phBySev[s].totalDays / phBySev[s].resolved) * 10) / 10
        : null,
    }))

  const allResolvedPh = (potholes ?? []).filter((p) => p.repaired_at)
  const avgResolutionDays = allResolvedPh.length > 0
    ? Math.round(
        allResolvedPh.reduce((sum, p) =>
          sum + (new Date(p.repaired_at!).getTime() - new Date(p.created_at).getTime()) / 86_400_000
        , 0) / allResolvedPh.length * 10
      ) / 10
    : null

  // Inspector performance
  const inspPerfMap: Record<string, { total: number; completed: number; totalScore: number; scoreCount: number }> = {}
  for (const insp of inspections ?? []) {
    const id = insp.inspector_id as string
    if (!inspPerfMap[id]) inspPerfMap[id] = { total: 0, completed: 0, totalScore: 0, scoreCount: 0 }
    inspPerfMap[id].total++
    if (['completed', 'approved'].includes(insp.status)) inspPerfMap[id].completed++
    if (insp.score != null) {
      inspPerfMap[id].totalScore += insp.score
      inspPerfMap[id].scoreCount++
    }
  }
  const inspectorPerf = Object.entries(inspPerfMap)
    .map(([id, d]) => ({
      inspector_name: inspectorMap[id] ?? 'Unknown',
      total: d.total,
      completed: d.completed,
      completion_rate: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
      avg_score: d.scoreCount > 0 ? Math.round(d.totalScore / d.scoreCount) : null,
    }))
    .sort((a, b) => b.total - a.total)

  // Contract value
  const activeContractValue = (contracts ?? [])
    .filter((c) => c.status === 'active')
    .reduce((sum, c) => sum + (c.value ?? 0), 0)

  const data: ReportsData = {
    totalWoCost,
    completionRate,
    activeWOs,
    overdueCount,
    openPotholes,
    avgResolutionDays,
    activeContractValue,
    woStatusCounts,
    costByProject,
    woMonthlyTrend,
    potholeResolution,
    inspectorPerf,
  }

  return <ReportsClient data={data} />
}
