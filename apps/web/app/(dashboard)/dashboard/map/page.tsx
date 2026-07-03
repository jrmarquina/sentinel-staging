import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Database } from '@sentinel/db'

export const metadata = { title: 'Map — SIMS' }

// Must be dynamic with ssr:false — MapLibre uses canvas which can't SSR
const MapClientPage = dynamic(
  () => import('./map-client').then((mod) => mod.MapClientPage),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 rounded-lg">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
)

const DELAY_COLOR: Record<string, string> = {
  on_track: '#22c55e',  // green
  at_risk:  '#f59e0b',  // amber
  overdue:  '#ef4444',  // red
  closed:   '#94a3b8',  // slate
  unknown:  '#cbd5e1',  // light slate
}

export default async function MapPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orgData } = await supabase
    .from('user_roles')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  // Fetch project pins (uses our view)
  const { data: projects } = orgData
    ? await supabase
        .from('projects')
        .select('id, name, code, status, latitude, longitude, planned_end_date')
        .eq('org_id', orgData.org_id)
        .is('deleted_at', null)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
    : { data: [] }

  // Fetch pothole pins
  const { data: potholes } = orgData
    ? await supabase
        .from('pothole_reports')
        .select('id, title, status, severity, latitude, longitude')
        .eq('org_id', orgData.org_id)
        .is('deleted_at', null)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .in('status', ['reported', 'verified', 'assigned', 'in_repair', 'recurring'])
    : { data: [] }

  // Fetch work order pins
  const { data: workOrdersGeo } = orgData
    ? await supabase
        .from('work_orders')
        .select('id, number, title, status, priority, latitude, longitude')
        .eq('org_id', orgData.org_id)
        .is('deleted_at', null)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .in('status', ['open', 'in_progress', 'on_hold'])
    : { data: [] }

  type ProjectRow = Pick<Database['public']['Tables']['projects']['Row'],
    'id' | 'name' | 'code' | 'status' | 'latitude' | 'longitude' | 'planned_end_date'>

  function getDelayStatus(p: ProjectRow): string {
    if (p.status === 'completed' || p.status === 'cancelled') return 'closed'
    if (!p.planned_end_date) return 'unknown'
    const end = new Date(p.planned_end_date)
    const now = new Date()
    if (end < now) return 'overdue'
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    if (end <= twoWeeks) return 'at_risk'
    return 'on_track'
  }

  const projectMarkers = (projects ?? []).map((p) => {
    const delay = getDelayStatus(p as ProjectRow)
    return {
      id:     `proj-${p.id}`,
      lat:    p.latitude as number,
      lng:    p.longitude as number,
      color:  DELAY_COLOR[delay],
      label:  `[${p.code}] ${p.name}`,
      type:   'project' as const,
      href:   `/dashboard/projects/${p.id}`,
      delay,
    }
  })

  const POTHOLE_SEVERITY_COLOR: Record<string, string> = {
    critical: '#dc2626',
    high:     '#ea580c',
    medium:   '#d97706',
    low:      '#94a3b8',
  }

  const potholeMarkers = (potholes ?? []).map((ph) => ({
    id:    `ph-${ph.id}`,
    lat:   ph.latitude as number,
    lng:   ph.longitude as number,
    color: POTHOLE_SEVERITY_COLOR[(ph.severity as string)] ?? '#94a3b8',
    label: `${ph.severity ?? ''} ${ph.title}`,
    type:  'pothole' as const,
    href:  `/dashboard/potholes/${ph.id}`,
  }))

  const WO_PRIORITY_COLOR: Record<string, string> = {
    P1: '#7c3aed',  // violet — P1 urgent
    P2: '#8b5cf6',
    P3: '#a78bfa',
    P4: '#c4b5fd',
  }

  const workOrderMarkers = (workOrdersGeo ?? []).map((wo) => ({
    id:       `wo-${wo.id}`,
    lat:      wo.latitude as number,
    lng:      wo.longitude as number,
    color:    WO_PRIORITY_COLOR[(wo.priority as string)] ?? '#a78bfa',
    label:    `[${wo.number}] ${wo.title}`,
    type:     'work_order' as const,
    href:     `/dashboard/work-orders/${wo.id}`,
    priority: wo.priority as string,
  }))

  return (
    <div className="flex flex-col h-[calc(100vh-4rem-3rem)] gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Map</h1>
        <p className="text-sm text-slate-500">Guaynabo, Puerto Rico</p>
      </div>

      <div className="flex-1 min-h-0">
        <MapClientPage
          projectMarkers={projectMarkers}
          potholeMarkers={potholeMarkers}
          workOrderMarkers={workOrderMarkers}
          wardGeoJsonUrl="/data/guaynabo-wards.geojson"
          className="w-full h-full"
        />
      </div>
    </div>
  )
}
