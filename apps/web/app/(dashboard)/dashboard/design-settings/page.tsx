'use client'

import { useDesignTheme } from '@/lib/design-theme'
import { useMapPrefs } from '@/lib/map-prefs'
import { useIsAdmin } from '@/hooks/useRole'
import { Check, Palette, Lock, Map } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function DesignSettingsPage() {
  const { designTheme, setDesignTheme } = useDesignTheme()
  const { prefs, setPrefs } = useMapPrefs()
  const isAdmin = useIsAdmin()

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto mt-24 text-center">
        <Lock size={32} className="mx-auto text-slate-400 mb-3" />
        <p className="text-slate-500">Design settings are restricted to administrators.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-ca-primary/10 flex items-center justify-center">
          <Palette size={18} className="text-ca-primary" style={{ color: 'var(--ca-primary, #565e74)' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Design Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Admin-only · Changes apply to your session only</p>
        </div>
      </div>

      {/* Theme picker */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-semibold text-slate-800 dark:text-white text-sm">Active Design</h2>
          <p className="text-xs text-slate-500 mt-0.5">Switch between the production design and the new Civil Architect design under development.</p>
        </div>

        <div className="p-5 grid grid-cols-2 gap-4">
          {/* Classic */}
          <button
            onClick={() => setDesignTheme('classic')}
            className={cn(
              'relative flex flex-col gap-3 p-4 rounded-xl border-2 text-left transition-all',
              designTheme === 'classic'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            )}
          >
            {designTheme === 'classic' && (
              <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                <Check size={11} className="text-white" />
              </span>
            )}
            {/* Preview swatch */}
            <div className="w-full h-20 rounded-lg bg-slate-900 overflow-hidden flex">
              <div className="w-1/3 bg-slate-800 p-1.5 space-y-1">
                <div className="h-1.5 bg-blue-500 rounded w-full" />
                <div className="h-1.5 bg-slate-600 rounded w-3/4" />
                <div className="h-1.5 bg-slate-600 rounded w-3/4" />
                <div className="h-1.5 bg-slate-600 rounded w-3/4" />
              </div>
              <div className="flex-1 bg-slate-950 p-1.5 space-y-1">
                <div className="h-2 bg-slate-700 rounded w-1/2" />
                <div className="grid grid-cols-3 gap-1 mt-1">
                  <div className="h-5 bg-slate-800 rounded border border-slate-700" />
                  <div className="h-5 bg-slate-800 rounded border border-slate-700" />
                  <div className="h-5 bg-slate-800 rounded border border-slate-700" />
                </div>
                <div className="h-8 bg-slate-800 rounded border border-slate-700 mt-1" />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Classic</p>
              <p className="text-xs text-slate-500 mt-0.5">Current production design. Dark sidebar, blue accents, bordered cards.</p>
            </div>
          </button>

          {/* Development */}
          <button
            onClick={() => setDesignTheme('dev')}
            className={cn(
              'relative flex flex-col gap-3 p-4 rounded-xl border-2 text-left transition-all',
              designTheme === 'dev'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            )}
          >
            {designTheme === 'dev' && (
              <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                <Check size={11} className="text-white" />
              </span>
            )}
            {/* Preview swatch */}
            <div className="w-full h-20 rounded-lg overflow-hidden flex" style={{ background: '#f6fafe' }}>
              <div className="w-1/3 p-1.5 space-y-1" style={{ background: '#eef4fa' }}>
                <div className="h-1.5 rounded w-full" style={{ background: '#565e74' }} />
                <div className="h-1.5 rounded w-3/4" style={{ background: '#a4b4be' }} />
                <div className="h-1.5 rounded w-3/4" style={{ background: '#a4b4be' }} />
                <div className="h-1.5 rounded w-3/4" style={{ background: '#a4b4be' }} />
              </div>
              <div className="flex-1 p-1.5 space-y-1" style={{ background: '#f6fafe' }}>
                <div className="h-2 rounded w-1/2" style={{ background: '#26343d' }} />
                <div className="grid grid-cols-3 gap-1 mt-1">
                  <div className="h-5 rounded" style={{ background: '#ffffff' }} />
                  <div className="h-5 rounded" style={{ background: '#ffffff', borderLeft: '3px solid #9f403d' }} />
                  <div className="h-5 rounded" style={{ background: '#ffffff' }} />
                </div>
                <div className="h-8 rounded mt-1" style={{ background: '#ffffff' }} />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Development</p>
              <p className="text-xs text-slate-500 mt-0.5">Civil Architect design. Tonal layering, no borders, editorial KPIs.</p>
            </div>
          </button>
        </div>
      </div>

      {/* Map Preferences */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <Map size={16} className="text-slate-400" />
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-white text-sm">Map Preferences</h2>
            <p className="text-xs text-slate-500 mt-0.5">Persisted in your browser session.</p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          {/* Focus overlay toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Focus overlay</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Dims the map area outside the Guaynabo municipality boundary, keeping attention on relevant items.
              </p>
            </div>
            <button
              onClick={() => setPrefs({ focusOverlay: !prefs.focusOverlay })}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4',
                prefs.focusOverlay ? 'bg-slate-800' : 'bg-slate-200 dark:bg-slate-700'
              )}
              role="switch"
              aria-checked={prefs.focusOverlay}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                  prefs.focusOverlay ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Token reference — placeholder for future color picker */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-semibold text-slate-800 dark:text-white text-sm">Color Tokens</h2>
          <p className="text-xs text-slate-500 mt-0.5">Civil Architect palette — adjustment controls coming soon.</p>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          {[
            { label: 'Primary',     light: '#565e74', dark: '#8fa4c4' },
            { label: 'Teal (OK)',   light: '#006b62', dark: '#00c4b4' },
            { label: 'Red (Error)', light: '#9f403d', dark: '#ff7b78' },
            { label: 'Amber (Risk)',light: '#b45309', dark: '#fbbf24' },
            { label: 'Surface',     light: '#f6fafe', dark: '#0d1117' },
            { label: 'Card',        light: '#ffffff',  dark: '#1a2533' },
          ].map((token) => (
            <div key={token.label} className="flex items-center gap-3">
              <div className="flex gap-1">
                <div className="w-5 h-5 rounded" style={{ background: token.light, border: '1px solid rgba(0,0,0,0.08)' }} title={`Light: ${token.light}`} />
                <div className="w-5 h-5 rounded" style={{ background: token.dark, border: '1px solid rgba(255,255,255,0.1)' }} title={`Dark: ${token.dark}`} />
              </div>
              <span className="text-xs text-slate-600 dark:text-slate-400">{token.label}</span>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs text-slate-400">Color picker and typography controls will be added here for live token editing.</p>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          <span className="font-semibold">Development mode</span> applies to your admin session only.
          When ready to promote, change the default in <code className="font-mono">lib/design-theme.tsx</code>.
        </p>
      </div>
    </div>
  )
}
