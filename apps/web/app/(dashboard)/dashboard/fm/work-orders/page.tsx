'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plus, Search, Loader2, AlertTriangle, X,
  ClipboardList, ChevronDown, Clock, Building2, Tag, UserCheck,
} from 'lucide-react'
import {
  FmCard, FmBadge, FmButton, FmModal,
  FmModalFooter, FmSectionLabel, statusVariant,
} from '@/components/fm'
import { createClient } from '@/lib/supabase/client'
import { useFmT, useLocale } from '@/lib/locale'

// ── Types ──────────────────────────────────────────────────────────────────

interface FmProperty { id: string; name: string }
interface FmUser    { id: string; full_name: string | null; email: string }

interface FmWorkOrder {
  id:             string
  title:          string
  description:    string | null
  status:         string
  priority:       string
  category:       string | null
  assignee_type:  string | null
  due_date:       string | null
  submitted_by_id?: string | null
  assigned_to_id?:  string | null
  fm_properties?:   { id: string; name: string } | null
}

interface CreateForm {
  title:          string
  description:    string
  priority:       string
  property_id:    string
  due_date:       string
  // Manager-only fields
  category:       string
  assignee_type:  string
  assigned_to_id: string
}

type FmAccessLevel = 'manager' | 'viewer' | 'contributor' | 'worker' | null
type FilterTab = 'ALL' | 'PENDING_REVIEW' | 'OVERDUE' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED'

// ── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'PLOMERIA',           label: 'Plomería' },
  { value: 'CARPINTERIA',        label: 'Carpintería' },
  { value: 'ELECTRICIDAD',       label: 'Electricidad' },
  { value: 'CISTERNA',           label: 'Cisterna' },
  { value: 'TRAMPA_GRASA',       label: 'Trampa Grasa' },
  { value: 'AREAS_VERDES',       label: 'Áreas Verdes' },
  { value: 'AIRE_ACONDICIONADO', label: 'Aire Acondicionado' },
  { value: 'REFRIGERACION',      label: 'Refrigeración' },
  { value: 'ALARMA_INCENDIO',    label: 'Alarma de Incendio' },
  { value: 'EXTINTORES',         label: 'Extintores' },
  { value: 'CONTROL_ACCESO',     label: 'Control de Acceso' },
  { value: 'CONTROL_PLAGAS',     label: 'Control de Plagas' },
  { value: 'ESTRUCTURA',         label: 'Estructura' },
  { value: 'FILTRACIONES',       label: 'Filtraciones' },
  { value: 'GENERADOR',          label: 'Generador' },
  { value: 'PINTURA',            label: 'Pintura' },
  { value: 'POZO_SEPTICO',       label: 'Pozo Séptico' },
  { value: 'ROTULACION',         label: 'Rotulación' },
]

const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

// Status transitions visible by role
const MANAGER_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING_REVIEW: ['OPEN'],
  OPEN:           ['IN_PROGRESS', 'COMPLETED'],
  IN_PROGRESS:    ['COMPLETED', 'OPEN'],
  COMPLETED:      ['OPEN'],
}
const WORKER_STATUS_TRANSITIONS: Record<string, string[]> = {
  OPEN:        ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
}

