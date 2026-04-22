'use client'

import { CalendarView, type CalendarEvent } from '@/components/calendar/CalendarView'
import { useRouter } from 'next/navigation'

interface CalendarPageClientProps {
  events: CalendarEvent[]
  canReschedule: boolean
}

// Map DB table names → URL route segments
const TABLE_TO_ROUTE: Record<string, string> = {
  work_orders:     'work-orders',
  projects:        'projects',
  inspections:     'inspections',
  contracts:       'contracts',
  pothole_reports: 'potholes',
}

export default function CalendarPageClient({ events, canReschedule }: CalendarPageClientProps) {
  const router = useRouter()

  function handleEventClick(eventId: string, relatedId?: string, relatedTable?: string) {
    if (relatedId && relatedTable) {
      const route = TABLE_TO_ROUTE[relatedTable] ?? relatedTable.replace(/_/g, '-')
      router.push(`/dashboard/${route}/${relatedId}`)
    }
  }

  async function handleEventDrop(eventId: string, newStart: Date, newEnd: Date | null) {
    const res = await fetch(`/api/calendar-events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_at: newStart.toISOString(), end_at: newEnd?.toISOString() }),
    })
    if (!res.ok) console.error('Failed to update event')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem-3rem)] gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Calendar</h1>
        <p className="text-sm text-slate-500">
          Work orders, inspections, project deadlines, and scheduled events
        </p>
      </div>
      <div className="flex-1 min-h-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 overflow-hidden">
        <CalendarView
          events={events}
          canReschedule={canReschedule}
          onEventClick={handleEventClick}
          onEventDrop={handleEventDrop}
        />
      </div>
    </div>
  )
}
