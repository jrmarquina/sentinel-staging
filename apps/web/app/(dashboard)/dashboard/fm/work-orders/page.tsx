'use client'

import { useEffect, useState, useRef } from 'react'
import { Loader2, AlertTriangle, Trash2, ChevronDown } from 'lucide-react'

interface FmWorkOrder {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  fm_properties?: { name: string } | null
}

type TabValue = 'ALL' | 'OVERDUE' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED'

const PRIORITY_BADGE: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-green-100 text-green-700',
}

const STATUS_BADGE: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['OPEN', 'COMPLETED'],
  COMPLETED: ['OPEN'],
}

const TABS: { value: TabValue; label: string }[] = [
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'ALL', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
]

function isOverdue(wo: FmWorkOrder): boolean {
  return wo.status !== 'COMPLETED' && !!wo.due_date && new Date(wo.due_date) < new Date()
}

function StatusPopover({
  workOrder,
  onUpdate,
}: {
  workOrder: FmWorkOrder
  onUpdate: (id: string, status: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const transitions = STATUS_TRANSITIONS[workOrder.status] ?? []

  async function changeStatus(newStatus: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/fm/work-orders/${workOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        onUpdate(workOrder.id, newStatus)
      }
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        disabled={loading || transitions.length === 0}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-opacity ${STATUS_BADGE[workOrder.status] ?? 'bg-slate-100 text-slate-600'} ${transitions.length > 0 ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
      >
        {loading ? <Loader2 size={10} className="animate-spin" /> : null}
        {workOrder.status.replace(/_/g, ' ')}
        {transitions.length > 0 && <ChevronDown size={10} />}
      </button>
      {open && transitions.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[130px]">
          {transitions.map((s) => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); changeStatus(s) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FMWorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<FmWorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabValue>('ALL')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/fm/work-orders')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load work orders')
        return r.json() as Promise<FmWorkOrder[]>
      })
      .then(setWorkOrders)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function handleStatusUpdate(id: string, status: string) {
    setWorkOrders((prev) =>
      prev.map((wo) => (wo.id === id ? { ...wo, status } : wo))
    )
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/fm/work-orders/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setWorkOrders((prev) => prev.filter((wo) => wo.id !== id))
      }
    } finally {
      setDeleting(null)
      setConfirmDelete(null)
    }
  }

  const filtered = workOrders.filter((wo) => {
    if (activeTab === 'ALL') return true
    if (activeTab === 'OVERDUE') return isOverdue(wo)
    return wo.status === activeTab
  })

  const tabCount = (tab: TabValue) => {
    if (tab === 'ALL') return workOrders.length
    if (tab === 'OVERDUE') return workOrders.filter(isOverdue).length
    return workOrders.filter((wo) => wo.status === tab).length
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">FM Work Orders</h1>
          <p className="text-sm text-slate-500 mt-0.5">{workOrders.length} total work orders</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab.value
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white',
              tab.value === 'OVERDUE' && tabCount(tab.value) > 0 && activeTab !== 'OVERDUE'
                ? 'text-red-500'
                : '',
            ].join(' ')}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-slate-400">({tabCount(tab.value)})</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="py-16 text-center text-red-500">
          <AlertTriangle size={28} className="mx-auto mb-2" />
          <p>{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <p>No work orders found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((wo) => {
            const overdue = isOverdue(wo)
            return (
              <div
                key={wo.id}
                className={`bg-white dark:bg-slate-900 border rounded-xl p-5 flex flex-col gap-3 ${overdue ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900 dark:text-white leading-snug flex-1 min-w-0">
                    {wo.title}
                  </p>
                  <span
                    className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_BADGE[wo.priority] ?? 'bg-slate-100 text-slate-600'}`}
                  >
                    {wo.priority}
                  </span>
                </div>

                {wo.fm_properties?.name && (
                  <p className="text-xs text-slate-500">{wo.fm_properties.name}</p>
                )}

                {wo.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                    {wo.description.slice(0, 80)}{wo.description.length > 80 ? '…' : ''}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 mt-auto">
                  <StatusPopover workOrder={wo} onUpdate={handleStatusUpdate} />

                  {wo.due_date && (
                    <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                      Due {new Date(wo.due_date).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div className="flex justify-end">
                  {confirmDelete === wo.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Confirm delete?</span>
                      <button
                        onClick={() => handleDelete(wo.id)}
                        disabled={deleting === wo.id}
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        {deleting === wo.id ? 'Deleting...' : 'Yes'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(wo.id)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                      title="Delete work order"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
