import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

function isFmUser(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager', 'fm_contributor', 'fm_viewer', 'fm_worker'].includes(cap)
  return ['admin', 'supervisor', 'inspector', 'viewer'].includes(role)
}

function isFmAdmin(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager'].includes(cap)
  return ['admin', 'supervisor'].includes(role)
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmUser(session.capability, session.role)) return err('Forbidden', 403)

    const supabase = createClient()
    const orgId = session.orgId
    const now = new Date()
    const nowISO = now.toISOString()

    // ── 1. Properties with latest completed inspection scores ──────────────────
    const { data: completedInspections, error: inspErr } = await supabase
      .from('fm_inspections')
      .select('id, property_id, score, completed_at, fm_properties(id, name)')
      .eq('org_id', orgId)
      .eq('status', 'COMPLETED')
      .is('deleted_at', null)
      .order('completed_at', { ascending: false })
      .limit(500)

    if (inspErr) return err(inspErr.message)

    // Deduplicate: take most recent per property
    const seenProps = new Set<string>()
    const propertiesWithScores: Array<{
      property_id: string
      property_name: string
      score: number | null
      completed_at: string | null
      inspection_id: string
    }> = []
    for (const insp of (completedInspections ?? [])) {
      const propId = insp.property_id as string
      if (!propId || seenProps.has(propId)) continue
      seenProps.add(propId)
      propertiesWithScores.push({
        property_id: propId,
        property_name: (insp.fm_properties as unknown as { id: string; name: string } | null)?.name ?? '—',
        score: insp.score as number | null,
        completed_at: insp.completed_at as string | null,
        inspection_id: insp.id,
      })
    }

    // ── 2. Total property count ───────────────────────────────────────────────
    const { data: allProps, error: propsErr } = await supabase
      .from('fm_properties')
      .select('id', { count: 'exact' })
      .eq('org_id', orgId)
      .is('deleted_at', null)

    if (propsErr) return err(propsErr.message)
    const totalProperties = (allProps ?? []).length

    // ── 3. Life safety / ADA / HIGH severity deficiencies ────────────────────
    const completedInspIds = (completedInspections ?? []).map(i => i.id)
    const inspMap: Record<string, { property_id: string; property_name: string }> = {}
    for (const insp of (completedInspections ?? [])) {
      inspMap[insp.id] = {
        property_id: insp.property_id as string,
        property_name: (insp.fm_properties as unknown as { id: string; name: string } | null)?.name ?? '—',
      }
    }

    let lifeSafetyDeficiencies: Array<{
      id: string
      key: string | null
      label: string | null
      result: string | null
      severity: string | null
      rating: number | null
      notes: string | null
      cost_estimate: number | null
      inspection_id: string
      property_id: string | null
      property_name: string
      work_order_id: string | null
      wo_status: string | null
      wo_title: string | null
    }> = []

    if (completedInspIds.length > 0) {
      // Fetch in batches of 400 to stay within PostgREST limits
      const batchIds = completedInspIds.slice(0, 400)

      const { data: allItems, error: itemsErr } = await supabase
        .from('fm_checklist_item_responses')
        .select('id, key, label, result, severity, rating, notes, cost_estimate, inspection_id')
        .eq('org_id', orgId)
        .in('inspection_id', batchIds)

      if (itemsErr) return err(itemsErr.message)

      const isLifeSafety = (item: {
        key: string | null
        result: string | null
        severity: string | null
        rating: number | null
      }): boolean => {
        const key = item.key ?? ''
        const isLsKey = /^ls_\d+c$/.test(key)
        const isAdaKey = /^ad_\d+c$/.test(key)
        const isHigh = item.severity === 'HIGH'
        if (!isLsKey && !isAdaKey && !isHigh) return false
        // Must have a failure indicator
        const hasFail =
          item.result === 'fail' ||
          item.result === 'FAIL' ||
          item.severity === 'HIGH' ||
          (item.rating !== null && item.rating !== undefined && item.rating <= 2)
        return hasFail
      }

      const lsItems = (allItems ?? []).filter(isLifeSafety)

      if (lsItems.length > 0) {
        const lsItemIds = lsItems.map(i => i.id)

        const { data: relatedWos, error: woErr } = await supabase
          .from('fm_work_orders')
          .select('id, status, title, checklist_item_id, priority')
          .eq('org_id', orgId)
          .in('checklist_item_id', lsItemIds)
          .is('deleted_at', null)

        if (woErr) return err(woErr.message)

        const woByItemId: Record<string, { id: string; status: string; title: string }> = {}
        for (const wo of (relatedWos ?? [])) {
          const cid = wo.checklist_item_id as string
          if (!cid) continue
          // Keep the most recent / active WO per item (prefer non-completed)
          const existing = woByItemId[cid]
          if (!existing || existing.status === 'COMPLETED') {
            woByItemId[cid] = { id: wo.id, status: wo.status, title: wo.title }
          }
        }

        lifeSafetyDeficiencies = lsItems
          .filter(item => {
            const wo = woByItemId[item.id]
            return !wo || wo.status !== 'COMPLETED'
          })
          .map(item => ({
            id: item.id,
            key: item.key as string | null,
            label: item.label as string | null,
            result: item.result as string | null,
            severity: item.severity as string | null,
            rating: item.rating as number | null,
            notes: item.notes as string | null,
            cost_estimate: item.cost_estimate as number | null,
            inspection_id: item.inspection_id as string,
            property_id: inspMap[item.inspection_id as string]?.property_id ?? null,
            property_name: inspMap[item.inspection_id as string]?.property_name ?? '—',
            work_order_id: woByItemId[item.id]?.id ?? null,
            wo_status: woByItemId[item.id]?.status ?? null,
            wo_title: woByItemId[item.id]?.title ?? null,
          }))
      }
    }

    // ── 4. WO trend — last 12 months ─────────────────────────────────────────
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString()

    const { data: woTrendData, error: woTrendErr } = await supabase
      .from('fm_work_orders')
      .select('id, status, created_at, completed_at')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .gte('created_at', twelveMonthsAgo)

    if (woTrendErr) return err(woTrendErr.message)

    const trendMap: Record<string, { open: number; completed: number }> = {}
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      const key = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
      trendMap[key] = { open: 0, completed: 0 }
    }
    for (const wo of (woTrendData ?? [])) {
      const d = new Date(wo.created_at as string)
      const key = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
      if (!trendMap[key]) continue
      trendMap[key].open++
      if (wo.status === 'COMPLETED' && wo.completed_at) {
        const cd = new Date(wo.completed_at as string)
        const ckey = cd.toLocaleString('en-US', { month: 'short' }).toUpperCase()
        if (trendMap[ckey]) trendMap[ckey].completed++
      }
    }
    const woTrend = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      const key = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
      return { month: key, open: trendMap[key]?.open ?? 0, completed: trendMap[key]?.completed ?? 0 }
    })

    // ── 5. WO by priority (open/in-progress only) ─────────────────────────────
    const { data: openWoData, error: openWoErr } = await supabase
      .from('fm_work_orders')
      .select('id, priority, status, due_date')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .neq('status', 'COMPLETED')

    if (openWoErr) return err(openWoErr.message)

    const woByPriority = {
      HIGH:   0,
      MEDIUM: 0,
      LOW:    0,
      NONE:   0,
    }
    for (const wo of (openWoData ?? [])) {
      const p = (wo.priority as string | null) ?? 'NONE'
      if (p === 'HIGH') woByPriority.HIGH++
      else if (p === 'MEDIUM') woByPriority.MEDIUM++
      else if (p === 'LOW') woByPriority.LOW++
      else woByPriority.NONE++
    }

    // ── 6. KPIs ───────────────────────────────────────────────────────────────
    const scoredProps = propertiesWithScores.filter(p => p.score !== null)
    const avgPortfolioScore =
      scoredProps.length > 0
        ? Math.round(scoredProps.reduce((s, p) => s + (p.score ?? 0), 0) / scoredProps.length * 10) / 10
        : 0

    const openWos = (openWoData ?? []).filter(wo =>
      wo.status === 'OPEN' || wo.status === 'IN_PROGRESS'
    ).length

    const overdueWos = (openWoData ?? []).filter(wo =>
      wo.due_date && (wo.due_date as string) < nowISO
    ).length

    return NextResponse.json({
      kpis: {
        totalProperties,
        avgPortfolioScore,
        openDeficiencies: lifeSafetyDeficiencies.length,
        lifeSafetyCount: lifeSafetyDeficiencies.length,
        openWos,
        overdueWos,
      },
      propertiesWithScores,
      lifeSafetyDeficiencies,
      woTrend,
      woByPriority,
      session: {
        capability: session.capability,
        role: session.role,
      },
    })
  } catch (e) { return caught(e) }
}
