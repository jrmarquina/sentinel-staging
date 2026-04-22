'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapView, type MarkerSpec, type HeatmapPoint } from '@/components/map/MapView'
import { useMapPrefs } from '@/lib/map-prefs'

interface ExtendedMarker extends MarkerSpec {
  type: 'project' | 'pothole' | 'work_order'
  href: string
  delay?: string
  priority?: string
}

interface Props {
  projectMarkers:   ExtendedMarker[]
  potholeMarkers:   ExtendedMarker[]
  workOrderMarkers: ExtendedMarker[]
  wardGeoJsonUrl?:  string
  className?:       string
}

const POTHOLE_WEIGHT:  Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
const DELAY_WEIGHT:    Record<string, number> = { overdue: 4, at_risk: 2, on_track: 1, closed: 0 }
const PRIORITY_WEIGHT: Record<string, number> = { P1: 4, P2: 3, P3: 2, P4: 1 }

export function MapClientPage({ projectMarkers, potholeMarkers, workOrderMarkers, wardGeoJsonUrl, className }: Props) {
  const router = useRouter()
  const { prefs } = useMapPrefs()

  const [showProjects,   setShowProjects]   = useState(true)
  const [showPotholes,   setShowPotholes]   = useState(true)
  const [showWorkOrders, setShowWorkOrders] = useState(true)

  const activeMarkers: MarkerSpec[] = [
    ...(showProjects   ? projectMarkers   : []),
    ...(showPotholes   ? potholeMarkers   : []),
    ...(showWorkOrders ? workOrderMarkers : []),
  ].map((m) => ({ id: m.id, lat: m.lat, lng: m.lng, color: m.color, label: m.label }))

  const heatmapPoints: HeatmapPoint[] = [
    ...(showPotholes   ? potholeMarkers.map((m) => {
      const sev = m.label?.toLowerCase().split(' ')[0] ?? ''
      return { lat: m.lat, lng: m.lng, weight: POTHOLE_WEIGHT[sev] ?? 2 }
    }) : []),
    ...(showProjects   ? projectMarkers
      .filter((m) => m.delay !== 'closed')
      .map((m) => ({ lat: m.lat, lng: m.lng, weight: DELAY_WEIGHT[m.delay ?? 'on_track'] ?? 1 }))
    : []),
    ...(showWorkOrders ? workOrderMarkers
      .map((m) => ({ lat: m.lat, lng: m.lng, weight: PRIORITY_WEIGHT[m.priority ?? 'P3'] ?? 2 }))
    : []),
  ]

  const allExtended = [...projectMarkers, ...potholeMarkers, ...workOrderMarkers]
  function handleMarkerClick(id: string) {
    const marker = allExtended.find((m) => m.id === id)
    if (marker?.href) router.push(marker.href)
  }

  const layers = [
    {
      key:     'projects' as const,
      label:   'Projects',
      count:   projectMarkers.length,
      active:  showProjects,
      toggle:  () => setShowProjects((v) => !v),
      swatches: ['#22c55e', '#f59e0b', '#ef4444'],
    },
    {
      key:     'work_orders' as const,
      label:   'Work Orders',
      count:   workOrderMarkers.length,
      active:  showWorkOrders,
      toggle:  () => setShowWorkOrders((v) => !v),
      swatches: ['#7c3aed', '#a78bfa'],
    },
    {
      key:     'potholes' as const,
      label:   'Damage Reports',
      count:   potholeMarkers.length,
      active:  showPotholes,
      toggle:  () => setShowPotholes((v) => !v),
      swatches: ['#dc2626', '#ea580c', '#d97706'],
    },
  ]

  return (
    <div className={`relative ${className ?? 'w-full h-full'}`}>
      <MapView
        markers={activeMarkers}
        onMarkerClick={handleMarkerClick}
        wardGeoJsonUrl={wardGeoJsonUrl}
        heatmapPoints={heatmapPoints}
        showOutsideOverlay={prefs.focusOverlay}
        className="w-full h-full"
      />

      {/* Layer toggles — bottom left */}
      <div className="absolute bottom-8 left-3 z-10 flex flex-col gap-1.5">
        {layers.map((layer) => (
          <button
            key={layer.key}
            onClick={layer.toggle}
            className={[
              'flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-lg shadow text-xs font-medium transition-all',
              layer.active
                ? 'bg-white text-slate-700 hover:bg-slate-50'
                : 'bg-white/60 text-slate-400 hover:bg-white/80',
            ].join(' ')}
          >
            {/* Color swatches */}
            <span className="flex items-center gap-0.5">
              {layer.swatches.map((c) => (
                <span
                  key={c}
                  className="w-2 h-2 rounded-full inline-block transition-opacity"
                  style={{ backgroundColor: c, opacity: layer.active ? 1 : 0.3 }}
                />
              ))}
            </span>
            {/* Label */}
            <span className={layer.active ? '' : 'line-through'}>{layer.label}</span>
            {/* Count */}
            <span className={[
              'ml-auto pl-1.5 font-mono tabular-nums',
              layer.active ? 'text-slate-400' : 'text-slate-300',
            ].join(' ')}>
              {layer.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
