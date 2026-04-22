'use client'

import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, AlertTriangle, Clock, User } from 'lucide-react'
import type { OverdueItem } from './page'

function daysLabel(n: number) {
  if (n === 0) return 'today'
  if (n === 1) return '1 day overdue'
  return `${n} days overdue`
}

function urgencyColor(days: number) {
  if (days >= 30) return 'var(--ca-red, #9f403d)'
  if (days >= 7)  return 'var(--ca-amber, #b45309)'
  return 'var(--ca-amber, #b45309)'
}

function urgencyBg(days: number) {
  if (days >= 30) return 'color-mix(in srgb, var(--ca-red-c, #fe8983) 25%, transparent)'
  return 'var(--ca-amber-c, #fef3c7)'
}

const TYPE_LABEL: Record<string, string> = {
  project:    'PROJ',
  work_order: 'WO',
}

const TYPE_BG: Record<string, string> = {
  project:    'var(--ca-primary-c, #dae2fd)',
  work_order: 'color-mix(in srgb, var(--ca-primary-c, #dae2fd) 60%, white)',
}

const TYPE_INK: Record<string, string> = {
  project:    'var(--ca-primary, #565e74)',
  work_order: 'var(--ca-primary-dim, #4a5268)',
}

const card: React.CSSProperties = {
  background: 'var(--ca-card, #ffffff)',
  borderRadius: '0.75rem',
  boxShadow: '0 1px 4px rgba(38,52,61,0.06)',
}

export function OverdueClient({ items }: { items: OverdueItem[] }) {
  return (
    <div className="max-w-3xl mx-auto space-y-6" style={{ color: 'var(--ca-ink, #26343d)' }}>

      {/* Header */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold mb-4"
          style={{ color: 'var(--ca-ink-faint)' }}
        >
          <ArrowLeft size={13} />
          Dashboard
        </Link>
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} style={{ color: 'var(--ca-red)' }} />
          <div>
            <h1 className="text-2xl font-black leading-none" style={{ letterSpacing: '-0.02em' }}>
              Overdue Items
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ca-ink-muted)' }}>
              {items.length} item{items.length !== 1 ? 's' : ''} past their due date — sorted by most overdue
            </p>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={card} className="px-8 py-16 text-center">
          <p className="text-lg font-black" style={{ color: 'var(--ca-teal)' }}>All clear</p>
          <p className="text-sm mt-1" style={{ color: 'var(--ca-ink-muted)' }}>No overdue work orders or projects.</p>
        </div>
      ) : (
        <div style={card} className="overflow-hidden">
          <div className="divide-y" style={{ '--tw-divide-color': 'var(--ca-card-high)' } as React.CSSProperties}>
            {items.map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                href={item.href}
                className="flex items-center gap-4 px-5 py-4 transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ca-section)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                {/* Days overdue badge */}
                <div
                  className="flex-shrink-0 rounded-lg px-2.5 py-1.5 text-center"
                  style={{
                    background: urgencyBg(item.daysOverdue),
                    minWidth: '4.5rem',
                  }}
                >
                  <p className="text-lg font-black leading-none" style={{ color: urgencyColor(item.daysOverdue), letterSpacing: '-0.02em' }}>
                    {item.daysOverdue}
                  </p>
                  <p className="text-[8px] font-black uppercase tracking-wider mt-0.5" style={{ color: urgencyColor(item.daysOverdue) }}>
                    days
                  </p>
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px]" style={{ color: 'var(--ca-ink-faint)' }}>{item.number}</span>
                    <span className="text-sm font-semibold truncate">{item.title}</span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded font-black flex-shrink-0"
                      style={{ background: TYPE_BG[item.type], color: TYPE_INK[item.type] }}
                    >
                      {TYPE_LABEL[item.type]}
                    </span>
                    {item.blocked && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full font-black"
                        style={{ background: 'var(--ca-amber-c, #fef3c7)', color: 'var(--ca-amber, #b45309)' }}>
                        BLOCKED
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--ca-ink-faint)' }}>
                      <Clock size={10} />
                      Was due {format(parseISO(item.dueDate), 'MMM d, yyyy')}
                    </span>
                    {item.assigneeName && (
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--ca-ink-faint)' }}>
                        <User size={10} />
                        {item.assigneeName}
                      </span>
                    )}
                    {item.blocked && item.blockedBy && (
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--ca-amber)' }}>
                        🔒 {item.blockedBy}
                      </span>
                    )}
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded font-black capitalize"
                      style={{ background: 'var(--ca-section)', color: 'var(--ca-ink-muted)' }}
                    >
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <span style={{ color: 'var(--ca-ink-faint)', fontSize: 12 }}>→</span>
              </Link>
            ))}
          </div>

          <div className="px-5 py-3" style={{ borderTop: '1px solid var(--ca-card-high)' }}>
            <p className="text-[10px]" style={{ color: 'var(--ca-ink-faint)' }}>
              {items.filter(i => i.daysOverdue >= 30).length} critical (30+ days) ·{' '}
              {items.filter(i => i.daysOverdue >= 7 && i.daysOverdue < 30).length} serious (7–29 days) ·{' '}
              {items.filter(i => i.daysOverdue < 7).length} recent (&lt;7 days)
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
