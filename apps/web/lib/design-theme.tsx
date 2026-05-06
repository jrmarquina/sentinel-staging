'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

export type DesignTheme = 'classic' | 'dev' | 'glass'

const STORAGE_KEY = 'sentinel-design'

interface DesignThemeContextValue {
  designTheme: DesignTheme
  setDesignTheme: (t: DesignTheme) => void
}

const DesignThemeContext = createContext<DesignThemeContextValue>({
  designTheme: 'classic',
  setDesignTheme: () => {},
})

function applyDesignTheme(theme: DesignTheme) {
  const html = document.documentElement
  // Remove all design-theme classes first
  html.classList.remove('design-dev', 'design-glass')
  if (theme === 'dev')   html.classList.add('design-dev')
  if (theme === 'glass') html.classList.add('design-glass')
}

export function DesignThemeProvider({ children }: { children: React.ReactNode }) {
  const [designTheme, setDesignThemeState] = useState<DesignTheme>('dev')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as DesignTheme | null
      const valid: DesignTheme[] = ['classic', 'dev', 'glass']
      const initial: DesignTheme = valid.includes(stored as DesignTheme)
        ? (stored as DesignTheme)
        : 'dev'
      setDesignThemeState(initial)
      applyDesignTheme(initial)
    } catch {}
  }, [])

  const setDesignTheme = useCallback((t: DesignTheme) => {
    setDesignThemeState(t)
    applyDesignTheme(t)
    try { localStorage.setItem(STORAGE_KEY, t) } catch {}
  }, [])

  return (
    <DesignThemeContext.Provider value={{ designTheme, setDesignTheme }}>
      {children}
    </DesignThemeContext.Provider>
  )
}

export function useDesignTheme() {
  return useContext(DesignThemeContext)
}
