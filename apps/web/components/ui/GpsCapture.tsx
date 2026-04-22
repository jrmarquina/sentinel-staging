'use client'

import { MapPin, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useGeoLocation } from '@/hooks/useGeoLocation'

interface GpsCaptureProps {
  onCapture?: (lat: number, lng: number, accuracy: number) => void
}

export function GpsCapture({ onCapture }: GpsCaptureProps) {
  const { lat, lng, accuracy, loading, error, capture } = useGeoLocation()

  function handleCapture() {
    capture()
  }

  // Notify parent when coords arrive
  if (lat !== null && lng !== null && accuracy !== null && onCapture) {
    onCapture(lat, lng, accuracy)
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
      <div className="flex-shrink-0">
        {loading ? (
          <Loader2 size={18} className="text-blue-500 animate-spin" />
        ) : lat !== null ? (
          <CheckCircle2 size={18} className="text-emerald-500" />
        ) : error ? (
          <AlertCircle size={18} className="text-red-500" />
        ) : (
          <MapPin size={18} className="text-slate-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {lat !== null && lng !== null ? (
          <div>
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Location captured</p>
            <p className="text-xs text-slate-500 font-mono truncate">
              {lat.toFixed(6)}, {lng.toFixed(6)}
              {accuracy && ` ±${Math.round(accuracy)}m`}
            </p>
          </div>
        ) : error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : (
          <p className="text-xs text-slate-500">
            {loading ? 'Getting location…' : 'No location captured'}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleCapture}
        disabled={loading}
        className="flex-shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 disabled:opacity-50"
      >
        {lat !== null ? 'Recapture' : 'Capture'}
      </button>
    </div>
  )
}
