'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { en, type TranslationKey } from './translations/en'
import { es } from './translations/es'

export type Locale = 'en' | 'es'

const STORAGE_KEY = 'sentinel-locale'
const dicts = { en, es } as const

interface LocaleContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: TranslationKey) => string
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => en[key],
})

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
      if (stored === 'en' || stored === 'es') setLocaleState(stored)
    } catch {}
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
      document.documentElement.setAttribute('lang', l)
    } catch {}
  }, [])

  const t = useCallback(
    (key: TranslationKey): string => dicts[locale][key] ?? dicts.en[key] ?? key,
    [locale]
  )

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}

/** Shorthand hook — returns just the t() function */
export function useT() {
  return useContext(LocaleContext).t
}
