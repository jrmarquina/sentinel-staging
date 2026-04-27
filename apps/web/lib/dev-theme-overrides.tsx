'use client'

/**
 * Dev Theme Overrides
 * Lets admins customise the Development (CA) design theme per mode (light/dark).
 * Overrides are stored in localStorage and applied as CSS custom-property
 * inline styles on <html> — they take precedence over the .design-dev class rules.
 *
 * CSS variable → UI surface mapping (dev/CA mode):
 *   --card-b  → sidebar / menu background
 *   --card    → top bar background
 *   --bg      → main section background
 *   --primary → highlight / accent colour
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useDesignTheme } from '@/lib/design-theme'
import { useTheme } from '@/lib/theme'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ModeOverrides {
  sidebar:  string          // --card-b
  topbar:   string          // --card
  bg:       string          // --bg
  primary:  string          // --primary
  logo:     'black' | 'white'
}

export interface DevThemeOverrides {
  light: ModeOverrides
  dark:  ModeOverrides
}

interface DevThemeOverridesCtx {
  overrides:  DevThemeOverrides
  setOverride: (mode: 'light' | 'dark', key: keyof ModeOverrides, value: string) => void
  resetOverrides: () => void
}

// ── Defaults ───────────────────────────────────────────────────────────────

export const DEV_DEFAULTS: DevThemeOverrides = {
  light: {
    sidebar:  '#eef4fa',
    topbar:   '#ffffff',
    bg:       '#f6fafe',
    primary:  '#565e74',
    logo:     'black',
  },
  dark: {
    sidebar:  '#131b24',
    topbar:   '#1a2533',
    bg:       '#0d1117',
    primary:  '#8fa4c4',
    logo:     'white',
  },
}

const STORAGE_KEY = 'sentinel-dev-overrides'

// ── Context ────────────────────────────────────────────────────────────────

const Ctx = createContext<DevThemeOverridesCtx>({
  overrides:   DEV_DEFAULTS,
  setOverride:  () => {},
  resetOverrides: () => {},
})

// ── CSS application ────────────────────────────────────────────────────────

const CSS_MAP: Record<keyof Omit<ModeOverrides, 'logo'>, string> = {
  sidebar: '--card-b',
  topbar:  '--card',
  bg:      '--bg',
  primary: '--primary',
}

function applyOverrides(overrides: ModeOverrides) {
  const html = document.documentElement
  for (const [key, cssVar] of Object.entries(CSS_MAP)) {
    html.style.setProperty(cssVar, overrides[key as keyof typeof CSS_MAP])
  }
}

function clearOverrides() {
  const html = document.documentElement
  for (const cssVar of Object.values(CSS_MAP)) {
    html.style.removeProperty(cssVar)
  }
}

// ── Provider ───────────────────────────────────────────────────────────────

export function DevThemeOverridesProvider({ children }: { children: React.ReactNode }) {
  const { designTheme } = useDesignTheme()
  const { theme }        = useTheme()

  const [overrides, setOverrides] = useState<DevThemeOverrides>(DEV_DEFAULTS)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<DevThemeOverrides>
        setOverrides({
          light: { ...DEV_DEFAULTS.light, ...(parsed.light ?? {}) },
          dark:  { ...DEV_DEFAULTS.dark,  ...(parsed.dark  ?? {}) },
        })
      }
    } catch {}
  }, [])

  // Apply / clear whenever design theme, light/dark mode, or overrides change
  useEffect(() => {
    if (designTheme !== 'dev') {
      clearOverrides()
      return
    }
    applyOverrides(overrides[theme === 'dark' ? 'dark' : 'light'])
  }, [designTheme, theme, overrides])

  const setOverride = useCallback((mode: 'light' | 'dark', key: keyof ModeOverrides, value: string) => {
    setOverrides((prev) => {
      const next: DevThemeOverrides = {
        ...prev,
        [mode]: { ...prev[mode], [key]: value },
      }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const resetOverrides = useCallback(() => {
    setOverrides(DEV_DEFAULTS)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  return (
    <Ctx.Provider value={{ overrides, setOverride, resetOverrides }}>
      {children}
    </Ctx.Provider>
  )
}

export function useDevThemeOverrides() {
  return useContext(Ctx)
}
