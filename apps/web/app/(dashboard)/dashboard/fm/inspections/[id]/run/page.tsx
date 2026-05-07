'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface ChecklistItem {
  id: string; key: string; label: string
  result: string | null; severity: string | null; notes: string | null
}

interface FmInspection {
  id: string; status: string
  fm_inspection_items?: ChecklistItem[]
}

type Result   = 'PASS' | 'FAIL' | 'NA'
type Severity = 'LOW' | 'MEDIUM' | 'HIGH'

interface ItemState {
  result: string | null; severity: string | null; notes: string | null
}

// ── Result / Severity button styles ───────────────────────────────────────

const RESULT_CONFIG: { value: Result; label: string; activeColor: string; activeBg: string; hoverBg: string }[] = [
  { value: 'PASS', label: 'PASS',  activeColor: '#fff',          activeBg: 'var(--teal)',  hoverBg: 'var(--teal-c)' },
  { value: 'FAIL', label: 'FAIL',  activeColor: '#fff',          activeBg: 'var(--red)',   hoverBg: 'var(--red-c)' },
  { value: 'NA',   label: 'N / A', activeColor: 'var(--card)',   activeBg: 'var(--muted)', hoverBg: 'var(--card-b)' },
]

const SEVERITY_CONFIG: { value: Severity; label: string; color: string; bg: string }[] = [
  { value: 'LOW',    label: 'Low',    color: 'var(--amber)', bg: 'var(--amber-c)' },
  { value: 'MEDIUM', label: 'Medium', color: 'var(--red)',   bg: 'var(--red-c)' },
  { value: 'HIGH',   label: 'High',   color: '#fff',         bg: 'var(--red)' },
]

// ── Main Component ─────────────────────────────────────────────────────────

