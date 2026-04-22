'use client'

import { ThemeProvider } from '@/lib/theme'
import { LocaleProvider } from '@/lib/locale'
import { DesignThemeProvider } from '@/lib/design-theme'
import { MapPrefsProvider } from '@/lib/map-prefs'
import { AppModeProvider } from '@/lib/app-mode'

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <DesignThemeProvider>
          <AppModeProvider>
            <MapPrefsProvider>
              {children}
            </MapPrefsProvider>
          </AppModeProvider>
        </DesignThemeProvider>
      </LocaleProvider>
    </ThemeProvider>
  )
}
