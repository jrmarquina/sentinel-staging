// Edge Function: nightly-calendar
// Runs at 02:00 AST via Supabase cron
// Purpose: generate upcoming event notifications (24h, 48h, 7d)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HORIZONS = [
  { label: '24h', hours: 24 },
  { label: '48h', hours: 48 },
  { label: '7d', hours: 168 },
]

Deno.serve(async (req) => {
  // Verify secret to prevent unauthorized invocation
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date()
  let created = 0

  for (const horizon of HORIZONS) {
    const windowStart = new Date(now.getTime() + horizon.hours * 3600 * 1000 - 30 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + horizon.hours * 3600 * 1000 + 30 * 60 * 1000)

    const { data: events } = await supabase
      .from('calendar_events')
      .select('id, org_id, title, event_type, start_at')
      .is('deleted_at', null)
      .gte('start_at', windowStart.toISOString())
      .lte('start_at', windowEnd.toISOString())

    if (!events?.length) continue

    for (const event of events) {
      // Get all users in this org who should be notified (non-vendor roles)
      const { data: users } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('org_id', event.org_id)
        .in('role', ['admin', 'supervisor', 'inspector'])

      if (!users?.length) continue

      const notifications = users.map((u) => ({
        org_id: event.org_id,
        user_id: u.user_id,
        title: `Upcoming: ${event.title}`,
        body: `Scheduled in ${horizon.label} — ${new Date(event.start_at).toLocaleString('en-US', { timeZone: 'America/Puerto_Rico' })}`,
        related_id: event.id,
        related_table: 'calendar_events',
      }))

      const { error } = await supabase.from('notifications').insert(notifications)
      if (!error) created += notifications.length
    }
  }

  return new Response(JSON.stringify({ ok: true, notifications_created: created }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
