'use client'

import { useRef, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventInput, EventClickArg, DateSelectArg, EventDropArg } from '@fullcalendar/core'
import { EVENT_COLORS } from '@sentinel/shared'

export interface CalendarEvent extends EventInput {
  extendedProps?: {
    event_type?: keyof typeof EVENT_COLORS
    related_id?: string
    related_table?: string
  }
}

interface CalendarViewProps {
  events: CalendarEvent[]
  canReschedule?: boolean
  onEventClick?: (eventId: string, relatedId?: string, relatedTable?: string) => void
  onEventDrop?: (eventId: string, newStart: Date, newEnd: Date | null) => void
  onDateSelect?: (start: Date, end: Date) => void
}

export function CalendarView({
  events,
  canReschedule = false,
  onEventClick,
  onEventDrop,
  onDateSelect,
}: CalendarViewProps) {
  const calendarRef = useRef<FullCalendar>(null)

  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      const { id, extendedProps } = info.event
      onEventClick?.(id, extendedProps?.related_id, extendedProps?.related_table)
    },
    [onEventClick]
  )

  const handleEventDrop = useCallback(
    (info: EventDropArg) => {
      if (!canReschedule) {
        info.revert()
        return
      }
      const { id, start, end } = info.event
      if (!start) return
      onEventDrop?.(id, start, end)
    },
    [canReschedule, onEventDrop]
  )

  const handleDateSelect = useCallback(
    (info: DateSelectArg) => {
      onDateSelect?.(info.start, info.end)
    },
    [onDateSelect]
  )

  // Color events by type
  const coloredEvents = events.map((ev) => ({
    ...ev,
    backgroundColor:
      (ev as { backgroundColor?: string }).backgroundColor ??
      EVENT_COLORS[((ev.extendedProps?.event_type) as keyof typeof EVENT_COLORS) ?? 'work_order'],
    borderColor: 'transparent' as const,
    textColor: '#ffffff' as const,
  }))

  return (
    <div className="fc-sentinel h-full">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,listWeek',
        }}
        events={coloredEvents}
        editable={canReschedule}
        selectable={!!onDateSelect}
        selectMirror
        dayMaxEvents
        weekends
        height="100%"
        eventClick={handleEventClick}
        eventDrop={handleEventDrop}
        select={handleDateSelect}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: 'short' }}
        nowIndicator
      />

      <style>{`
        .fc-sentinel .fc-toolbar-title { font-size: 1rem; font-weight: 600; }
        .fc-sentinel .fc-button { background: #3B82F6; border-color: #3B82F6; border-radius: 0.5rem; font-size: 0.75rem; }
        .fc-sentinel .fc-button:hover { background: #2563EB; border-color: #2563EB; }
        .fc-sentinel .fc-button-active { background: #1D4ED8 !important; border-color: #1D4ED8 !important; }
        .fc-sentinel .fc-event { border-radius: 4px; font-size: 0.75rem; }
        .fc-sentinel .fc-daygrid-event { padding: 1px 4px; }
      `}</style>
    </div>
  )
}
