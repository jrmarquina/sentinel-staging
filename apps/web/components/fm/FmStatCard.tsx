'use client'

import Link from 'next/link'
import { ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface FmStatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  href?: string
  accent?: 'primary' | 'red' | 'teal' | 'amber'
  trend?: 'up' | 'down' | 'flat'
  trendLabel?: string
}

const ACCENT_TOKEN: Record<string, { bg: string; border: string; color: string }> = {
  primary: { bg: 'var(--primary-c)', border: 'var(--primary)',  color: 'var(--primary)' },
  red:     { bg: 'var(--red-c)',     border: 'var(--red)',      color: 'var(--red)' },
  teal:    { bg: 'var(--teal-c)',    border: 'var(--teal)',     color: 'var(--teal)' },
  amber:   { bg: 'var(--amber-c)',   border: 'var(--amber)',    color: 'var(--amber)' },
}

const TREND_ICON = {
  up:   <TrendingUp  size={12} />,
  down: <TrendingDown size={12} />,
  flat: <Minus size={12} />,
}

const TREND_COLOR = {
  up:   'var(--teal)',
  down: 'var(--red)',
  flat: 'var(--muted)',
}

function Inner({ icon, label, value, sub, accent = 'primary', trend, trendLabel }: FmStatCardProps) {
  const a = ACCENT_TOKEN[accent] ?? ACCENT_TOKEN.primary
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      {/* Icon row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: a.bg,
          border: `1px solid ${a.border}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: a.color, flexShrink: 0,
        }}>
          {icon}
        </div>
        <ChevronRight size={16} style={{ color: 'var(--faint)', opacity: 0.6 }} />
      </div>

      {/* Value */}
      <div>
        <p style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', marginBottom: '0.35rem' }}>
          {label}
        </p>
        <p style={{ fontSize: '1.875rem', fontWeight: 800, lineHeight: 1, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </p>
        {sub && (
          <p style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--muted)' }}>{sub}</p>
        )}
      </div>

      {/* Trend */}
      {trend && trendLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', fontWeight: 700, color: TREND_COLOR[trend], marginTop: 'auto' }}>
          {TREND_ICON[trend]}
          {trendLabel}
        </div>
      )}
    </div>
  )
}

export function FmStatCard(props: FmStatCardProps) {
  if (props.href) {
    return (
      <Link
        href={props.href}
        className="fm-card block"
        style={{ textDecoration: 'none' }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = 'var(--primary)'
          el.style.boxShadow = '0 4px 20px var(--primary-c)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = ''
          el.style.boxShadow = ''
        }}
      >
        <Inner {...props} />
      </Link>
    )
  }
  return <div className="fm-card"><Inner {...props} /></div>
}
