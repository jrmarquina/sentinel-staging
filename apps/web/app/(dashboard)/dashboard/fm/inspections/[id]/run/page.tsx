'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react'

interface ChecklistItem {
  id: string
  key: string
  label: string
  result: string | null
  severity: string | null
  notes: string | null
}

interface FmInspection {
  id: string
  status: string
  fm_inspection_items?: ChecklistItem[]
}

type Result = 'PASS' | 'FAIL' | 'NA'
type Severity = 'LOW' | 'MEDIUM' | 'HIGH'

interface ItemState {
  result: string | null
  severity: string | null
  notes: string | null
}

export default function InspectionRunPage() {
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [items, setItems] = useState<ChecklistItem[]>([])
  const [itemState, setItemState] = useState<Record<string, ItemState>>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = useRef<Set<string>>(new Set())
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/fm/inspections/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Inspection not found')
        return r.json() as Promise<FmInspection>
      })
      .then((data) => {
        const fetched = data.fm_inspection_items ?? []
        setItems(fetched)
        const state: Record<string, ItemState> = {}
        for (const item of fetched) {
          state[item.key] = {
            result: item.result,
            severity: item.severity,
            notes: item.notes,
          }
        }
        setItemState(state)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [id])

  const saveDirty = useCallback(async () => {
    if (dirty.current.size === 0) return
    const keysToSave = Array.from(dirty.current)
    dirty.current.clear()
    setSaving(true)
    try {
      const updates = keysToSave.map((key) => ({
        key,
        ...(itemState[key] ?? { result: null, severity: null, notes: null }),
      }))
      await fetch(`/api/fm/inspections/${id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updates }),
      })
    } finally {
      setSaving(false)
    }
  }, [id, itemState])

  // Debounced auto-save on itemState change
  useEffect(() => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => { void saveDirty() }, 1500)
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current) }
  }, [itemState, saveDirty])

  function updateItem(key: string, patch: Partial<ItemState>) {
    setItemState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
    dirty.current.add(key)
  }

  async function navigate(delta: number) {
    await saveDirty()
    setCurrentIndex((i) => Math.max(0, Math.min(items.length - 1, i + delta)))
  }

  async function handleComplete() {
    await saveDirty()
    setCompleting(true)
    try {
      const res = await fetch(`/api/fm/inspections/${id}/complete`, { method: 'POST' })
      if (res.ok) {
        router.push(`/dashboard/fm/inspections/${id}`)
      }
    } finally {
      setCompleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3">
        <Loader2 size={32} className="animate-spin text-slate-400" />
        <p className="text-sm text-slate-500">Loading inspection...</p>
      </div>
    )
  }

  if (error || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3 text-red-500">
        <p className="text-lg font-medium">{error ?? 'No checklist items found'}</p>
        <button onClick={() => router.push('/dashboard/fm/inspections')} className="text-sm text-blue-600 hover:underline">
          Back to inspections
        </button>
      </div>
    )
  }

  const currentItem = items[currentIndex]
  const currentKey = currentItem.key
  const state = itemState[currentKey] ?? { result: null, severity: null, notes: null }
  const isLast = currentIndex === items.length - 1
  const progress = ((currentIndex + 1) / items.length) * 100

  const RESULT_BUTTONS: { value: Result; label: string; active: string; inactive: string }[] = [
    {
      value: 'PASS',
      label: 'PASS',
      active: 'bg-green-500 text-white border-green-500',
      inactive: 'bg-white dark:bg-slate-900 text-green-600 border-green-300 hover:bg-green-50',
    },
    {
      value: 'FAIL',
      label: 'FAIL',
      active: 'bg-red-500 text-white border-red-500',
      inactive: 'bg-white dark:bg-slate-900 text-red-600 border-red-300 hover:bg-red-50',
    },
    {
      value: 'NA',
      label: 'N/A',
      active: 'bg-slate-500 text-white border-slate-500',
      inactive: 'bg-white dark:bg-slate-900 text-slate-500 border-slate-300 hover:bg-slate-50',
    },
  ]

  const SEVERITY_BUTTONS: { value: Severity; label: string; active: string; inactive: string }[] = [
    { value: 'LOW', label: 'Low', active: 'bg-yellow-500 text-white border-yellow-500', inactive: 'bg-white dark:bg-slate-900 text-yellow-600 border-yellow-300 hover:bg-yellow-50' },
    { value: 'MEDIUM', label: 'Medium', active: 'bg-orange-500 text-white border-orange-500', inactive: 'bg-white dark:bg-slate-900 text-orange-600 border-orange-300 hover:bg-orange-50' },
    { value: 'HIGH', label: 'High', active: 'bg-red-700 text-white border-red-700', inactive: 'bg-white dark:bg-slate-900 text-red-700 border-red-300 hover:bg-red-50' },
  ]

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] max-w-lg mx-auto">
      {/* Progress bar */}
      <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Top bar */}
      <div className="flex items-center justify-between py-3 px-1">
        <button
          onClick={() => router.push(`/dashboard/fm/inspections/${id}`)}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Exit
        </button>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Saving</span>}
          <span className="text-sm font-medium text-slate-500">
            {currentIndex + 1} of {items.length}
          </span>
        </div>
        <button
          onClick={saveDirty}
          disabled={saving}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
        >
          Save
        </button>
      </div>

      {/* Item card */}
      <div className="flex-1 flex flex-col justify-center px-1 py-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-6">
          {/* Label */}
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Item {currentIndex + 1}</p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-snug">
              {currentItem.label}
            </h2>
          </div>

          {/* Result buttons */}
          <div className="grid grid-cols-3 gap-3">
            {RESULT_BUTTONS.map((btn) => (
              <button
                key={btn.value}
                onClick={() => updateItem(currentKey, { result: btn.value, ...(btn.value !== 'FAIL' ? { severity: null } : {}) })}
                className={`py-4 rounded-xl border-2 text-base font-bold transition-all ${state.result === btn.value ? btn.active : btn.inactive}`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Severity (only if FAIL) */}
          {state.result === 'FAIL' && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Severity</p>
              <div className="grid grid-cols-3 gap-2">
                {SEVERITY_BUTTONS.map((btn) => (
                  <button
                    key={btn.value}
                    onClick={() => updateItem(currentKey, { severity: btn.value })}
                    className={`py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${state.severity === btn.value ? btn.active : btn.inactive}`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes (only if FAIL) */}
          {state.result === 'FAIL' && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes</p>
              <textarea
                value={state.notes ?? ''}
                onChange={(e) => updateItem(currentKey, { notes: e.target.value })}
                rows={3}
                placeholder="Describe the issue..."
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="pb-4 space-y-3 px-1">
        {isLast ? (
          <button
            onClick={handleComplete}
            disabled={completing}
            className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold text-base rounded-xl transition-colors inline-flex items-center justify-center gap-2"
          >
            {completing
              ? <><Loader2 size={18} className="animate-spin" /> Completing...</>
              : <><CheckCircle2 size={18} /> Complete Inspection</>
            }
          </button>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate(-1)}
            disabled={currentIndex === 0}
            className="flex items-center justify-center gap-2 py-3 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={18} />
            Previous
          </button>
          <button
            onClick={() => navigate(1)}
            disabled={isLast}
            className="flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
          >
            Next
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
