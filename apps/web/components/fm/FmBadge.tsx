'use client'

import { cn } from '@/lib/utils'

export type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

interface FmBadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  pulse?: boolean
  className?: string
}

const DOT_COLOUR: Record<BadgeVariant, string> = {
  success: 'bg-[var(--teal)]',
  danger:  'bg-[var(--red)]',
  warning: 'bg-[var(--amber)]',
  info:    'bg-[var(--primary)]',
  neutral: 'bg-[var(--muted)]',
}

/** Maps common status/priority strings to a badge variant automatically */
export function statusVariant(status: string): BadgeVariant {
  const s = status.toUpperCase()
  if (['ACTIVE', 'COMPLETED', 'GOOD', 'PASS', 'RESOLVED', 'DONE'].some(v => s.includes(v)))    return 'success'
  if (['OVERDUE', 'CRITICAL', 'POOR', 'FAIL', 'HIGH', 'INACTIVE'].some(v => s.includes(v)))    return 'danger'
  if (['MAINTENANCE', 'IN_PROGRESS', 'MEDIUM', 'FAIR', 'PENDING'].some(v => s.includes(v)))     return 'warning'
  if (['OPEN', 'DRAFT', 'LOW', 'INFO'].some(v => s.includes(v)))                                return 'info'
  return 'neutral'
}

export function FmBadge({ children, variant = 'neutral', pulse = false, className }: FmBadgeProps) {
  return (
    <span className={cn(`fm-badge fm-badge-${variant}`, className)}>
      {pulse && (
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', DOT_COLOUR[variant])} />
          <span className={cn('relative inline-flex rounded-full h-2 w-2', DOT_COLOUR[variant])} />
        </span>
      )}
      {children}
    </span>
  )
}
