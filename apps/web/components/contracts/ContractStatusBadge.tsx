'use client'

import { cn } from '@/lib/utils'
import { useT } from '@/lib/locale'
import type { ContractStatus } from '@sentinel/db'
import type { TranslationKey } from '@/lib/translations/en'

const STATUS_KEY: Record<ContractStatus, TranslationKey> = {
  draft:            'ct.status.draft',
  pending_approval: 'ct.status.pending_approval',
  active:           'ct.status.active',
  completed:        'ct.status.completed',
  terminated:       'ct.status.terminated',
  expired:          'ct.status.expired',
}

const STATUS_COLOR: Record<ContractStatus, string> = {
  draft:            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  pending_approval: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  active:           'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  completed:        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  terminated:       'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  expired:          'bg-red-500 text-white dark:bg-red-600 dark:text-white',
}

export function ContractStatusBadge({ status, className }: { status: ContractStatus; className?: string }) {
  const t = useT()
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', STATUS_COLOR[status], className)}>
      {t(STATUS_KEY[status])}
    </span>
  )
}
