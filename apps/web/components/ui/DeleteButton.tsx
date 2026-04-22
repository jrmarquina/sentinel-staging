'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, X } from 'lucide-react'
import { softDelete } from '@/app/(dashboard)/dashboard/delete-actions'

type DeletableTable = 'work_orders' | 'projects' | 'pothole_reports' | 'inspections' | 'contracts'

interface Props {
  id:         string
  table:      DeletableTable
  label:      string   // e.g. "Work Order WO-2026-0001"
  redirectTo: string   // e.g. "/dashboard/work-orders"
}

export function DeleteButton({ id, table, label, redirectTo }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    setError('')
    startTransition(async () => {
      const res = await softDelete({ id, table })
      if (res.error) { setError(res.error); return }
      router.push(redirectTo)
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Delete"
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      >
        <Trash2 size={14} />
        Delete
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Confirm Delete</h2>
              <button
                onClick={() => { setOpen(false); setError('') }}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-slate-900 dark:text-white">{label}</span>?
              </p>
              <p className="text-xs text-slate-400">
                This record will be hidden from all views. Linked work orders, inspections, and audit history will be preserved.
              </p>

              {error && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setOpen(false); setError('') }}
                  className="flex-1 px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={pending}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {pending ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
