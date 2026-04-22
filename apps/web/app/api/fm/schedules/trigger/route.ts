import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

/**
 * POST /api/fm/schedules/trigger
 *
 * Manually trigger schedule processing for testing.
 * In production, schedule processing runs via the Supabase cron Edge Function.
 * This endpoint finds all active schedules due for processing and triggers them.
 */
export async function POST() {
  try {
    const session = await requireRole(['admin'])
    const supabase = createClient()

    // Fetch all active schedules for this org
    const { data: schedules, error } = await supabase
      .from('fm_schedules')
      .select('id, property_id, template_id, cron, frequency')
      .eq('org_id', session.orgId)
      .eq('active', true)
      .is('deleted_at', null)

    if (error) return err(error.message)

    // For each active schedule, create a pending inspection if not already created today
    const today = new Date().toISOString().split('T')[0]
    let triggered = 0

    for (const schedule of schedules ?? []) {
      // Check if an inspection was already created today for this schedule
      const { count } = await supabase
        .from('fm_inspections')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', session.orgId)
        .eq('property_id', schedule.property_id)
        .eq('template_id', schedule.template_id)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .then(r => ({ count: r.count ?? 0 }))

      if (count === 0) {
        await supabase.from('fm_inspections').insert({
          template_id: schedule.template_id,
          property_id: schedule.property_id,
          inspector_id: session.userId,
          status: 'DRAFT',
          started_at: new Date().toISOString(),
          org_id: session.orgId,
        })
        triggered++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Manual schedule processing triggered. ${triggered} inspection(s) created.`,
    })
  } catch (e) { return caught(e) }
}
