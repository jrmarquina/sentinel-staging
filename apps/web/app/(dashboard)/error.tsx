'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Dashboard-level error boundary.
 *
 * Catches unhandled errors thrown by any Server or Client Component
 * inside the (dashboard) route group. Replaces the generic Next.js
 * "Application error" screen with an actionable message.
 */
export default function DashboardError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to console so the user can still see it in DevTools
    console.error('[DashboardError]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
          <AlertTriangle size={28} className="text-red-600 dark:text-red-400" />
        </div>

        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Something went wrong
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            An error occurred while loading this page.
          </p>
        </div>

        {/* Show the actual error message so we can diagnose it */}
        {error.message && (
          <pre className="text-xs text-left bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 p-3 rounded-lg overflow-auto max-h-40 whitespace-pre-wrap break-all">
            {error.message}
            {error.digest ? `\n\nDigest: ${error.digest}` : ''}
          </pre>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <RefreshCw size={14} />
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
