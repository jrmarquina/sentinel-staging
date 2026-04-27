'use client'

/**
 * DevThemeCustomiser
 * Dropped into the bottom of the admin Settings page.
 * Lets the admin customise the Development design-theme colours + logo
 * independently for light and dark mode.
 */

import { useState } from 'react'
import { Check, Palette, RotateCcw, Sun, Moon } from 'lucide-react'
import { useDevThemeOverrides, type ModeOverrides } from '@/lib/dev-theme-overrides'

// ── Preset swatches ────────────────────────────────────────────────────────

const PRESETS = {
  sidebar: {
    light: ['#eef4fa', '#f0f4f8', '#e8eef5', '#eef0f6', '#e6f0ea', '#f5f0fa'],
    dark:  ['#131b24', '#0f1923', '#1a1a2e', '#111827', '#14202c', '#1b1b2f'],
  },
  topbar: {
    light: ['#ffffff', '#f8fafc', '#eef4fa', '#f0f4f8', '#fffdf7', '#fafafa'],
    dark:  ['#1a2533', '#0f172a', '#1e293b', '#131b24', '#1c2230', '#1a1f2e'],
  },
  bg: {
    light: ['#f6fafe', '#f8fafc', '#ffffff', '#f0f4f8', '#f5f5f5', '#fafbfd'],
    dark:  ['#0d1117', '#0a0f1a', '#0f172a', '#111827', '#080f1c', '#0c1220'],
  },
  primary: {
    light: ['#565e74', '#2563eb', '#0f766e', '#7c3aed', '#b45309', '#be185d'],
    dark:  ['#8fa4c4', '#3b82f6', '#10b981', '#a78bfa', '#fbbf24', '#f472b6'],
  },
} as const

// ── Colour row ─────────────────────────────────────────────────────────────

