'use client'

import { cn } from '@/lib/utils'

interface FmCardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  /** Highlight colour ring: 'primary' | 'danger' | 'warning' | 'success' */
  highlight?: 'primary' | 'danger' | 'warning' | 'success'
  style?: React.CSSProperties
}

const HIGHLIGHT: Record<string, string> = {
  primary: 'border-[var(--primary)] shadow-[0_0_16px_var(--primary-c)]',
  danger:  'border-[var(--red)]     shadow-[0_0_16px_var(--red-c)]',
  warning: 'border-[var(--amber)]   shadow-[0_0_16px_var(--amber-c)]',
  success: 'border-[var(--teal)]    shadow-[0_0_16px_var(--teal-c)]',
}

export function FmCard({ children, className, onClick, highlight, style }: FmCardProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'fm-card',
        highlight && HIGHLIGHT[highlight],
        onClick && 'cursor-pointer w-full text-left',
        className,
      )}
      style={style}
    >
      {children}
    </Tag>
  )
}