const EMPTY_FORM: CreateForm = {
  title: '', description: '', priority: 'MEDIUM',
  property_id: '', due_date: '',
  category: '', assignee_type: '', assigned_to_id: '',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getFmAccessLevel(capability: string | null, role: string): FmAccessLevel {
  if (capability) {
    if (['org_admin', 'org_manager'].includes(capability)) return 'manager'
    if (capability === 'org_viewer')  return 'viewer'
    if (capability === 'contributor') return 'contributor'
    if (capability === 'worker')      return 'worker'
    return null
  }
  // Legacy app_role fallback
  if (['admin', 'supervisor'].includes(role)) return 'manager'
  if (role === 'viewer')    return 'viewer'
  if (role === 'inspector') return 'contributor'
  if (role === 'vendor')    return 'worker'
  return null
}

function categoryLabel(value: string | null) {
  if (!value) return null
  return CATEGORIES.find((c) => c.value === value)?.label ?? value.replace(/_/g, ' ')
}

function overdueWo(wo: FmWorkOrder): boolean {
  return wo.status !== 'COMPLETED' && !!wo.due_date && new Date(wo.due_date) < new Date()
}

function priorityVariant(p: string) {
  return p === 'HIGH' ? 'danger' as const :
         p === 'MEDIUM' ? 'warning' as const : 'success' as const
}

// ── Status popover ─────────────────────────────────────────────────────────

function StatusPopover({
  wo, isManager, onUpdate,
}: {
  wo: FmWorkOrder
  isManager: boolean
  onUpdate: (id: string, status: string) => void
}) {
  const t = useFmT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const STATUS_LABELS: Record<string, string> = {
    PENDING_REVIEW: t('wo.fm.status.PENDING_REVIEW'),
    OPEN:           t('wo.fm.status.OPEN'),
    IN_PROGRESS:    t('wo.fm.status.IN_PROGRESS'),
    COMPLETED:      t('wo.fm.status.COMPLETED'),
  }

  const transitionMap = isManager ? MANAGER_STATUS_TRANSITIONS : WORKER_STATUS_TRANSITIONS
  const transitions   = transitionMap[wo.status] ?? []

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

  // PENDING_REVIEW gets a special amber treatment
  const isPending = wo.status === 'PENDING_REVIEW'
  const bg =
    isPending         ? 'var(--amber-c)'   :
    variant === 'success' ? 'var(--teal-c)'    :
    variant === 'warning' ? 'var(--amber-c)'   :
    variant === 'danger'  ? 'var(--red-c)'     :
    variant === 'info'    ? 'var(--primary-c)' : 'var(--card-b)'
  const fg =
    isPending         ? 'var(--amber)'     :
    variant === 'success' ? 'var(--teal)'      :
    variant === 'warning' ? 'var(--amber)'     :
    variant === 'danger'  ? 'var(--red)'       :
    variant === 'info'    ? 'var(--primary)'   : 'var(--muted)'

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); if (canTransition) setOpen((o) => !o) }}
        disabled={busy || !canTransition}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.2rem 0.5rem', borderRadius: 9999,
          fontSize: '0.72rem', fontWeight: 700,
          cursor: canTransition ? 'pointer' : 'default',
          border: 'none', background: bg, color: fg,
          opacity: busy ? 0.7 : 1, transition: 'opacity 0.15s ease',
        }}
      >
        {busy ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> : null}
        {STATUS_LABELS[wo.status] ?? wo.status.replace(/_/g, ' ')}
        {canTransition && <ChevronDown size={10} />}
      </button>

      {open && (
        <div style={{
          position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 30,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: 'var(--shadow-lg)',
          minWidth: 160, overflow: 'hidden',
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
              → {STATUS_LABELS[s] ?? s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Work Order Card ────────────────────────────────────────────────────────

function WoCard({
  wo, focused, isManager, onStatusUpdate,
}: {
  wo: FmWorkOrder
  focused: boolean
  isManager: boolean
  onStatusUpdate: (id: string, status: string) => void
}) {
  const t = useFmT()
  const { locale } = useLocale()
  const overdue    = overdueWo(wo)
  const isPending  = wo.status === 'PENDING_REVIEW'
  const cardRef    = useRef<HTMLDivElement>(null)
  const catLabel   = categoryLabel(wo.category)

  const ASSIGNEE_TYPES: { value: string; label: string }[] = [
    { value: 'HS_STAFF',           label: t('wo.fm.assignee.HS_STAFF') },
    { value: 'MUNICIPALITY',       label: t('wo.fm.assignee.MUNICIPALITY') },
    { value: 'EXTERNAL_SUPPLIER',  label: t('wo.fm.assignee.EXTERNAL_SUPPLIER') },
    { value: 'DIRECTOR_REFERRAL',  label: t('wo.fm.assignee.DIRECTOR_REFERRAL') },
  ]

  useEffect(() => {
    if (!focused) return
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focused])

  const borderColor =
    overdue   ? 'var(--red)'     :
    isPending ? 'var(--amber)'   :
    focused   ? 'var(--primary)' : 'var(--border)'
  const bgColor =
    overdue   ? 'var(--red-c)'     :
    isPending ? 'var(--amber-c)'   :
    focused   ? 'var(--primary-c)' : 'var(--card)'

  return (
    <div
      ref={cardRef}
      style={{
        background: bgColor, border: `1px solid ${borderColor}`,
        borderRadius: 14, padding: '1rem 1.125rem',
        display: 'flex', flexDirection: 'column', gap: '0.625rem',
        boxShadow: 'var(--shadow)', transition: 'box-shadow 0.2s ease',
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

      {/* Category + Assignee type row */}
      {(catLabel || wo.assignee_type) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {catLabel && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
              fontSize: '0.7rem', fontWeight: 600,
              background: 'var(--card-b)', color: 'var(--muted)',
              borderRadius: 6, padding: '0.15rem 0.5rem',
              border: '1px solid var(--border)',
            }}>
              <Tag size={9} />
              {catLabel}
            </span>
          )}
          {wo.assignee_type && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
              fontSize: '0.7rem', fontWeight: 600,
              background: 'var(--primary-c)', color: 'var(--primary)',
              borderRadius: 6, padding: '0.15rem 0.5rem',
            }}>
              <UserCheck size={9} />
              {ASSIGNEE_TYPES.find((a) => a.value === wo.assignee_type)?.label ?? wo.assignee_type}
            </span>
          )}
        </div>
      )}

      {/* Description */}
      {wo.description && (
        <p style={{
          fontSize: '0.8rem', color: 'var(--muted)', margin: 0, lineHeight: 1.45,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
        }}>
          {wo.description}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.375rem' }}>
        <StatusPopover wo={wo} isManager={isManager} onUpdate={onStatusUpdate} />

        {wo.due_date && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem',
            color: overdue ? 'var(--red)' : 'var(--muted)', fontWeight: overdue ? 700 : 400,
          }}>
            <Clock size={11} />
            {overdue ? t('wo.fm.overdueDue') : t('wo.fm.due')}
            {new Date(wo.due_date).toLocaleDateString(locale === 'es' ? 'es-PR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Create Form — Manager ──────────────────────────────────────────────────

function ManagerCreateForm({
  form, setForm, fmUsers, properties, saving, formError, onSubmit, onClose,
}: {
  form:        CreateForm
  setForm:     React.Dispatch<React.SetStateAction<CreateForm>>
  fmUsers:     FmUser[]
  properties:  FmProperty[]
  saving:      boolean
  formError:   string | null
  onSubmit:    (e: React.FormEvent) => void
  onClose:     () => void
}) {
  const t = useFmT()

  const ASSIGNEE_TYPES: { value: string; label: string }[] = [
    { value: 'HS_STAFF',           label: t('wo.fm.assignee.HS_STAFF') },
    { value: 'MUNICIPALITY',       label: t('wo.fm.assignee.MUNICIPALITY') },
    { value: 'EXTERNAL_SUPPLIER',  label: t('wo.fm.assignee.EXTERNAL_SUPPLIER') },
    { value: 'DIRECTOR_REFERRAL',  label: t('wo.fm.assignee.DIRECTOR_REFERRAL') },
  ]

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {formError && (
        <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.8rem', color: 'var(--red)' }}>
          {formError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {/* Title */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
            {t('wo.fm.form.title')} <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <input className="fm-input" type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={t('wo.fm.form.titlePlaceholder')}
            autoFocus
          />
        </div>

        {/* Category */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
            {t('wo.fm.form.category')} <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <select className="fm-input" value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            style={{ appearance: 'none' }}>
            <option value="">{t('wo.fm.form.selectCat')}</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {/* Priority */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>{t('wo.fm.form.priority')}</label>
          <select className="fm-input" value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            style={{ appearance: 'none' }}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Due date */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
            {t('wo.fm.form.dueDate')} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>({t('optional')})</span>
          </label>
          <input className="fm-input" type="date" value={form.due_date}
            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
          />
        </div>

        {/* Assignee type */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
            {t('wo.fm.form.assigneeType')} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>({t('optional')})</span>
          </label>
          <select className="fm-input" value={form.assignee_type}
            onChange={(e) => setForm((f) => ({ ...f, assignee_type: e.target.value, assigned_to_id: '' }))}
            style={{ appearance: 'none' }}>
            <option value="">{t('wo.fm.form.unassigned')}</option>
            {ASSIGNEE_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>

        {/* Assigned to (only for HS_STAFF or MUNICIPALITY) */}
        {(form.assignee_type === 'HS_STAFF' || form.assignee_type === 'MUNICIPALITY') && (
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
              {t('wo.fm.form.assignTo')} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>({t('optional')})</span>
            </label>
            <select className="fm-input" value={form.assigned_to_id}
              onChange={(e) => setForm((f) => ({ ...f, assigned_to_id: e.target.value }))}
              style={{ appearance: 'none' }}>
              <option value="">{t('wo.fm.form.pickPerson')}</option>
              {fmUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>
              ))}
            </select>
          </div>
        )}

        {/* Property */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>{t('wo.fm.form.property')}</label>
          <select className="fm-input" value={form.property_id}
            onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}
            style={{ appearance: 'none' }}>
            <option value="">{t('wo.fm.form.none')}</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Description */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
            {t('wo.fm.form.description')} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>({t('optional')})</span>
          </label>
          <textarea className="fm-input" rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t('wo.fm.form.descPlaceholder')}
            style={{ resize: 'vertical', minHeight: 70 }}
          />
        </div>
      </div>

      <FmModalFooter>
        <FmButton type="button" variant="secondary" size="sm" onClick={onClose}>{t('wo.fm.form.cancel')}</FmButton>
        <FmButton type="submit" size="sm" loading={saving}>
          {saving ? t('wo.fm.form.creating') : t('wo.fm.form.createBtn')}
        </FmButton>
      </FmModalFooter>
    </form>
  )
}

// ── Create Form — Contributor ──────────────────────────────────────────────

function ContributorCreateForm({
  form, setForm, properties, saving, formError, onSubmit, onClose,
}: {
  form:       CreateForm
  setForm:    React.Dispatch<React.SetStateAction<CreateForm>>
  properties: FmProperty[]
  saving:     boolean
  formError:  string | null
  onSubmit:   (e: React.FormEvent) => void
  onClose:    () => void
}) {
  const t = useFmT()

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {formError && (
        <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.8rem', color: 'var(--red)' }}>
          {formError}
        </div>
      )}

      {/* Info banner */}
      <div style={{ background: 'var(--primary-c)', border: '1px solid var(--primary)', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.78rem', color: 'var(--primary)', lineHeight: 1.5 }}>
        {t('wo.fm.modal.contribBanner')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {/* Title */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
            {t('wo.fm.form.title')} <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <input className="fm-input" type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={t('wo.fm.form.contribTitlePlaceholder')}
            autoFocus
          />
        </div>

        {/* Category */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
            {t('wo.fm.form.category')} <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <select className="fm-input" value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            style={{ appearance: 'none' }}>
            <option value="">{t('wo.fm.form.selectCat')}</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {/* Property */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>{t('wo.fm.form.propertyLocation')}</label>
          <select className="fm-input" value={form.property_id}
            onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}
            style={{ appearance: 'none' }}>
            <option value="">{t('wo.fm.form.notSure')}</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Due date */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
            {t('wo.fm.form.urgencyDate')} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>({t('wo.fm.form.urgencyDateHint')})</span>
          </label>
          <input className="fm-input" type="date" value={form.due_date}
            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
          />
        </div>

        {/* Description */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
            {t('wo.fm.form.description')} <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <textarea className="fm-input" rows={4}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t('wo.fm.form.contribDescPlaceholder')}
            style={{ resize: 'vertical', minHeight: 90 }}
          />
        </div>
      </div>

      <FmModalFooter>
        <FmButton type="button" variant="secondary" size="sm" onClick={onClose}>{t('wo.fm.form.cancel')}</FmButton>
        <FmButton type="submit" size="sm" loading={saving}>
          {saving ? t('wo.fm.form.submitting') : t('wo.fm.form.submitBtn')}
        </FmButton>
      </FmModalFooter>
    </form>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FMWorkOrdersPage() {
  const t = useFmT()
  const { locale } = useLocale()
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus')

  // FM session / capability
  const [fmLevel,   setFmLevel]   = useState<FmAccessLevel>(null)
  const [levelReady, setLevelReady] = useState(false)

  // Data
  const [workOrders,  setWorkOrders]  = useState<FmWorkOrder[]>([])
  const [properties,  setProperties]  = useState<FmProperty[]>([])
  const [fmUsers,     setFmUsers]     = useState<FmUser[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)

  // UI state
  const [activeTab,   setActiveTab]   = useState<FilterTab>('ALL')
  const [search,      setSearch]      = useState('')
  const [showCreate,  setShowCreate]  = useState(false)
  const [form,        setForm]        = useState<CreateForm>(EMPTY_FORM)
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState<string | null>(null)

  // Locale-dependent maps defined inside the component
  const ALL_FILTER_TABS: { value: FilterTab; label: string; managerOnly?: boolean }[] = [
    { value: 'ALL',            label: t('wo.fm.tab.all') },
    { value: 'PENDING_REVIEW', label: t('wo.fm.tab.pendingReview'), managerOnly: true },
    { value: 'OVERDUE',        label: t('wo.fm.tab.overdue') },
    { value: 'OPEN',           label: t('wo.fm.tab.open') },
    { value: 'IN_PROGRESS',    label: t('wo.fm.tab.inProgress') },
    { value: 'COMPLETED',      label: t('wo.fm.tab.completed') },
  ]

  // ── Load FM access level from get_my_profile RPC ──────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.rpc('get_my_profile').single().then(({ data, error: rpcErr }) => {
      if (!rpcErr && data) {
        const row = data as { capability: string | null; role: string }
        setFmLevel(getFmAccessLevel(row.capability, row.role))
      }
      setLevelReady(true)
    })
  }, [])

  const isManager     = fmLevel === 'manager'
  const isContributor = fmLevel === 'contributor'
  const canCreate     = isManager || isContributor

  // ── Fetch data ─────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/fm/work-orders').then((r) => {
        if (!r.ok) throw new Error(t('wo.fm.err.load'))
        return r.json() as Promise<FmWorkOrder[]>
      }),
      fetch('/api/fm/properties').then((r) => r.json() as Promise<FmProperty[]>),
    ])
      .then(([wo, p]) => {
        const sorted = [...wo].sort((a, b) => {
          const aOverdue = overdueWo(a), bOverdue = overdueWo(b)
          if (aOverdue && !bOverdue) return -1
          if (!aOverdue && bOverdue) return 1
          return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
        })
        setWorkOrders(sorted)
        setProperties(p)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [t])

  // Fetch FM users for assignee picker (managers only, after level is known)
  useEffect(() => {
    if (!isManager) return
    fetch('/api/fm/users')
      .then((r) => r.ok ? r.json() : [])
      .then((u: FmUser[]) => setFmUsers(u))
      .catch(() => setFmUsers([]))
  }, [isManager])

  useEffect(() => { load() }, [load])

  // Auto-switch to ALL when focused via deep-link
  useEffect(() => { if (focusId) setActiveTab('ALL') }, [focusId])

  // ── Handlers ───────────────────────────────────────────────────────────
  function handleStatusUpdate(id: string, status: string) {
    setWorkOrders((prev) => prev.map((wo) => wo.id === id ? { ...wo, status } : wo))
  }

  function closeCreate() {
    setShowCreate(false)
    setForm(EMPTY_FORM)
    setFormError(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!form.title.trim()) { setFormError(t('wo.fm.err.title')); return }
    if (!form.category)     { setFormError(t('wo.fm.err.category')); return }
    if (isContributor && !form.description.trim()) { setFormError(t('wo.fm.err.description')); return }

    const payload: Record<string, unknown> = {
      title:       form.title.trim(),
      description: form.description.trim() || null,
      priority:    form.priority,
      property_id: form.property_id || null,
      due_date:    form.due_date    || null,
      category:    form.category    || null,
    }

    // Manager-only fields
    if (isManager) {
      if (form.assignee_type)  payload.assignee_type  = form.assignee_type
      if (form.assigned_to_id) payload.assigned_to_id = form.assigned_to_id
    }

    setSaving(true)
    try {
      const res = await fetch('/api/fm/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? t('wo.fm.err.create'))
      }
      closeCreate()
      load()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  // ── Filter ─────────────────────────────────────────────────────────────
  const visibleTabs = ALL_FILTER_TABS.filter((tab) => !tab.managerOnly || isManager)

  const filtered = workOrders.filter((wo) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      wo.title.toLowerCase().includes(q) ||
      (wo.description ?? '').toLowerCase().includes(q) ||
      (wo.fm_properties?.name ?? '').toLowerCase().includes(q) ||
      (categoryLabel(wo.category) ?? '').toLowerCase().includes(q)
    const matchTab =
      activeTab === 'ALL'            ? true :
      activeTab === 'OVERDUE'        ? overdueWo(wo) :
      activeTab === 'PENDING_REVIEW' ? wo.status === 'PENDING_REVIEW' :
      wo.status === activeTab
    return matchSearch && matchTab
  })

  function tabCount(tab: FilterTab) {
    if (tab === 'ALL')            return workOrders.length
    if (tab === 'OVERDUE')        return workOrders.filter(overdueWo).length
    if (tab === 'PENDING_REVIEW') return workOrders.filter((w) => w.status === 'PENDING_REVIEW').length
    return workOrders.filter((wo) => wo.status === tab).length
  }

  const overdueCount  = workOrders.filter(overdueWo).length
  const pendingCount  = workOrders.filter((w) => w.status === 'PENDING_REVIEW').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>{t('wo.fm.title')}</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
            {workOrders.length} {t('wo.fm.total')}
            {overdueCount > 0 && (
              <span style={{ color: 'var(--red)', fontWeight: 700, marginLeft: '0.4rem' }}>
                · {overdueCount} {t('wo.fm.overdue')}
              </span>
            )}
            {isManager && pendingCount > 0 && (
              <span style={{ color: 'var(--amber)', fontWeight: 700, marginLeft: '0.4rem' }}>
                · {pendingCount} {t('wo.fm.pendingReview')}
              </span>
            )}
          </p>
        </div>
        {canCreate && levelReady && (
          <FmButton icon={<Plus size={15} />} onClick={() => setShowCreate(true)} size="sm">
            {isManager ? t('wo.fm.newBtn') : t('wo.fm.submitBtn')}
          </FmButton>
        )}
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder={t('wo.fm.search')}
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
        {visibleTabs.map((tab) => {
          const active       = activeTab === tab.value
          const count        = tabCount(tab.value)
          const isOverdue    = tab.value === 'OVERDUE'
          const isPendingTab = tab.value === 'PENDING_REVIEW'
          const hasOverdue   = isOverdue && count > 0
          const hasPending   = isPendingTab && count > 0

          const activeBg    = hasPending ? 'var(--amber-c)' : hasOverdue ? 'var(--red-c)' : 'var(--primary-c)'
          const activeBorder = hasPending ? 'var(--amber)' : hasOverdue ? 'var(--red)' : 'var(--primary)'
          const activeColor  = hasPending ? 'var(--amber)' : hasOverdue ? 'var(--red)' : 'var(--primary)'
          const inactiveColor =
            hasOverdue ? 'var(--red)' :
            hasPending ? 'var(--amber)' : 'var(--muted)'

          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              style={{
                padding: '0.3rem 0.75rem', borderRadius: 9999,
                fontSize: '0.72rem', fontWeight: 700,
                border: `1px solid ${active ? activeBorder : 'var(--border)'}`,
                background: active ? activeBg : 'var(--card-b)',
                color: active ? activeColor : inactiveColor,
                cursor: 'pointer', transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', gap: '0.35rem',
              }}
            >
              {tab.label}
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
          <FmButton variant="secondary" size="sm" onClick={load} style={{ marginTop: '1rem' }}>{t('wo.fm.retry')}</FmButton>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
          <ClipboardList size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
          {search || activeTab !== 'ALL'
            ? t('wo.fm.emptyFiltered')
            : isContributor
              ? t('wo.fm.emptyContributor')
              : t('wo.fm.empty')}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.875rem' }}>
          {filtered.map((wo) => (
            <WoCard
              key={wo.id}
              wo={wo}
              focused={wo.id === focusId}
              isManager={isManager}
              onStatusUpdate={handleStatusUpdate}
            />
          ))}
        </div>
      )}

      {/* Create / Submit Modal */}
      <FmModal
        open={showCreate}
        onClose={closeCreate}
        title={isManager ? t('wo.fm.modal.managerTitle') : t('wo.fm.modal.contribTitle')}
        subtitle={
          isManager
            ? t('wo.fm.modal.managerSub')
            : t('wo.fm.modal.contribSub')
        }
      >
        {isManager ? (
          <ManagerCreateForm
            form={form} setForm={setForm}
            fmUsers={fmUsers} properties={properties}
            saving={saving} formError={formError}
            onSubmit={handleCreate} onClose={closeCreate}
          />
        ) : (
          <ContributorCreateForm
            form={form} setForm={setForm}
            properties={properties}
            saving={saving} formError={formError}
            onSubmit={handleCreate} onClose={closeCreate}
          />
        )}
      </FmModal>

    </div>
  )
}
