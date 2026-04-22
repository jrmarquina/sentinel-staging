'use client'

import { cn } from '@/lib/utils'
import { useT } from '@/lib/locale'
import type { BidStatus } from '@sentinel/db'
import type { TranslationKey } from '@/lib/translations/en'

const STATUS_KEY: Record<BidStatus, TranslationKey> = {
  pending:      'bid.status.pending',
  under_review: 'bid.status.under_review',
  accepted:     'bid.status.accepted',
  rejected:     'bid.status.rejected',
  withdrawn:    'bid.status.withdrawn',
}

const STATUS_COLOR: Record<BidStatus, string> = {
  pending:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  under_review: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  accepted:     'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  rejected:     'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  withdrawn:    'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
}

export function BidStatusBadge({ status, className }: { status: BidStatus; className?: string }) {
  const t = useT()
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', STATUS_COLOR[status], className)}>
      {t(STATUS_KEY[status])}
    </span>
  )
}
