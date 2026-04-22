'use client'

import { cn } from '@/lib/utils'
import { useT } from '@/lib/locale'
import type { WorkOrderPriority } from '@sentinel/db'
import type { TranslationKey } from '@/lib/translations/en'

const PRIORITY_KEY: Record<WorkOrderPriority, TranslationKey> = {
  P1: 'priority.P1',
  P2: 'priority.P2',
  P3: 'priority.P3',
  P4: 'priority.P4',
}

const PRIORITY_COLOR: Record<WorkOrderPriority, string> = {
  P1: 'bg-red-600 text-white',
  P2: 'bg-orange-500 text-white',
  P3: 'bg-yellow-400 text-yellow-900',
  P4: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
}

export function PriorityBadge({ priority, className }: { priority: WorkOrderPriority; className?: string }) {
  const t = useT()
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold', PRIORITY_COLOR[priority], className)}>
      {t(PRIORITY_KEY[priority])}
    </span>
  )
}
