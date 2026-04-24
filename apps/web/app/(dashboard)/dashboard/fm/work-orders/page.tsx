'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plus, Search, Loader2, AlertTriangle, X,
  ClipboardList, ChevronDown, Clock, Calendar,
  Wrench, Building2,
} from 'lucide-react'
import {
  FmCard, FmBadge, FmButton, FmModal,
  FmModalFooter, FmSectionLabel, statusVariant,
} from '@/components/fm'

// ── Types ──────────────────────────────────────────────────────────────────

interface FmProperty { id: string; name: string }

interface FmWorkOrder {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  assigned_to?: string | null
  fm_properties?: { id: string; name: string } | null
}

interface CreateForm {
  title: string; description: string
  priority: string; property_id: string; due_date: string
}

type FilterTab = 'ALL' | 'OVERDUE' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED'

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'ALL',         label: 'All' },
  { value: 'OVERDUE',     label: 'Overdue' },
  { value: 'OPEN',        label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED',   label: 'Completed' },
]

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const

const STATUS_TRANSITIONS: Record<string, string[]> = {
  OPEN:        ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED', 'OPEN'],
  COMPLETED:   ['OPEN'],
}

const EMPTY_FORM: CreateForm = {
  title: '', description: '', priority: 'MEDIUM', property_id: '', due_date: '',
}

function overdueWo(wo: FmWorkOrder): boolean {
  return wo.status !== 'COMPLETED' && !!wo.due_date && new Date(wo.due_date) < new Date()
}

function priorityVariant(p: string) {
  return p === 'HIGH' ? 'danger' as const :
         p === 'MEDIUM' ? 'warning' as const : 'success' as const
}

// ── Status popover ─────────────────────────────────────────────────────────

