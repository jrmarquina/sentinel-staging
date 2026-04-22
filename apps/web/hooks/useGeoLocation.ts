'use client'

import { useState, useCallback } from 'react'

export interface GeoLocationState {
  lat: number | null
  lng: number | null
  accuracy: number | null
  loading: boolean
  error: string | null
}

export function useGeoLocation() {
  const [state, setState] = useState<GeoLocationState>({
    lat: null,
    lng: null,
    accuracy: null,
    loading: false,
    error: null,
  })

  const capture = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: 'Geolocation is not supported by this browser.' }))
      return
    }

    setState((s) => ({ ...s, loading: true, error: null }))

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          loading: false,
          error: null,
        })
      },
      (err) => {
        const messages: Record<number, string> = {
          1: 'Location access denied. Please allow location in your browser settings.',
          2: 'Location unavailable. Try again.',
          3: 'Location request timed out.',
        }
        setState((s) => ({
          ...s,
          loading: false,
          error: messages[err.code] ?? 'Unknown location error.',
        }))
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  const reset = useCallback(() => {
    setState({ lat: null, lng: null, accuracy: null, loading: false, error: null })
  }, [])

  return { ...state, capture, reset }
}
