'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'

export type AppMode = 'pw' | 'fm'

const STORAGE_KEY = 'sentinel-app-mode'

/** Routes that belong unambiguously to FM — always use FM mode on these. */
function isFmPath(path: string) {
  return path.includes('/dashboard/fm') || path.includes('/fca')
}
/** Routes that belong unambiguously to PW — always use PW mode on these. */
function isPwPath(path: string) {
  return (
    path.includes('/dashboard/work-orders') ||
    path.includes('/dashboard/contracts') ||
    path.includes('/dashboard/potholes') ||
    path.includes('/dashboard/map')
  )
}

interface AppModeContextValue {
  appMode: AppMode
  setAppMode: (m: AppMode) => void
}

const AppModeContext = createContext<AppModeContextValue>({
  appMode: 'fm',
  setAppMode: () => {},
})

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [appMode, setAppModeState] = useState<AppMode>('fm')

  useEffect(() => {
    // Route takes priority: FM paths force FM, PW paths force PW.
    // Only fall back to localStorage when on a shared/neutral path (e.g. /dashboard/settings).
    if (isFmPath(pathname)) {
      setAppModeState('fm')
      try { localStorage.setItem(STORAGE_KEY, 'fm') } catch {}
    } else if (isPwPath(pathname)) {
      setAppModeState('pw')
      try { localStorage.setItem(STORAGE_KEY, 'pw') } catch {}
    } else {
      try {
        const stored = localStorage.getItem(STORAGE_KEY) as AppMode | null
        if (stored === 'pw' || stored === 'fm') setAppModeState(stored)
      } catch {}
    }
  }, [pathname])

  const setAppMode = useCallback((m: AppMode) => {
    setAppModeState(m)
    try { localStorage.setItem(STORAGE_KEY, m) } catch {}
  }, [])

  return (
    <AppModeContext.Provider value={{ appMode, setAppMode }}>
      {children}
    </AppModeContext.Provider>
  )
}

export function useAppMode() {
  return useContext(AppModeContext)
}
