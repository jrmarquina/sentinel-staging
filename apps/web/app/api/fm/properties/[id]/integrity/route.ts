import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'

function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()

    const [propRes, assetsRes, floorsRes, floorsWithPlansRes, attachmentsRes, inspectionsRes] = await Promise.all([
      supabase.from('fm_properties').select('id').eq('id', params.id).eq('org_id', session.orgId).is('deleted_at', null).single(),
      supabase.from('fm_assets').select('id', { count: 'exact', head: true }).eq('property_id', params.id).is('deleted_at', null),
      supabase.from('fm_floors').select('id', { count: 'exact', head: true }).eq('property_id', params.id),
      supabase.from('fm_floors').select('id, fm_floor_plans(count)').eq('property_id', params.id),
      supabase.from('fm_attachments').select('id', { count: 'exact', head: true }).eq('property_id', params.id),
      supabase.from('fm_inspections').select('id', { count: 'exact', head: true }).eq('property_id', params.id).is('deleted_at', null),
    ])

    if (propRes.error || !propRes.data) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    const gaps: { type: string; message: string; severity: 'CRITICAL' | 'WARNING'; tab: string }[] = []

    if ((assetsRes.count ?? 0) === 0)
      gaps.push({ type: 'MISSING_ASSETS', message: 'No assets registered for this site.', severity: 'CRITICAL', tab: 'assets' })

    if ((floorsRes.count ?? 0) === 0) {
      gaps.push({ type: 'MISSING_FLOORS', message: 'No floors defined. Cannot link scale blueprints.', severity: 'CRITICAL', tab: 'floorplans' })
    } else {
      const floorsWithoutPlans = (floorsWithPlansRes.data ?? []).filter((f: any) => (f.fm_floor_plans?.length ?? 0) === 0)
      if (floorsWithoutPlans.length > 0)
        gaps.push({ type: 'MISSING_PLANS', message: `${floorsWithoutPlans.length} floor(s) missing blueprints.`, severity: 'WARNING', tab: 'floorplans' })
    }

    if ((attachmentsRes.count ?? 0) === 0)
      gaps.push({ type: 'NO_DOCUMENTS', message: 'Facility has no uploaded documentation or contracts.', severity: 'WARNING', tab: 'documents' })

    if ((inspectionsRes.count ?? 0) === 0)
      gaps.push({ type: 'NO_HISTORY', message: 'Zero inspection records found.', severity: 'WARNING', tab: 'overview' })

    const score = Math.max(0, 100 - (gaps.filter(g => g.severity === 'CRITICAL').length * 20) - (gaps.filter(g => g.severity === 'WARNING').length * 10))
    return NextResponse.json({ score, gaps })
  } catch (e) { return caught(e) }
}
