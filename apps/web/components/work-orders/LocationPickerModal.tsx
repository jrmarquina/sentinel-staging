'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Navigation, MapPin, Check } from 'lucide-react'
import { MAP_CONFIG } from '@sentinel/shared'

export interface PickedLocation {
  lat: number
  lng: number
}

interface Props {
  initial?: PickedLocation | null
  onConfirm: (loc: PickedLocation) => void
  onClose: () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ML = any

export function LocationPickerModal({ initial, onConfirm, onClose }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<ML>(null)
  const markerRef     = useRef<ML>(null)
  const maplibreRef   = useRef<ML>(null)

  const [picked,      setPicked]      = useState<PickedLocation | null>(initial ?? null)
  const [mapLoaded,   setMapLoaded]   = useState(false)
  const [gpsState,    setGpsState]    = useState<'idle' | 'loading' | 'ready' | 'denied'>('idle')
  const [gpsPos,      setGpsPos]      = useState<PickedLocation | null>(null)

  // ── Probe GPS on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return
    setGpsState('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGpsPos(loc)
        setGpsState('ready')
      },
      () => setGpsState('denied'),
      { timeout: 8000, maximumAge: 30000 }
    )
  }, [])

  // ── Move / place marker ───────────────────────────────────────────────────
  const placeMarker = useCallback((loc: PickedLocation) => {
    if (!mapRef.current || !maplibreRef.current) return
    setPicked(loc)

    if (markerRef.current) {
      markerRef.current.setLngLat([loc.lng, loc.lat])
    } else {
      // Plain circle, anchor:'center' (default) — compound CSS transforms like
      // rotate+translate cause subpixel drift at different zoom levels.
      const el = document.createElement('div')
      el.style.cssText = [
        'width:20px',
        'height:20px',
        'background:#2563eb',
        'border:3px solid #ffffff',
        'border-radius:50%',
        'box-shadow:0 2px 8px rgba(0,0,0,0.4)',
        'cursor:grab',
        'box-sizing:border-box',
      ].join(';')
      markerRef.current = new maplibreRef.current.Marker({ element: el, draggable: true })
        .setLngLat([loc.lng, loc.lat])
        .addTo(mapRef.current)

      markerRef.current.on('dragend', () => {
        const { lng, lat } = markerRef.current.getLngLat()
        setPicked({ lat, lng })
      })
    }
  }, [])

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let mapInstance: ML

    async function init() {
      const [ml] = await Promise.all([
        import('maplibre-gl').then((m) => m.default),
        import('maplibre-gl/dist/maplibre-gl.css' as string) as Promise<unknown>,
      ])
      if (cancelled || !containerRef.current) return

      maplibreRef.current = ml

      // Center: initial pin → GPS → Guaynabo default
      const initCenter = initial ?? gpsPos ?? { lat: MAP_CONFIG.CENTER.lat, lng: MAP_CONFIG.CENTER.lng }

      mapInstance = new ml.Map({
        container: containerRef.current,
        style:     MAP_CONFIG.TILE_URL,
        center:    [initCenter.lng, initCenter.lat],
        zoom:      initial ? 16 : 14,
      })
      mapRef.current = mapInstance

      mapInstance.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right')

      mapInstance.on('load', () => {
        if (cancelled) return
        setMapLoaded(true)

        // Place initial pin if provided
        if (initial) placeMarker(initial)

        // Click → place / move pin
        mapInstance.on('click', (e: ML) => {
          placeMarker({ lat: e.lngLat.lat, lng: e.lngLat.lng })
        })

        // Change cursor on hover
        mapInstance.getCanvas().style.cursor = 'crosshair'
      })
    }

    init()
    return () => {
      cancelled = true
      mapInstance?.remove()
      mapRef.current   = null
      markerRef.current = null
      setMapLoaded(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])   // run once — placeMarker is stable via useCallback

  // ── Fly to GPS ────────────────────────────────────────────────────────────
  function flyToGps() {
    if (!gpsPos || !mapRef.current) return
    mapRef.current.flyTo({ center: [gpsPos.lng, gpsPos.lat], zoom: 17, duration: 900 })
    placeMarker(gpsPos)
  }

  // ── Trap ESC ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
           style={{ height: 'min(90vh, 640px)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-blue-600" />
            <h2 className="font-semibold text-slate-900 dark:text-white text-sm">Pick Location</h2>
            <span className="text-xs text-slate-400 ml-1">Click the map to place a pin, or drag to adjust</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Map */}
        <div className="relative flex-1 min-h-0">
          <div ref={containerRef} className="w-full h-full" />

          {/* GPS button — top-left of map */}
          <div className="absolute top-3 left-3 z-10">
            <button
              onClick={flyToGps}
              disabled={gpsState === 'loading' || gpsState === 'denied' || !mapLoaded}
              className={[
                'flex items-center gap-1.5 px-3 py-2 rounded-lg shadow text-xs font-medium transition-colors',
                gpsState === 'ready'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : gpsState === 'loading'
                    ? 'bg-slate-100 text-slate-400 cursor-wait'
                    : 'bg-white text-slate-400 cursor-not-allowed',
              ].join(' ')}
              title={
                gpsState === 'denied'  ? 'GPS access denied'  :
                gpsState === 'loading' ? 'Getting GPS…'        :
                gpsState === 'ready'   ? 'Center on my location' : ''
              }
            >
              <Navigation size={13} className={gpsState === 'loading' ? 'animate-pulse' : ''} />
              {gpsState === 'loading' ? 'Locating…' : 'Use my location'}
            </button>
          </div>

          {/* Loading spinner */}
          {!mapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex-shrink-0 gap-3">
          {/* Coordinate readout */}
          <div className="text-xs font-mono text-slate-500 min-w-0">
            {picked ? (
              <span>
                <span className="text-slate-300 dark:text-slate-600 mr-1">LAT</span>
                <span className="text-slate-700 dark:text-slate-200">{picked.lat.toFixed(6)}</span>
                <span className="text-slate-300 dark:text-slate-600 mx-2">LNG</span>
                <span className="text-slate-700 dark:text-slate-200">{picked.lng.toFixed(6)}</span>
              </span>
            ) : (
              <span className="text-slate-400 italic">No location selected — click the map</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!picked}
              onClick={() => picked && onConfirm(picked)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Check size={14} />
              Confirm Location
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
