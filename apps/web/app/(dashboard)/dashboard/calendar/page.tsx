import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CalendarPageClient from './calendar-client'
import type { Database } from '@sentinel/db'

export const metadata = { title: 'Calendar — SIMS' }

type CalendarEventRow = Database['public']['Tables']['calendar_events']['Row']
type ContractRow = Pick<Database['public']['Tables']['contracts']['Row'], 'id' | 'number' | 'title' | 'end_date'>

export default async function CalendarPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orgData } = await supabase
    .from('user_roles').select('org_id, role').eq('user_id', user.id).limit(1).single()
  const orgId  = (orgData as { org_id: string; role: string } | null)?.org_id
  const role   = (orgData as { org_id: string; role: string } | null)?.role ?? ''
  const canReschedule = ['admin', 'supervisor'].includes(role)

  if (!orgId) return <CalendarPageClient events={[]} canReschedule={false} />

  const admin = createAdminClient()
  const [{ data: eventsData }, { data: contractsData }] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('*')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('start_at', { ascending: true }),
    admin
      .from('contracts')
      .select('id, number, title, end_date')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .in('status', ['active', 'pending_approval'])
      .not('end_date', 'is', null),
  ])

  const calEvents = ((eventsData as CalendarEventRow[] | null) ?? []).map((ev) => ({
    id:              ev.id,
    title:           ev.title,
    start:           ev.start_at,
    end:             ev.end_at ?? undefined,
    allDay:          ev.all_day,
    backgroundColor: ev.color ?? undefined,
    extendedProps: {
      event_type:    ev.event_type,
      related_id:    ev.related_id    ?? undefined,
      related_table: ev.related_table ?? undefined,
    },
  }))

  const contractEvents = ((contractsData as ContractRow[] | null) ?? []).map((c) => ({
    id:              `contract-end-${c.id}`,
    title:           c.title,
    start:           c.end_date!,
    allDay:          true,
    backgroundColor: '#EF4444',
    borderColor:     '#DC2626',
    textColor:       '#ffffff',
    extendedProps: {
      related_id:    c.id,
      related_table: 'contracts',
    },
  }))

  return <CalendarPageClient events={[...calEvents, ...contractEvents]} canReschedule={canReschedule} />
}
