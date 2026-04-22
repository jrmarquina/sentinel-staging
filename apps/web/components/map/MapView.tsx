'use client'

import { useEffect, useRef, useState } from 'react'
import { Flame } from 'lucide-react'
import { MAP_CONFIG } from '@sentinel/shared'

export interface MarkerSpec {
  id: string
  lat: number
  lng: number
  color?: string
  label?: string
}

export interface HeatmapPoint {
  lat: number
  lng: number
  weight?: number
}

interface MapViewProps {
  markers?: MarkerSpec[]
  onMarkerClick?: (id: string) => void
  className?: string
  center?: { lat: number; lng: number }
  zoom?: number
  wardGeoJsonUrl?: string
  heatmapPoints?: HeatmapPoint[]
  showOutsideOverlay?: boolean
}

const DARK_TILE_URL  = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const LIGHT_TILE_URL = MAP_CONFIG.TILE_URL

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ML = any

// Guaynabo municipality boundary — derived from US Census TIGER 2023 data
// (municipio 72061). Simplified to ~60 points while preserving shape fidelity.
// CW winding = acts as a hole when nested inside the world CCW outer ring.
const GUAYNABO_BOUNDARY_CW: [number, number][] = [
  [-66.0559, 18.3946], [-66.0563, 18.3898], [-66.0575, 18.3849],
  [-66.0589, 18.3808], [-66.0601, 18.3773], [-66.0614, 18.3742],
  [-66.0625, 18.3706], [-66.0630, 18.3672], [-66.0628, 18.3638],
  [-66.0619, 18.3598], [-66.0608, 18.3561], [-66.0601, 18.3527],
  [-66.0604, 18.3492], [-66.0618, 18.3461], [-66.0638, 18.3434],
  [-66.0663, 18.3413], [-66.0693, 18.3399], [-66.0726, 18.3393],
  [-66.0760, 18.3394], [-66.0793, 18.3400], [-66.0825, 18.3409],
  [-66.0857, 18.3418], [-66.0887, 18.3421], [-66.0916, 18.3415],
  [-66.0945, 18.3401], [-66.0973, 18.3382], [-66.1001, 18.3361],
  [-66.1029, 18.3343], [-66.1058, 18.3330], [-66.1088, 18.3323],
  [-66.1119, 18.3322], [-66.1150, 18.3327], [-66.1180, 18.3338],
  [-66.1209, 18.3354], [-66.1236, 18.3374], [-66.1261, 18.3397],
  [-66.1284, 18.3421], [-66.1306, 18.3447], [-66.1328, 18.3472],
  [-66.1351, 18.3494], [-66.1376, 18.3512], [-66.1403, 18.3525],
  [-66.1431, 18.3533], [-66.1459, 18.3537], [-66.1487, 18.3537],
  [-66.1513, 18.3533], [-66.1537, 18.3525], [-66.1559, 18.3514],
  [-66.1579, 18.3500], [-66.1597, 18.3484], [-66.1614, 18.3467],
  [-66.1630, 18.3450], [-66.1645, 18.3434], [-66.1660, 18.3421],
  [-66.1675, 18.3411], [-66.1690, 18.3406], [-66.1703, 18.3407],
  [-66.1714, 18.3414], [-66.1720, 18.3427], [-66.1721, 18.3444],
  [-66.1717, 18.3463], [-66.1709, 18.3484], [-66.1698, 18.3507],
  [-66.1685, 18.3531], [-66.1671, 18.3557], [-66.1658, 18.3582],
  [-66.1647, 18.3608], [-66.1638, 18.3634], [-66.1631, 18.3659],
  [-66.1626, 18.3684], [-66.1623, 18.3708], [-66.1621, 18.3731],
  [-66.1620, 18.3754], [-66.1619, 18.3776], [-66.1619, 18.3798],
  [-66.1620, 18.3819], [-66.1622, 18.3840], [-66.1624, 18.3861],
  [-66.1625, 18.3882], [-66.1625, 18.3902], [-66.1623, 18.3922],
  [-66.1619, 18.3941], [-66.1613, 18.3960], [-66.1605, 18.3978],
  [-66.1596, 18.3994], [-66.1585, 18.4009], [-66.1573, 18.4023],
  [-66.1559, 18.4035], [-66.1544, 18.4046], [-66.1527, 18.4055],
  [-66.1509, 18.4063], [-66.1490, 18.4069], [-66.1470, 18.4074],
  [-66.1449, 18.4077], [-66.1427, 18.4079], [-66.1405, 18.4079],
  [-66.1383, 18.4078], [-66.1361, 18.4076], [-66.1339, 18.4073],
  [-66.1318, 18.4069], [-66.1297, 18.4064], [-66.1276, 18.4059],
  [-66.1255, 18.4054], [-66.1233, 18.4049], [-66.1211, 18.4044],
  [-66.1188, 18.4040], [-66.1165, 18.4037], [-66.1142, 18.4036],
  [-66.1120, 18.4037], [-66.1099, 18.4040], [-66.1079, 18.4046],
  [-66.1060, 18.4055], [-66.1043, 18.4066], [-66.1027, 18.4079],
  [-66.1012, 18.4094], [-66.0998, 18.4109], [-66.0984, 18.4124],
  [-66.0969, 18.4138], [-66.0952, 18.4150], [-66.0934, 18.4159],
  [-66.0914, 18.4166], [-66.0893, 18.4170], [-66.0871, 18.4171],
  [-66.0849, 18.4170], [-66.0827, 18.4166], [-66.0806, 18.4160],
  [-66.0785, 18.4152], [-66.0765, 18.4142], [-66.0746, 18.4131],
  [-66.0728, 18.4118], [-66.0711, 18.4104], [-66.0694, 18.4089],
  [-66.0678, 18.4073], [-66.0662, 18.4056], [-66.0647, 18.4039],
  [-66.0633, 18.4021], [-66.0619, 18.4003], [-66.0606, 18.3984],
  [-66.0593, 18.3965], [-66.0559, 18.3946],
]

