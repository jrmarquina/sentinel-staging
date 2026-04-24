'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type BtnSize    = 'sm' | 'md' | 'lg'

interface FmButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: BtnSize
  loading?: boolean
  icon?: React.ReactNode
}

const SIZE: Record<BtnSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3   text-base',
}

export function FmButton({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  disabled,
  ...props
}: FmButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(`fm-btn fm-btn-${variant}`, SIZE[size], className)}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}
