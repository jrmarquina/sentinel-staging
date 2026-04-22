'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

export type AppMode = 'pw' | 'fm'

const STORAGE_KEY = 'sentinel-app-mode'

interface AppModeContextValue {
  appMode: AppMode
  setAppMode: (m: AppMode) => void
}

const AppModeContext = createContext<AppModeContextValue>({
  appMode: 'pw',
  setAppMode: () => {},
})

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [appMode, setAppModeState] = useState<AppMode>('pw')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as AppMode | null
      if (stored === 'pw' || stored === 'fm') setAppModeState(stored)
    } catch {}
  }, [])

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