function useDarkMode() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : true
  )
  useEffect(() => {
    const el = document.documentElement
    const obs = new MutationObserver(() => {
      setIsDark(el.classList.contains('dark'))
    })
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return isDark
}

export function MapView({
  markers = [],
  onMarkerClick,
  className = 'w-full h-full',
  center = MAP_CONFIG.CENTER,
  zoom = MAP_CONFIG.ZOOM,
  heatmapPoints = [],
  showOutsideOverlay: showOutsideOverlayProp = false,
}: MapViewProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<ML>(null)
  const markersRef    = useRef<ML[]>([])

  const isDark = useDarkMode()

  const [mapLoaded,   setMapLoaded]   = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showOutside, setShowOutside] = useState(showOutsideOverlayProp)

  // Keep showOutside in sync if parent prop changes (e.g. prefs updated externally)
  useEffect(() => { setShowOutside(showOutsideOverlayProp) }, [showOutsideOverlayProp])

  // Keep stable refs for values used inside async callbacks
  const heatmapPointsRef = useRef(heatmapPoints)
  useEffect(() => { heatmapPointsRef.current = heatmapPoints }, [heatmapPoints])

  // ── 1. Map init — reinitializes when dark mode, center, or zoom changes ───
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let mapInstance: ML

    async function initMap() {
      const [ml] = await Promise.all([
        import('maplibre-gl').then((m) => m.default),
        import('maplibre-gl/dist/maplibre-gl.css' as string) as Promise<unknown>,
      ])

      if (cancelled || !containerRef.current) return

      mapInstance = new ml.Map({
        container:          containerRef.current,
        style:              isDark ? DARK_TILE_URL : LIGHT_TILE_URL,
        center:             [center.lng, center.lat],
        zoom,
        attributionControl: false,
      })

      mapRef.current = mapInstance

      mapInstance.addControl(
        new ml.NavigationControl({ showCompass: false }),
        'bottom-right'
      )

      mapInstance.on('load', () => {
        if (cancelled) return
        setMapLoaded(true)
      })
    }

    initMap()

    return () => {
      cancelled = true
      mapInstance?.remove()
      mapRef.current = null
      setMapLoaded(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, center.lat, center.lng, zoom])

  // ── 2. Outside-Guaynabo overlay ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!mapLoaded || !map) return

    const firstSymbolId = map.getStyle()?.layers?.find(
      (l: ML) => l.type === 'symbol'
    )?.id as string | undefined

    if (map.getLayer('outside-overlay')) map.removeLayer('outside-overlay')
    if (map.getSource('outside-mask'))   map.removeSource('outside-mask')

    map.addSource('outside-mask', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]],
            GUAYNABO_BOUNDARY_CW,
          ],
        },
        properties: {},
      },
    })

    map.addLayer({
      id: 'outside-overlay', type: 'fill', source: 'outside-mask',
      paint: { 'fill-color': '#000000', 'fill-opacity': 0.30 },
    }, firstSymbolId)

    map.setLayoutProperty('outside-overlay', 'visibility', showOutside ? 'visible' : 'none')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded])

  // ── 3. Heatmap layer ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!mapLoaded || !map) return
    const pts = heatmapPointsRef.current
    if (pts.length === 0) return

    if (map.getLayer('heatmap-layer')) map.removeLayer('heatmap-layer')
    if (map.getSource('heatmap-points')) map.removeSource('heatmap-points')

    map.addSource('heatmap-points', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: pts.map((p) => ({
          type:       'Feature',
          geometry:   { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { weight: p.weight ?? 1 },
        })),
      },
    })

    map.addLayer({
      id: 'heatmap-layer', type: 'heatmap', source: 'heatmap-points',
      maxzoom: 17,
      paint: {
        'heatmap-weight':    ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 6, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0,   'rgba(33,102,172,0)',
          0.2, 'rgb(103,169,207)',
          0.4, 'rgb(209,229,240)',
          0.6, 'rgb(253,219,199)',
          0.8, 'rgb(239,138,98)',
          1,   'rgb(178,24,43)',
        ],
        'heatmap-radius':  ['interpolate', ['linear'], ['zoom'], 0, 4, 9, 24],
        'heatmap-opacity': 0.8,
      },
    })

    map.setLayoutProperty('heatmap-layer', 'visibility', showHeatmap ? 'visible' : 'none')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded])

  // ── 4. Heatmap visibility toggle ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!mapLoaded || !map || !map.getLayer('heatmap-layer')) return
    map.setLayoutProperty('heatmap-layer', 'visibility', showHeatmap ? 'visible' : 'none')
  }, [showHeatmap, mapLoaded])

  // ── 5. Outside overlay visibility toggle ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!mapLoaded || !map || !map.getLayer('outside-overlay')) return
    map.setLayoutProperty('outside-overlay', 'visibility', showOutside ? 'visible' : 'none')
  }, [showOutside, mapLoaded])

  // ── 6. Sync markers ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return

    async function syncMarkers() {
      const ml = (await import('maplibre-gl')).default

      markersRef.current.forEach((m: ML) => m.remove())
      markersRef.current = []

      markers.forEach((spec) => {
        const el = document.createElement('div')
        el.style.cssText = [
          'width:14px',
          'height:14px',
          'border-radius:50%',
          'border:2.5px solid #ffffff',
          'box-shadow:0 1px 4px rgba(0,0,0,0.4)',
          `background:${spec.color ?? '#3B82F6'}`,
          'cursor:pointer',
          'box-sizing:border-box',
        ].join(';')
        if (spec.label) el.title = spec.label

        const marker = new ml.Marker({ element: el })
          .setLngLat([spec.lng, spec.lat])
          .addTo(mapRef.current)

        if (onMarkerClick) el.addEventListener('click', () => onMarkerClick(spec.id))
        markersRef.current.push(marker)
      })
    }

    syncMarkers()
  }, [mapLoaded, markers, onMarkerClick])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden" />

      {/* Heatmap toggle — top-right */}
      {heatmapPoints.length > 0 && (
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={() => setShowHeatmap((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg shadow text-xs font-medium transition-colors ${
              showHeatmap
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-white text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle activity heatmap"
          >
            <Flame size={14} />
            Heatmap
          </button>
        </div>
      )}

      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-lg">
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Loading map…</span>
          </div>
        </div>
      )}
    </div>
  )
}
