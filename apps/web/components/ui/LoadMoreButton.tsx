'use client'

import { ChevronDown, Loader2 } from 'lucide-react'

interface Props {
  loadedCount: number
  totalCount: number
  isPending: boolean
  onLoadMore: () => void
}

export function LoadMoreButton({ loadedCount, totalCount, isPending, onLoadMore }: Props) {
  if (loadedCount >= totalCount) return null

  const remaining = totalCount - loadedCount

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <p className="text-xs text-slate-400">
        Showing {loadedCount.toLocaleString()} of {totalCount.toLocaleString()} records
      </p>
      <button
        onClick={onLoadMore}
        disabled={isPending}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
      >
        {isPending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <ChevronDown size={14} />
        )}
        {isPending ? 'Loading…' : `Load ${Math.min(remaining, 100)} more`}
      </button>
    </div>
  )
}
