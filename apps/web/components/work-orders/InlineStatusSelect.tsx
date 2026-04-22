'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/locale'
import { updateWorkOrderStatus } from '@/app/(dashboard)/dashboard/work-orders/actions'
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

const ALL_STATUSES: WorkOrderStatus[] = ['open', 'in_progress', 'on_hold', 'closed', 'cancelled', 'draft']

interface Props {
  workOrderId: string
  status: WorkOrderStatus
  /** When rendered inside a clickable row, set this to stop row navigation */
  stopPropagation?: boolean
  readonly?: boolean
}

export function InlineStatusSelect({ workOrderId, status: initialStatus, stopPropagation, readonly }: Props) {
  const t = useT()
  const [status, setStatus] = useState<WorkOrderStatus>(initialStatus)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  if (readonly) {
    return (
      <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', STATUS_COLOR[status])}>
        {t(STATUS_KEY[status])}
      </span>
    )
  }

  function handleSelect(next: WorkOrderStatus) {
    if (next === status) { setOpen(false); return }
    const prev = status
    setStatus(next) // optimistic
    setOpen(false)
    setError(null)
    startTransition(async () => {
      const result = await updateWorkOrderStatus(workOrderId, next)
      if (result.error) {
        setStatus(prev) // revert
        setError(result.error)
      }
    })
  }

  return (
    <div
      className="relative inline-block"
      ref={ref}
      onClick={(e) => { if (stopPropagation) e.stopPropagation() }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        title={error ?? undefined}
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-opacity cursor-pointer select-none',
          STATUS_COLOR[status],
          isPending && 'opacity-60',
          error && 'ring-1 ring-red-400',
        )}
      >
        {t(STATUS_KEY[status])}
        <ChevronDown size={10} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => handleSelect(s)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded font-medium', STATUS_COLOR[s])}>
                {t(STATUS_KEY[s])}
              </span>
              {s === status && <Check size={11} className="text-slate-400 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