export default function InspectionRunPage() {
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [items, setItems]         = useState<ChecklistItem[]>([])
  const [itemState, setItemState] = useState<Record<string, ItemState>>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const dirty = useRef<Set<string>>(new Set())
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/fm/inspections/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Inspección no encontrada')
        return r.json() as Promise<FmInspection>
      })
      .then((data) => {
        const fetched = data.fm_inspection_items ?? []
        setItems(fetched)
        const state: Record<string, ItemState> = {}
        for (const item of fetched) {
          state[item.key] = { result: item.result, severity: item.severity, notes: item.notes }
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

  // Debounced auto-save
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

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: '0.75rem' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>Cargando inspección…</p>
      </div>
    )
  }

  // ── Error / Empty ─────────────────────────────────────────────────────────
  if (error || items.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: '0.75rem', color: 'var(--red)' }}>
        <AlertTriangle size={28} />
        <p style={{ fontSize: '1rem', fontWeight: 600 }}>{error ?? 'No se encontraron ítems de verificación'}</p>
        <button
          onClick={() => router.push('/dashboard/fm/inspections')}
          style={{ fontSize: '0.875rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Volver a Inspecciones
        </button>
      </div>
    )
  }

  const currentItem = items[currentIndex]
  const currentKey  = currentItem.key
  const state       = itemState[currentKey] ?? { result: null, severity: null, notes: null }
  const isLast      = currentIndex === items.length - 1
  const progress    = ((currentIndex + 1) / items.length) * 100

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minHeight: 'calc(100vh - 8rem)',
      maxWidth: 480, margin: '0 auto',
    }}>
      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{
          height: '100%', background: 'var(--primary)',
          width: `${progress}%`, transition: 'width 0.3s ease',
          borderRadius: 9999,
        }} />
      </div>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.875rem 0.25rem',
      }}>
        <button
          onClick={() => router.push(`/dashboard/fm/inspections/${id}`)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontSize: '0.875rem', color: 'var(--muted)',
            background: 'none', border: 'none', cursor: 'pointer',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
        >
          <ArrowLeft size={16} />
          Salir
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          {saving && (
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Guardando
            </span>
          )}
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--muted)' }}>
            {currentIndex + 1} <span style={{ fontWeight: 400 }}>de</span> {items.length}
          </span>
        </div>

        <button
          onClick={saveDirty}
          disabled={saving}
          style={{
            fontSize: '0.875rem', color: 'var(--primary)',
            background: 'none', border: 'none', cursor: 'pointer',
            fontWeight: 600, opacity: saving ? 0.5 : 1,
          }}
        >
          Guardar
        </button>
      </div>

      {/* Item card */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0.5rem 0.25rem' }}>
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 20, padding: '1.5rem 1.5rem',
          boxShadow: 'var(--shadow)',
          display: 'flex', flexDirection: 'column', gap: '1.5rem',
        }}>
          {/* Label */}
          <div>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              Ítem {currentIndex + 1}
            </p>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--fg)', lineHeight: 1.3, margin: 0 }}>
              {currentItem.label}
            </h2>
          </div>

          {/* PASS / FAIL / NA buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            {RESULT_CONFIG.map((btn) => {
              const isActive = state.result === btn.value
              return (
                <button
                  key={btn.value}
                  onClick={() => updateItem(currentKey, {
                    result: btn.value,
                    ...(btn.value !== 'FAIL' ? { severity: null } : {}),
                  })}
                  style={{
                    padding: '1rem 0.5rem',
                    borderRadius: 14,
                    border: `2px solid ${isActive ? btn.activeBg : 'var(--border)'}`,
                    background: isActive ? btn.activeBg : 'var(--card-b)',
                    color: isActive ? btn.activeColor : 'var(--fg)',
                    fontSize: '1rem', fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    touchAction: 'manipulation',
                  }}
                >
                  {btn.label}
                </button>
              )
            })}
          </div>

          {/* Severity (shown only on FAIL) */}
          {state.result === 'FAIL' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Severidad</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                {SEVERITY_CONFIG.map((btn) => {
                  const isActive = state.severity === btn.value
                  return (
                    <button
                      key={btn.value}
                      onClick={() => updateItem(currentKey, { severity: btn.value })}
                      style={{
                        padding: '0.75rem 0.5rem',
                        borderRadius: 12,
                        border: `2px solid ${isActive ? btn.bg : 'var(--border)'}`,
                        background: isActive ? btn.bg : 'var(--card-b)',
                        color: isActive ? btn.color : 'var(--fg)',
                        fontSize: '0.875rem', fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        touchAction: 'manipulation',
                      }}
                    >
                      {btn.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Notes (shown only on FAIL) */}
          {state.result === 'FAIL' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Notas</p>
              <textarea
                value={state.notes ?? ''}
                onChange={(e) => updateItem(currentKey, { notes: e.target.value })}
                rows={3}
                placeholder="Describir el problema…"
                className="fm-input"
                style={{ resize: 'vertical', fontSize: '0.9rem', minHeight: 70 }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ padding: '0.5rem 0.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {isLast && (
          <button
            onClick={handleComplete}
            disabled={completing}
            style={{
              width: '100%', padding: '1.1rem',
              background: completing ? 'var(--teal-c)' : 'var(--teal)',
              border: 'none', borderRadius: 16,
              color: '#fff', fontSize: '1.05rem', fontWeight: 800,
              cursor: completing ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              opacity: completing ? 0.8 : 1,
              transition: 'opacity 0.15s ease',
              touchAction: 'manipulation',
            }}
          >
            {completing
              ? <><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Completando…</>
              : <><CheckCircle2 size={20} /> Completar Inspección</>
            }
          </button>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
          <button
            onClick={() => navigate(-1)}
            disabled={currentIndex === 0}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              padding: '0.9rem',
              background: 'var(--card-b)', border: '1px solid var(--border)',
              borderRadius: 14, color: 'var(--fg)', fontSize: '0.95rem', fontWeight: 700,
              cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
              opacity: currentIndex === 0 ? 0.4 : 1,
              transition: 'opacity 0.15s ease',
              touchAction: 'manipulation',
            }}
          >
            <ArrowLeft size={18} /> Anterior
          </button>
          <button
            onClick={() => navigate(1)}
            disabled={isLast}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              padding: '0.9rem',
              background: isLast ? 'var(--card-b)' : 'var(--primary)',
              border: isLast ? '1px solid var(--border)' : 'none',
              borderRadius: 14, color: isLast ? 'var(--muted)' : '#fff',
              fontSize: '0.95rem', fontWeight: 700,
              cursor: isLast ? 'not-allowed' : 'pointer',
              opacity: isLast ? 0.4 : 1,
              transition: 'all 0.15s ease',
              touchAction: 'manipulation',
            }}
          >
            Siguiente <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
