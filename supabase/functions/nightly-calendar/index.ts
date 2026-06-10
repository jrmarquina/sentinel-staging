// Edge Function: nightly-calendar
// Runs at 02:00 AST via Supabase cron
// Purpose:
//   1. Generate next occurrence for recurring events (lookahead 60 days)
//   2. Insert notification rows for events due in 24h, 48h, and 7 days

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { RRule } from 'https://esm.sh/rrule@2.8.1'

const HORIZONS = [
  { label: '24h', hours: 24 },
  { label: '48h', hours: 48 },
  { label: '7d', hours: 168 },
]

const LOOKAHEAD_DAYS = 60

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date()
  let recurringCreated = 0
  let notificationsCreated = 0

  // ── Phase 1: Generate next occurrences for recurring events ──────────────

  const lookaheadCutoff = new Date(now.getTime() + LOOKAHEAD_DAYS * 86400 * 1000)

  // Fetch all parent recurring events
  const { data: parents } = await supabase
    .from('calendar_events')
    .select('id, org_id, title, start_at, end_at, event_type, related_id, related_table, color, all_day, recurrence_rule')
    .is('deleted_at', null)
    .is('parent_event_id', null)
    .not('recurrence_rule', 'is', null)

  for (const parent of parents ?? []) {
    // Find the latest instance (or the parent itself if no instances yet)
    const { data: latestInstances } = await supabase
      .from('calendar_events')
      .select('start_at')
      .eq('parent_event_id', parent.id)
      .is('deleted_at', null)
      .order('start_at', { ascending: false })
      .limit(1)

    // Determine the base date to calculate next occurrence from
    const latestStart = latestInstances?.[0]?.start_at ?? parent.start_at
    const baseDate = new Date(latestStart)

    // Also check if any future instance already exists within the lookahead window
    const { count: futureCount } = await supabase
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('parent_event_id', parent.id)
      .is('deleted_at', null)
      .gt('start_at', now.toISOString())
      .lte('start_at', lookaheadCutoff.toISOString())

    if ((futureCount ?? 0) > 0) continue  // already has upcoming instances

    try {
      const rule = RRule.fromString(parent.recurrence_rule!)
      // Get the next occurrence strictly after the latest known start
      const afterDate = new Date(baseDate.getTime() + 1000) // 1 second after
      const nextDate = rule.after(afterDate)

      if (!nextDate || nextDate > lookaheadCutoff) continue

      // Calculate duration from original event to preserve it
      const originalStart = new Date(parent.start_at)
      const originalEnd = parent.end_at ? new Date(parent.end_at) : null
      const durationMs = originalEnd ? originalEnd.getTime() - originalStart.getTime() : null

      const newEnd = durationMs ? new Date(nextDate.getTime() + durationMs) : null

      const { error } = await supabase.from('calendar_events').insert({
        org_id:        parent.org_id,
        title:         parent.title,
        start_at:      nextDate.toISOString(),
        end_at:        newEnd?.toISOString() ?? null,
        event_type:    parent.event_type,
        related_id:    parent.related_id ?? null,
        related_table: parent.related_table ?? null,
        color:         parent.color ?? null,
        all_day:       parent.all_day,
        parent_event_id: parent.id,
      })

      if (!error) recurringCreated++
    } catch {
      // Malformed RRULE — skip silently
    }
  }

  // ── Phase 2: Notifications for upcoming events ────────────────────────────

  for (const horizon of HORIZONS) {
    const windowStart = new Date(now.getTime() + horizon.hours * 3600 * 1000 - 30 * 60 * 1000)
    const windowEnd   = new Date(now.getTime() + horizon.hours * 3600 * 1000 + 30 * 60 * 1000)

    const { data: events } = await supabase
      .from('calendar_events')
      .select('id, org_id, title, event_type, start_at')
      .is('deleted_at', null)
      .gte('start_at', windowStart.toISOString())
      .lte('start_at', windowEnd.toISOString())

    if (!events?.length) continue

    for (const event of events) {
      const { data: users } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('org_id', event.org_id)
        .in('role', ['admin', 'supervisor', 'inspector'])

      if (!users?.length) continue

      const notifications = users.map((u) => ({
        org_id:        event.org_id,
        user_id:       u.user_id,
        title:         `Upcoming: ${event.title}`,
        body:          `Scheduled in ${horizon.label} — ${new Date(event.start_at).toLocaleString('en-US', { timeZone: 'America/Puerto_Rico' })}`,
        related_id:    event.id,
        related_table: 'calendar_events',
      }))

      const { error } = await supabase.from('notifications').insert(notifications)
      if (!error) notificationsCreated += notifications.length
    }
  }

  return new Response(
    JSON.stringify({ ok: true, recurring_created: recurringCreated, notifications_created: notificationsCreated }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