function ColorRow({
  label,
  desc,
  lightValue,
  darkValue,
  presets,
  onLightChange,
  onDarkChange,
}: {
  label:          string
  desc:           string
  lightValue:     string
  darkValue:      string
  presets:        { light: readonly string[]; dark: readonly string[] }
  onLightChange:  (v: string) => void
  onDarkChange:   (v: string) => void
}) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <p className="text-sm font-semibold text-slate-800 dark:text-white">{label}</p>
      <p className="text-xs text-slate-500 mt-0.5 mb-3">{desc}</p>

      <div className="grid grid-cols-2 gap-5">
        {/* ── Light mode ── */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Sun size={11} className="text-amber-500 flex-shrink-0" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Light</span>
          </div>
          {/* Swatches */}
          <div className="flex gap-1.5 flex-wrap mb-2">
            {presets.light.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => onLightChange(c)}
                className="w-6 h-6 rounded-md flex-shrink-0 transition-transform hover:scale-110"
                style={{
                  background: c,
                  border: lightValue === c
                    ? '2px solid #1e293b'
                    : '1px solid rgba(0,0,0,0.12)',
                  boxShadow: lightValue === c ? `0 0 0 2px ${c}60` : 'none',
                }}
              />
            ))}
          </div>
          {/* Picker */}
          <div className="flex items-center gap-2">
            <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex-shrink-0">
              <div className="absolute inset-0" style={{ background: lightValue }} />
              <input
                type="color"
                value={lightValue}
                onChange={(e) => onLightChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title="Custom colour"
              />
            </div>
            <code className="text-xs text-slate-400">{lightValue}</code>
          </div>
        </div>

        {/* ── Dark mode ── */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Moon size={11} className="text-indigo-400 flex-shrink-0" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dark</span>
          </div>
          {/* Swatches */}
          <div className="flex gap-1.5 flex-wrap mb-2">
            {presets.dark.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => onDarkChange(c)}
                className="w-6 h-6 rounded-md flex-shrink-0 transition-transform hover:scale-110"
                style={{
                  background: c,
                  border: darkValue === c
                    ? '2px solid #e2e8f0'
                    : '1px solid rgba(255,255,255,0.14)',
                  boxShadow: darkValue === c ? `0 0 0 2px ${c}60` : 'none',
                }}
              />
            ))}
          </div>
          {/* Picker */}
          <div className="flex items-center gap-2">
            <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex-shrink-0">
              <div className="absolute inset-0" style={{ background: darkValue }} />
              <input
                type="color"
                value={darkValue}
                onChange={(e) => onDarkChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title="Custom colour"
              />
            </div>
            <code className="text-xs text-slate-400">{darkValue}</code>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────

export function DevThemeCustomiser() {
  const { overrides, setOverride, resetOverrides } = useDevThemeOverrides()
  const [resetConfirm, setResetConfirm] = useState(false)

  function prop(key: keyof Omit<ModeOverrides, 'logo'>) {
    return {
      lightValue:     overrides.light[key] as string,
      darkValue:      overrides.dark[key]  as string,
      onLightChange:  (v: string) => setOverride('light', key, v),
      onDarkChange:   (v: string) => setOverride('dark',  key, v),
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
            <Palette size={15} className="text-slate-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Development View Customisation</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Colours and logo for the Development design theme. Set independently for light and dark mode.
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            if (resetConfirm) { resetOverrides(); setResetConfirm(false) }
            else { setResetConfirm(true); setTimeout(() => setResetConfirm(false), 3000) }
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0 border ${
            resetConfirm
              ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
              : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <RotateCcw size={12} />
          {resetConfirm ? 'Confirm reset' : 'Reset defaults'}
        </button>
      </div>

      {/* ── Logo ── */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <p className="text-sm font-semibold text-slate-800 dark:text-white">Logo</p>
        <p className="text-xs text-slate-500 mt-0.5 mb-3">
          Which logo file appears in the sidebar for each colour mode.
        </p>
        <div className="grid grid-cols-2 gap-5">
          {(['light', 'dark'] as const).map((mode) => (
            <div key={mode}>
              <div className="flex items-center gap-1.5 mb-2">
                {mode === 'light'
                  ? <Sun  size={11} className="text-amber-500 flex-shrink-0" />
                  : <Moon size={11} className="text-indigo-400 flex-shrink-0" />}
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {mode === 'light' ? 'Light' : 'Dark'}
                </span>
              </div>
              <div className="flex gap-3">
                {(['black', 'white'] as const).map((variant) => {
                  const selected = overrides[mode].logo === variant
                  return (
                    <button
                      key={variant}
                      onClick={() => setOverride(mode, 'logo', variant)}
                      className={`flex-1 h-14 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all relative border-2 ${
                        selected
                          ? 'border-blue-500 shadow-sm shadow-blue-200 dark:shadow-blue-900'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                      style={{ background: variant === 'black' ? '#f8fafc' : '#0f172a' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={variant === 'black' ? '/logo-black.png' : '/logo-white.png'}
                        alt={`${variant} logo`}
                        style={{ height: 18, width: 'auto', maxWidth: '75%', objectFit: 'contain' }}
                      />
                      <span
                        className="text-[9px] font-bold uppercase tracking-widest"
                        style={{ color: variant === 'black' ? '#64748b' : '#94a3b8' }}
                      >
                        {variant}
                      </span>
                      {selected && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                          <Check size={8} className="text-white" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Colour rows ── */}
      <ColorRow
        label="Menu Background"
        desc="The sidebar navigation panel background colour."
        presets={PRESETS.sidebar}
        {...prop('sidebar')}
      />
      <ColorRow
        label="Top Bar"
        desc="The horizontal header bar at the top of the page."
        presets={PRESETS.topbar}
        {...prop('topbar')}
      />
      <ColorRow
        label="Page Background"
        desc="The main content area background colour."
        presets={PRESETS.bg}
        {...prop('bg')}
      />
      <ColorRow
        label="Highlight Colour"
        desc="Primary accent used for active nav items, buttons and focus rings."
        presets={PRESETS.primary}
        {...prop('primary')}
      />

      {/* ── Live preview strip ── */}
      <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
          Current values preview
        </p>
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Sidebar',    light: overrides.light.sidebar, dark: overrides.dark.sidebar },
            { label: 'Top Bar',    light: overrides.light.topbar,  dark: overrides.dark.topbar },
            { label: 'Background', light: overrides.light.bg,      dark: overrides.dark.bg },
            { label: 'Highlight',  light: overrides.light.primary, dark: overrides.dark.primary },
          ].map(({ label, light, dark }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="flex">
                <div title={`Light: ${light}`} className="w-5 h-5 rounded-l-md" style={{ background: light, border: '1px solid rgba(0,0,0,0.1)' }} />
                <div title={`Dark: ${dark}`}   className="w-5 h-5 rounded-r-md" style={{ background: dark,  border: '1px solid rgba(255,255,255,0.08)' }} />
              </div>
              <span className="text-[10px] text-slate-400">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="flex">
              <div title="Light logo" className="w-5 h-5 rounded-l-md bg-slate-100 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-black.png" alt="" style={{ height: 10, width: 'auto' }} className={overrides.light.logo === 'white' ? 'invert' : ''} />
              </div>
              <div title="Dark logo" className="w-5 h-5 rounded-r-md bg-slate-800 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-white.png" alt="" style={{ height: 10, width: 'auto' }} className={overrides.dark.logo === 'black' ? 'invert' : ''} />
              </div>
            </div>
            <span className="text-[10px] text-slate-400">Logo</span>
          </div>
        </div>
      </div>

    </div>
  )
}
