'use client'

import { useDesignTheme } from '@/lib/design-theme'
import { useMapPrefs } from '@/lib/map-prefs'
import { useDevThemeOverrides, DEV_DEFAULTS, type ModeOverrides } from '@/lib/dev-theme-overrides'
import { useIsAdmin } from '@/hooks/useRole'
import { Check, Palette, Lock, Map, RotateCcw, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

// ── Small helpers ──────────────────────────────────────────────────────────

function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-500">
        {icon}
      </div>
      <div>
        <h2 className="font-semibold text-slate-800 dark:text-white text-sm">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

// Preset swatch row for a single colour property
function ColorRow({
  label, desc, lightValue, darkValue, presets,
  onLightChange, onDarkChange,
}: {
  label: string
  desc: string
  lightValue: string
  darkValue: string
  presets: { light: readonly string[]; dark: readonly string[] }
  onLightChange: (v: string) => void
  onDarkChange:  (v: string) => void
}) {
  return (
    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
      <p style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--fg)', margin: '0 0 0.15rem' }}>{label}</p>
      <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0 0 0.75rem' }}>{desc}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        {/* Light mode */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
            <Sun size={11} style={{ color: '#f59e0b' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Light</span>
          </div>
          {/* Presets */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {presets.light.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => onLightChange(c)}
                style={{
                  width: 22, height: 22, borderRadius: 5, background: c, cursor: 'pointer', flexShrink: 0,
                  border: lightValue === c ? '2px solid var(--fg)' : '1px solid rgba(0,0,0,0.12)',
                  boxShadow: lightValue === c ? '0 0 0 2px rgba(0,0,0,0.15)' : 'none',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
              />
            ))}
          </div>
          {/* Native colour picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ position: 'relative', width: 32, height: 32, borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ position: 'absolute', inset: 0, background: lightValue }} />
              <input
                type="color"
                value={lightValue}
                onChange={(e) => onLightChange(e.target.value)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                title="Pick a custom colour"
              />
            </div>
            <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--muted)' }}>{lightValue}</span>
          </div>
        </div>

        {/* Dark mode */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
            <Moon size={11} style={{ color: '#818cf8' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dark</span>
          </div>
          {/* Presets */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {presets.dark.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => onDarkChange(c)}
                style={{
                  width: 22, height: 22, borderRadius: 5, background: c, cursor: 'pointer', flexShrink: 0,
                  border: darkValue === c ? '2px solid var(--fg)' : '1px solid rgba(255,255,255,0.14)',
                  boxShadow: darkValue === c ? '0 0 0 2px rgba(255,255,255,0.2)' : 'none',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
              />
            ))}
          </div>
          {/* Native colour picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ position: 'relative', width: 32, height: 32, borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ position: 'absolute', inset: 0, background: darkValue }} />
              <input
                type="color"
                value={darkValue}
                onChange={(e) => onDarkChange(e.target.value)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                title="Pick a custom colour"
              />
            </div>
            <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--muted)' }}>{darkValue}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Colour presets ─────────────────────────────────────────────────────────

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

// ── Main page ──────────────────────────────────────────────────────────────

export default function DesignSettingsPage() {
  const { designTheme, setDesignTheme } = useDesignTheme()
  const { prefs, setPrefs } = useMapPrefs()
  const { overrides, setOverride, resetOverrides } = useDevThemeOverrides()
  const isAdmin = useIsAdmin()
  const [resetConfirm, setResetConfirm] = useState(false)

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto mt-24 text-center">
        <Lock size={32} className="mx-auto text-slate-400 mb-3" />
        <p className="text-slate-500">Design settings are restricted to administrators.</p>
      </div>
    )
  }

  function prop(key: keyof Omit<ModeOverrides, 'logo'>) {
    return {
      lightValue:      overrides.light[key] as string,
      darkValue:       overrides.dark[key]  as string,
      onLightChange:  (v: string) => setOverride('light', key, v),
      onDarkChange:   (v: string) => setOverride('dark',  key, v),
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--primary-c)' }}>
          <Palette size={18} style={{ color: 'var(--primary)' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--fg)' }}>Design Settings</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>Admin-only · Changes apply to your session only</p>
        </div>
      </div>

      {/* ── Theme picker ── */}
      <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        <SectionHeader icon={<Palette size={15} />} title="Active Design" sub="Switch between production and experimental designs." />

        <div className="p-5 grid grid-cols-3 gap-4">
          {/* Classic */}
          {[
            {
              id: 'classic' as const,
              label: 'Classic',
              desc: 'Dark sidebar, blue accents, bordered cards.',
              preview: (
                <div className="w-full h-20 rounded-lg bg-slate-900 overflow-hidden flex">
                  <div className="w-1/3 bg-slate-800 p-1.5 space-y-1">
                    <div className="h-1.5 bg-blue-500 rounded w-full" />
                    <div className="h-1.5 bg-slate-600 rounded w-3/4" />
                    <div className="h-1.5 bg-slate-600 rounded w-3/4" />
                  </div>
                  <div className="flex-1 bg-slate-950 p-1.5 space-y-1">
                    <div className="h-2 bg-slate-700 rounded w-1/2" />
                    <div className="grid grid-cols-3 gap-1 mt-1">
                      {[...Array(3)].map((_, i) => <div key={i} className="h-5 bg-slate-800 rounded border border-slate-700" />)}
                    </div>
                    <div className="h-8 bg-slate-800 rounded border border-slate-700 mt-1" />
                  </div>
                </div>
              ),
            },
            {
              id: 'dev' as const,
              label: 'Development',
              desc: 'Civil Architect. Tonal layers, editorial KPIs.',
              preview: (
                <div className="w-full h-20 rounded-lg overflow-hidden flex" style={{ background: '#f6fafe' }}>
                  <div className="w-1/3 p-1.5 space-y-1" style={{ background: '#eef4fa' }}>
                    <div className="h-1.5 rounded w-full" style={{ background: '#565e74' }} />
                    <div className="h-1.5 rounded w-3/4" style={{ background: '#a4b4be' }} />
                    <div className="h-1.5 rounded w-3/4" style={{ background: '#a4b4be' }} />
                  </div>
                  <div className="flex-1 p-1.5 space-y-1" style={{ background: '#f6fafe' }}>
                    <div className="h-2 rounded w-1/2" style={{ background: '#26343d' }} />
                    <div className="grid grid-cols-3 gap-1 mt-1">
                      <div className="h-5 rounded" style={{ background: '#fff' }} />
                      <div className="h-5 rounded" style={{ background: '#fff', borderLeft: '3px solid #9f403d' }} />
                      <div className="h-5 rounded" style={{ background: '#fff' }} />
                    </div>
                    <div className="h-8 rounded mt-1" style={{ background: '#fff' }} />
                  </div>
                </div>
              ),
            },
            {
              id: 'glass' as const,
              label: 'Glass',
              desc: 'Glassmorphism. Frosted surfaces, sky accents.',
              preview: (
                <div className="w-full h-20 rounded-lg overflow-hidden flex" style={{ background: '#020817' }}>
                  <div className="w-1/3 p-1.5 space-y-1" style={{ background: 'rgba(30,41,59,0.6)', backdropFilter: 'blur(8px)' }}>
                    <div className="h-1.5 rounded w-full" style={{ background: '#38bdf8' }} />
                    <div className="h-1.5 rounded w-3/4" style={{ background: 'rgba(148,163,184,0.4)' }} />
                    <div className="h-1.5 rounded w-3/4" style={{ background: 'rgba(148,163,184,0.4)' }} />
                  </div>
                  <div className="flex-1 p-1.5 space-y-1" style={{ background: 'transparent' }}>
                    <div className="h-2 rounded w-1/2" style={{ background: 'rgba(248,250,252,0.7)' }} />
                    <div className="grid grid-cols-3 gap-1 mt-1">
                      {[...Array(3)].map((_, i) => <div key={i} className="h-5 rounded" style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(148,163,184,0.15)' }} />)}
                    </div>
                    <div className="h-8 rounded mt-1" style={{ background: 'rgba(30,41,59,0.4)', border: '1px solid rgba(148,163,184,0.12)' }} />
                  </div>
                </div>
              ),
            },
          ].map((theme) => (
            <button
              key={theme.id}
              onClick={() => setDesignTheme(theme.id)}
              className={cn(
                'relative flex flex-col gap-3 p-4 rounded-xl border-2 text-left transition-all',
                designTheme === theme.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              )}
            >
              {designTheme === theme.id && (
                <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                  <Check size={11} className="text-white" />
                </span>
              )}
              {theme.preview}
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{theme.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{theme.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Map Preferences ── */}
      <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        <SectionHeader icon={<Map size={15} />} title="Map Preferences" sub="Persisted in your browser session." />
        <div style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Focus overlay</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '0.2rem 0 0' }}>
                Dims the map outside Guaynabo municipality boundary.
              </p>
            </div>
            <button
              onClick={() => setPrefs({ focusOverlay: !prefs.focusOverlay })}
              style={{
                position: 'relative', display: 'inline-flex', height: 24, width: 44,
                alignItems: 'center', borderRadius: 9999, transition: 'background 0.2s', flexShrink: 0, marginLeft: '1rem', border: 'none', cursor: 'pointer',
                background: prefs.focusOverlay ? '#1e293b' : 'var(--card-b)',
              }}
              role="switch"
              aria-checked={prefs.focusOverlay}
            >
              <span style={{
                display: 'inline-block', height: 16, width: 16, borderRadius: '50%', background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                transform: prefs.focusOverlay ? 'translateX(24px)' : 'translateX(4px)',
                transition: 'transform 0.2s',
              }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Development View Customisation ── */}
      <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--card-b)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Palette size={15} style={{ color: 'var(--muted)' }} />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--fg)', margin: 0 }}>Development View Customisation</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0.1rem 0 0' }}>
                Colours and logo for the Development design theme. Set a value for light and dark mode independently.
              </p>
            </div>
          </div>
          {/* Reset button */}
          <button
            onClick={() => {
              if (resetConfirm) { resetOverrides(); setResetConfirm(false) }
              else { setResetConfirm(true); setTimeout(() => setResetConfirm(false), 3000) }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem',
              borderRadius: 8, border: `1px solid ${resetConfirm ? '#f87171' : 'var(--border)'}`,
              background: resetConfirm ? '#f8717115' : 'var(--card-b)',
              color: resetConfirm ? '#f87171' : 'var(--muted)',
              fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
            }}
          >
            <RotateCcw size={12} />
            {resetConfirm ? 'Confirm reset' : 'Reset defaults'}
          </button>
        </div>

        {/* ── Logo ── */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <p style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--fg)', margin: '0 0 0.15rem' }}>Logo</p>
          <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0 0 0.875rem' }}>
            Which logo file appears in the sidebar for each colour mode.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            {(['light', 'dark'] as const).map((mode) => (
              <div key={mode}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.625rem' }}>
                  {mode === 'light'
                    ? <Sun size={11} style={{ color: '#f59e0b' }} />
                    : <Moon size={11} style={{ color: '#818cf8' }} />}
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {mode === 'light' ? 'Light' : 'Dark'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {(['black', 'white'] as const).map((variant) => {
                    const isSelected = overrides[mode].logo === variant
                    return (
                      <button
                        key={variant}
                        onClick={() => setOverride(mode, 'logo', variant)}
                        style={{
                          flex: 1, height: 56, borderRadius: 10, cursor: 'pointer',
                          background: variant === 'black' ? '#f8fafc' : '#0f172a',
                          border: isSelected ? '2px solid #3b82f6' : '2px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                          flexDirection: 'column', transition: 'all 0.15s', position: 'relative',
                          boxShadow: isSelected ? '0 0 0 3px #3b82f620' : 'none',
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={variant === 'black' ? '/logo-black.png' : '/logo-white.png'}
                          alt={`Logo ${variant}`}
                          style={{ height: 20, width: 'auto', maxWidth: '80%', objectFit: 'contain' }}
                        />
                        <span style={{ fontSize: '0.55rem', fontWeight: 700, color: variant === 'black' ? '#64748b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          {variant}
                        </span>
                        {isSelected && (
                          <span style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={9} color="#fff" />
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

        {/* ── Menu / Sidebar background ── */}
        <ColorRow
          label="Menu Background"
          desc="The sidebar navigation panel background colour."
          presets={PRESETS.sidebar}
          {...prop('sidebar')}
        />

        {/* ── Top bar ── */}
        <ColorRow
          label="Top Bar"
          desc="The horizontal header bar at the top of the page."
          presets={PRESETS.topbar}
          {...prop('topbar')}
        />

        {/* ── Main section background ── */}
        <ColorRow
          label="Page Background"
          desc="The main content area background."
          presets={PRESETS.bg}
          {...prop('bg')}
        />

        {/* ── Highlight / primary ── */}
        <ColorRow
          label="Highlight Colour"
          desc="Primary accent used for active nav items, buttons and focus rings."
          presets={PRESETS.primary}
          {...prop('primary')}
        />

        {/* Live preview strip */}
        <div style={{ padding: '1rem 1.25rem', background: 'var(--card-b)', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 0.625rem' }}>
            Live Preview · Current Mode
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Sidebar',     color: overrides.light.sidebar,  darkColor: overrides.dark.sidebar },
              { label: 'Top Bar',     color: overrides.light.topbar,   darkColor: overrides.dark.topbar },
              { label: 'Background',  color: overrides.light.bg,       darkColor: overrides.dark.bg },
              { label: 'Highlight',   color: overrides.light.primary,  darkColor: overrides.dark.primary },
            ].map(({ label, color, darkColor }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ display: 'flex', gap: 2 }}>
                  <div title={`Light: ${color}`} style={{ width: 18, height: 18, borderRadius: '4px 0 0 4px', background: color, border: '1px solid rgba(0,0,0,0.1)' }} />
                  <div title={`Dark: ${darkColor}`} style={{ width: 18, height: 18, borderRadius: '0 4px 4px 0', background: darkColor, border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
                <span style={{ fontSize: '0.62rem', color: 'var(--faint)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Status banner ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: 12, background: '#f59e0b18', border: '1px solid #f59e0b40' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0, animation: 'pulse 2s infinite' }} />
        <p style={{ fontSize: '0.72rem', color: '#b45309', margin: 0 }}>
          <strong>Development mode</strong> · Overrides apply to your admin session only. Colours are saved in your browser.
        </p>
      </div>

    </div>
  )
}
