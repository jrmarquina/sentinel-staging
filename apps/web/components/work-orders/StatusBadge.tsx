'use client'

import { cn } from '@/lib/utils'
import { useT } from '@/lib/locale'
import type { WorkOrderStatus } from '@sentinel/db'
import type { TranslationKey } from '@/lib/translations/en'

const STATUS_KEY: Record<WorkOrderStatus, TranslationKey> = {
  draft:       'status.draft',
  open:        'status.open',
  in_progress: 'status.in_progress',
  on_hold:     'status.on_hold',
  closed:      'status.closed',
  cancelled:   'status.cancelled',
}

const STATUS_COLOR: Record<WorkOrderStatus, string> = {
  draft:       'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  open:        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  on_hold:     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  closed:      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  cancelled:   'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
}

export function StatusBadge({ status, className }: { status: WorkOrderStatus; className?: string }) {
  const t = useT()
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', STATUS_COLOR[status], className)}>
      {t(STATUS_KEY[status])}
    </span>
  )
}
