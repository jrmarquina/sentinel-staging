'use client'

/**
 * LocationField
 *
 * Drop-in location section for any form.
 * Renders:
 *   - A coordinate pill (or empty-state prompt) showing the current pin
 *   - "Use my location" button (GPS)
 *   - "Select on map" button → LocationPickerModal
 *   - "Clear" × button
 *
 * Props:
 *   lat / lng         — controlled values (string, same as the form state)
 *   onChangeLat/Lng   — setters
 *   label             — section label (default "Location")
 *   showAddressField  — render an address text input above the pin row
 *   address / onChangeAddress — address controlled state (only when showAddressField)
 */

import { useState, useEffect, useCallback } from 'react'
import { MapPin, Navigation, X, Loader2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import type { PickedLocation } from './LocationPickerModal'

const LocationPickerModal = dynamic(
  () => import('./LocationPickerModal').then((m) => m.LocationPickerModal),
  { ssr: false }
)

interface LocationFieldProps {
  lat: string
  lng: string
  onChangeLat: (v: string) => void
  onChangeLng: (v: string) => void
  label?: string
  inputClass?: string
  labelClass?: string
  showAddressField?: boolean
  address?: string
  onChangeAddress?: (v: string) => void
  addressPlaceholder?: string
}

export function LocationField({
  lat,
  lng,
  onChangeLat,
  onChangeLng,
  label = 'Location',
  inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500',
  labelClass = 'block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1',
  showAddressField = false,
  address = '',
  onChangeAddress,
  addressPlaceholder = 'Street address or description…',
}: LocationFieldProps) {
  const [showModal, setShowModal] = useState(false)
  const [gpsState, setGpsState] = useState<'idle' | 'loading' | 'ready' | 'denied'>('idle')

  const hasPick = lat !== '' && lng !== ''
  const initial: PickedLocation | null = hasPick
    ? { lat: parseFloat(lat), lng: parseFloat(lng) }
    : null

  // Probe GPS availability silently on mount
  useEffect(() => {
    if (!navigator.geolocation) { setGpsState('denied'); return }
    navigator.geolocation.getCurrentPosition(
      () => setGpsState('ready'),
      () => setGpsState('denied'),
      { timeout: 8000, maximumAge: 60000 }
    )
  }, [])

  function useGPS() {
    if (!navigator.geolocation) return
    setGpsState('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChangeLat(pos.coords.latitude.toFixed(7))
        onChangeLng(pos.coords.longitude.toFixed(7))
        setGpsState('ready')
      },
      () => setGpsState('denied'),
      { timeout: 10000 }
    )
  }

  const handleConfirm = useCallback((loc: PickedLocation) => {
    onChangeLat(loc.lat.toFixed(7))
    onChangeLng(loc.lng.toFixed(7))
    setShowModal(false)
  }, [onChangeLat, onChangeLng])

  function clear() {
    onChangeLat('')
    onChangeLng('')
  }

  return (
    <>
      {showModal && (
        <LocationPickerModal
          initial={initial}
          onConfirm={handleConfirm}
          onClose={() => setShowModal(false)}
        />
      )}

      <div className="space-y-3">
        <label className={labelClass}>{label}</label>

        {/* Optional address text input */}
        {showAddressField && (
          <input
            type="text"
            value={address}
            onChange={(e) => onChangeAddress?.(e.target.value)}
            placeholder={addressPlaceholder}
            className={inputClass}
          />
        )}

        {/* Pin display or empty state */}
        {hasPick ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-mono text-blue-700 dark:text-blue-300">
              <MapPin size={13} className="text-blue-500 flex-shrink-0" />
              <span className="truncate">{parseFloat(lat).toFixed(6)}, {parseFloat(lng).toFixed(6)}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={clear}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
              title="Remove pin"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
          >
            <MapPin size={15} />
            Select location on map…
          </button>
        )}

        {/* GPS + Map buttons row */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={useGPS}
            disabled={gpsState === 'loading' || gpsState === 'denied'}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors',
              gpsState === 'loading'
                ? 'border-slate-200 dark:border-slate-700 text-slate-400 cursor-wait'
                : gpsState === 'denied'
                  ? 'border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800',
            ].join(' ')}
            title={gpsState === 'denied' ? 'GPS permission denied' : 'Use device location'}
          >
            {gpsState === 'loading'
              ? <Loader2 size={12} className="animate-spin" />
              : <Navigation size={12} />}
            {gpsState === 'loading' ? 'Locating…' : 'Use my location'}
          </button>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <MapPin size={12} />
            Select on map
          </button>
        </div>
      </div>
    </>
  )
}
