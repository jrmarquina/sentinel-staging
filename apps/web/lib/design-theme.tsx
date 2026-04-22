'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

export type DesignTheme = 'classic' | 'dev'

const STORAGE_KEY = 'sentinel-design'

interface DesignThemeContextValue {
  designTheme: DesignTheme
  setDesignTheme: (t: DesignTheme) => void
}

const DesignThemeContext = createContext<DesignThemeContextValue>({
  designTheme: 'dev',
  setDesignTheme: () => {},
})

function applyDesignTheme(theme: DesignTheme) {
  if (theme === 'dev') {
    document.documentElement.classList.add('design-dev')
  } else {
    document.documentElement.classList.remove('design-dev')
  }
}

export function DesignThemeProvider({ children }: { children: React.ReactNode }) {
  const [designTheme, setDesignThemeState] = useState<DesignTheme>('dev')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as DesignTheme | null
      const initial: DesignTheme = stored === 'classic' ? 'classic' : 'dev'
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