function StatusPopover({ wo, onUpdate }: { wo: FmWorkOrder; onUpdate: (id: string, status: string) => void }) {
  const [open, setOpen]       = useState(false)
  const [busy, setBusy]       = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const transitions = STATUS_TRANSITIONS[wo.status] ?? []

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function changeStatus(next: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/fm/work-orders/${wo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) onUpdate(wo.id, next)
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  const variant = statusVariant(wo.status)
  const canTransition = transitions.length > 0

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); if (canTransition) setOpen((o) => !o) }}
        disabled={busy || !canTransition}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.2rem 0.5rem',
          borderRadius: 9999, fontSize: '0.72rem', fontWeight: 700,
          cursor: canTransition ? 'pointer' : 'default',
          border: 'none',
          background:
            variant === 'success' ? 'var(--teal-c)'    :
            variant === 'warning' ? 'var(--amber-c)'   :
            variant === 'danger'  ? 'var(--red-c)'     :
            variant === 'info'    ? 'var(--primary-c)' : 'var(--card-b)',
          color:
            variant === 'success' ? 'var(--teal)'    :
            variant === 'warning' ? 'var(--amber)'   :
            variant === 'danger'  ? 'var(--red)'     :
            variant === 'info'    ? 'var(--primary)' : 'var(--muted)',
          opacity: busy ? 0.7 : 1,
          transition: 'opacity 0.15s ease',
        }}
      >
        {busy ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> : null}
        {wo.status.replace(/_/g, ' ')}
        {canTransition && <ChevronDown size={10} />}
      </button>

      {open && (
        <div style={{
          position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 30,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: 'var(--shadow-lg)',
          minWidth: 140, overflow: 'hidden',
        }}>
          {transitions.map((s) => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); changeStatus(s) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '0.6rem 0.875rem', fontSize: '0.8rem',
                color: 'var(--fg)', background: 'none', border: 'none',
                cursor: 'pointer', transition: 'background 0.12s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card-b)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              → {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Work Order Card ────────────────────────────────────────────────────────

function WoCard({
  wo, focused, onStatusUpdate,
}: {
  wo: FmWorkOrder
  focused: boolean
  onStatusUpdate: (id: string, status: string) => void
}) {
  const overdue = overdueWo(wo)
  const cardRef = useRef<HTMLDivElement>(null)

  // Scroll into view + flash when focused via deep-link
  useEffect(() => {
    if (!focused) return
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focused])

  return (
    <div
      ref={cardRef}
      style={{
        background: overdue ? 'var(--red-c)' : focused ? 'var(--primary-c)' : 'var(--card)',
        border: `1px solid ${overdue ? 'var(--red)' : focused ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 14,
        padding: '1rem 1.125rem',
        display: 'flex', flexDirection: 'column', gap: '0.625rem',
        boxShadow: 'var(--shadow)',
        transition: 'box-shadow 0.2s ease',
      }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
        <p style={{ flex: 1, fontWeight: 700, fontSize: '0.9rem', color: 'var(--fg)', margin: 0, lineHeight: 1.35 }}>
          {wo.title}
        </p>
        <FmBadge variant={priorityVariant(wo.priority)}>{wo.priority}</FmBadge>
      </div>

      {/* Property */}
      {wo.fm_properties && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
          <Building2 size={11} />
          <span>{wo.fm_properties.name}</span>
        </div>
      )}

      {/* Description */}
      {wo.description && (
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: 0, lineHeight: 1.45,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
          {wo.description}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.375rem' }}>
        <StatusPopover wo={wo} onUpdate={onStatusUpdate} />

        {wo.due_date && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem',
            color: overdue ? 'var(--red)' : 'var(--muted)', fontWeight: overdue ? 700 : 400 }}>
            <Clock size={11} />
            {overdue ? 'Overdue · ' : 'Due '}
            {new Date(wo.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FMWorkOrdersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus')

  const [workOrders, setWorkOrders] = useState<FmWorkOrder[]>([])
  const [properties, setProperties] = useState<FmProperty[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [activeTab, setActiveTab]   = useState<FilterTab>('ALL')
  const [search, setSearch]         = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm]             = useState<CreateForm>(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)

  // Auto-open overdue tab when there's a ?focus
  useEffect(() => {
    if (focusId) setActiveTab('ALL')
  }, [focusId])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/fm/work-orders').then((r) => {
        if (!r.ok) throw new Error('Failed to load work orders')
        return r.json() as Promise<FmWorkOrder[]>
      }),
      fetch('/api/fm/properties').then((r) => r.json() as Promise<FmProperty[]>),
    ])
      .then(([wo, p]) => {
        // Sort: overdue first, then by priority, then newest
        const sorted = [...wo].sort((a, b) => {
          if (overdueWo(a) && !overdueWo(b)) return -1
          if (!overdueWo(a) && overdueWo(b)) return 1
          return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
        })
        setWorkOrders(sorted)
        setProperties(p)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function handleStatusUpdate(id: string, status: string) {
    setWorkOrders((prev) => prev.map((wo) => wo.id === id ? { ...wo, status } : wo))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.title.trim()) { setFormError('Title is required'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/fm/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:       form.title.trim(),
          description: form.description.trim() || null,
          priority:    form.priority,
          property_id: form.property_id || null,
          due_date:    form.due_date || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to create work order')
      }
      setForm(EMPTY_FORM)
      setShowCreate(false)
      load()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  // ── Filter ──────────────────────────────────────────────────────────────
  const filtered = workOrders.filter((wo) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      wo.title.toLowerCase().includes(q) ||
      (wo.description ?? '').toLowerCase().includes(q) ||
      (wo.fm_properties?.name ?? '').toLowerCase().includes(q)
    const matchTab =
      activeTab === 'ALL' ? true :
      activeTab === 'OVERDUE' ? overdueWo(wo) :
      wo.status === activeTab
    return matchSearch && matchTab
  })

  function tabCount(tab: FilterTab) {
    if (tab === 'ALL')     return workOrders.length
    if (tab === 'OVERDUE') return workOrders.filter(overdueWo).length
    return workOrders.filter((wo) => wo.status === tab).length
  }

  const overdueCount = workOrders.filter(overdueWo).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Work Orders</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
            {workOrders.length} total
            {overdueCount > 0 && (
              <span style={{ color: 'var(--red)', fontWeight: 700, marginLeft: '0.4rem' }}>
                · {overdueCount} overdue
              </span>
            )}
          </p>
        </div>
        <FmButton icon={<Plus size={15} />} onClick={() => setShowCreate(true)} size="sm">
          New Work Order
        </FmButton>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Search by title, description or property…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="fm-input"
          style={{ paddingLeft: '2.25rem' }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {FILTER_TABS.map((t) => {
          const active  = activeTab === t.value
          const count   = tabCount(t.value)
          const isOverdueTab = t.value === 'OVERDUE'
          const hasOverdue   = isOverdueTab && count > 0
          return (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value)}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: 9999,
                fontSize: '0.72rem', fontWeight: 700,
                border: `1px solid ${active ? (hasOverdue ? 'var(--red)' : 'var(--primary)') : 'var(--border)'}`,
                background: active ? (hasOverdue ? 'var(--red-c)' : 'var(--primary-c)') : 'var(--card-b)',
                color: active ? (hasOverdue ? 'var(--red)' : 'var(--primary)') : (hasOverdue && !active ? 'var(--red)' : 'var(--muted)'),
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', gap: '0.35rem',
              }}
            >
              {t.label}
              <span style={{ opacity: 0.7, fontWeight: 800 }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
          <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--red)' }}>
          <AlertTriangle size={28} style={{ margin: '0 auto 0.75rem' }} />
          <p style={{ fontSize: '0.875rem' }}>{error}</p>
          <FmButton variant="secondary" size="sm" onClick={load} style={{ marginTop: '1rem' }}>Retry</FmButton>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
          <ClipboardList size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
          {search || activeTab !== 'ALL' ? 'No work orders match your filters' : 'No work orders yet'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.875rem' }}>
          {filtered.map((wo) => (
            <WoCard
              key={wo.id}
              wo={wo}
              focused={wo.id === focusId}
              onStatusUpdate={handleStatusUpdate}
            />
          ))}
        </div>
      )}

      {/* Create Work Order Modal */}
      <FmModal
        open={showCreate}
        onClose={() => { setShowCreate(false); setForm(EMPTY_FORM); setFormError(null) }}
        title="New Work Order"
        subtitle="Create a maintenance or repair work order"
      >
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {formError && (
            <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.8rem', color: 'var(--red)' }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {/* Title */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                Title <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                className="fm-input"
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Replace HVAC filter — Building A"
                autoFocus
              />
            </div>

            {/* Priority */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>Priority</label>
              <select className="fm-input" value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                style={{ appearance: 'none' }}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Due date */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                Due Date <span style={{ color: 'var(--faint)', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                className="fm-input"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>

            {/* Property */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>Property</label>
              <select className="fm-input" value={form.property_id}
                onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}
                style={{ appearance: 'none' }}>
                <option value="">— None —</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Description */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                Description <span style={{ color: 'var(--faint)', fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                className="fm-input"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe the issue or maintenance task…"
                style={{ resize: 'vertical', minHeight: 70 }}
              />
            </div>
          </div>

          <FmModalFooter>
            <FmButton type="button" variant="secondary" size="sm"
              onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); setFormError(null) }}>
              Cancel
            </FmButton>
            <FmButton type="submit" size="sm" loading={saving}>
              {saving ? 'Creating…' : 'Create Work Order'}
            </FmButton>
          </FmModalFooter>
        </form>
      </FmModal>

    </div>
  )
}
