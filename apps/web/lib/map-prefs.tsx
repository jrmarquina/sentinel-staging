'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'sentinel-map-prefs'

interface MapPrefs {
  focusOverlay: boolean  // dim area outside Guaynabo
}

interface MapPrefsContextValue {
  prefs: MapPrefs
  setPrefs: (p: Partial<MapPrefs>) => void
}

const defaults: MapPrefs = { focusOverlay: false }

const MapPrefsContext = createContext<MapPrefsContextValue>({
  prefs: defaults,
  setPrefs: () => {},
})

export function MapPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<MapPrefs>(defaults)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setPrefsState({ ...defaults, ...JSON.parse(stored) })
    } catch {}
  }, [])

  const setPrefs = useCallback((partial: Partial<MapPrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...partial }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  return (
    <MapPrefsContext.Provider value={{ prefs, setPrefs }}>
      {children}
    </MapPrefsContext.Provider>
  )
}

export function useMapPrefs() {
  return useContext(MapPrefsContext)
}
