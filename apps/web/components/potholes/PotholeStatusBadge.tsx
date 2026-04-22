import { cn } from '@/lib/utils'
import { useT } from '@/lib/locale'
import type { PotholeStatus } from '@sentinel/db'
import type { TranslationKey } from '@/lib/translations/en'

const STATUS_KEY: Record<PotholeStatus, TranslationKey> = {
  reported:  'ph.status.reported',
  verified:  'ph.status.verified',
  assigned:  'ph.status.assigned',
  in_repair: 'ph.status.in_repair',
  repaired:  'ph.status.repaired',
  closed:    'ph.status.closed',
  recurring: 'ph.status.recurring',
}

const STATUS_COLOR: Record<PotholeStatus, string> = {
  reported:  'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  verified:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  assigned:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  in_repair: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  repaired:  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  closed:    'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
  recurring: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}

export function PotholeStatusBadge({ status, className }: { status: PotholeStatus; className?: string }) {
  const t = useT()
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', STATUS_COLOR[status], className)}>
      {t(STATUS_KEY[status])}
    </span>
  )
}
