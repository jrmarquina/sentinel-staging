import ScheduleClient from './schedule-client'

export const metadata = { title: 'Schedule — SIMS' }

// New unified FM scheduling workspace (calendar roadmap, phase 1). Reads the
// single /api/fm/schedule model. Built alongside the existing dashboard
// Schedule widget — that widget is untouched until this is proven.
export default function SchedulePage() {
  return <ScheduleClient />
}
