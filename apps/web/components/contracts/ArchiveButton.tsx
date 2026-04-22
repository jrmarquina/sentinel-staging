'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, X } from 'lucide-react'
import { archiveContract } from '@/app/(dashboard)/dashboard/contracts/actions'

interface Props {
  contractId: string
  contractNumber: string
}

export function ArchiveButton({ contractId, contractNumber }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function handleArchive() {
    setError('')
    startTransition(async () => {
      const res = await archiveContract(contractId)
      if (res.error) { setError(res.error); return }
      router.refresh()
      setOpen(false)
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400"
      >
        <Archive size={14} />
        Archive
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Archive Contract</h2>
              <button
                onClick={() => { setOpen(false); setError('') }}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Mark <span className="font-semibold text-slate-900 dark:text-white">{contractNumber}</span> as expired?
              </p>
              <p className="text-xs text-slate-400">
                The contract will be listed as expired and filtered accordingly. This can be undone by editing the contract status.
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
                  onClick={handleArchive}
                  disabled={pending}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {pending ? 'Archiving…' : 'Archive'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
