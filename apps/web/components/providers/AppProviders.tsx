'use client'

import { ThemeProvider } from '@/lib/theme'
import { LocaleProvider } from '@/lib/locale'
import { DesignThemeProvider } from '@/lib/design-theme'
import { DevThemeOverridesProvider } from '@/lib/dev-theme-overrides'
import { MapPrefsProvider } from '@/lib/map-prefs'
import { AppModeProvider } from '@/lib/app-mode'

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <DesignThemeProvider>
          {/* Must be inside both ThemeProvider + DesignThemeProvider — reads both contexts */}
          <DevThemeOverridesProvider>
            <AppModeProvider>
              <MapPrefsProvider>
                {children}
              </MapPrefsProvider>
            </AppModeProvider>
          </DevThemeOverridesProvider>
        </DesignThemeProvider>
      </LocaleProvider>
    </ThemeProvider>
  )
}
