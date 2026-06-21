'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, AlertTriangle, Building2,
  Calendar, User, Tag, Wrench, ClipboardCheck,
  ChevronDown, CheckCircle2, Play, RotateCcw,
  Clock, Edit2, Save, X,
} from 'lucide-react'
import {
  FmCard, FmBadge, FmButton, FmSectionLabel, statusVariant,
} from '@/components/fm'
import { createClient } from '@/lib/supabase/client'
import { useFmT } from '@/lib/locale'

// ── Types ──────────────────────────────────────────────────────────────────

interface Profile { id: string; full_name: string }

interface FmWorkOrder {
  id:               string
  title:            string
  description:      string | null
  status:           string
  priority:         string
  category:         string | null
  assignee_type:    string | null
  source:           string | null
  due_date:         string | null
  created_at:       string
  updated_at:       string
  engaged_at:       string | null
  resolved_at:      string | null
  submitted_by_id:  string | null
  assigned_to_id:   string | null
  inspection_id:    string | null
  checklist_item_id: string | null
  property_id:      string | null
  fm_properties:    { id: string; name: string } | null
  assigned_to:      Profile | null
  submitted_by:     Profile | null
  engaged_by:       Profile | null
  resolved_by:      Profile | null
  fm_inspections:   { id: string; fm_properties: { id: string; name: string } | null } | null
}

interface TeamMember { id: string; full_name: string }

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

const ASSIGNEE_TYPES = [
  { value: 'HS_STAFF',          label: 'HS Staff' },
  { value: 'MUNICIPALITY',      label: 'Municipality' },
  { value: 'EXTERNAL_SUPPLIER', label: 'External Supplier' },
  { value: 'DIRECTOR_REFERRAL', label: 'Director Referral' },
]

const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const

const MANAGER_TRANSITIONS: Record<string, { value: string; label: string; icon: React.ReactNode }[]> = {
  PENDING_REVIEW: [{ value: 'OPEN',        label: 'Accept & Open',   icon: <CheckCircle2 size={14} /> }],
  OPEN:           [
    { value: 'IN_PROGRESS', label: 'Start Work',        icon: <Play size={14} /> },
    { value: 'COMPLETED',   label: 'Mark Completed',    icon: <CheckCircle2 size={14} /> },
  ],
  IN_PROGRESS:    [
    { value: 'COMPLETED',   label: 'Mark Completed',    icon: <CheckCircle2 size={14} /> },
    { value: 'OPEN',        label: 'Send Back to Open', icon: <RotateCcw size={14} /> },
  ],
  COMPLETED:      [{ value: 'OPEN',        label: 'Re-open',         icon: <RotateCcw size={14} /> }],
}

const WORKER_TRANSITIONS: Record<string, { value: string; label: string; icon: React.ReactNode }[]> = {
  OPEN:        [{ value: 'IN_PROGRESS', label: 'Start Work',     icon: <Play size={14} /> }],
  IN_PROGRESS: [{ value: 'COMPLETED',  label: 'Mark Completed',  icon: <CheckCircle2 size={14} /> }],
}

// ── Helpers ────────────────────────────────────────────────────────────────

function categoryLabel(v: string | null) {
  return CATEGORIES.find((c) => c.value === v)?.label ?? v?.replace(/_/g, ' ') ?? null
}

function assigneeTypeLabel(v: string | null) {
  return ASSIGNEE_TYPES.find((a) => a.value === v)?.label ?? v?.replace(/_/g, ' ') ?? null
}

function priorityVariant(p: string) {
  return p === 'HIGH' ? 'danger' as const : p === 'MEDIUM' ? 'warning' as const : 'success' as const
}

function fmtDate(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(ts: string | null) {
  if (!ts) return null
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function isOverdue(wo: FmWorkOrder) {
  return wo.status !== 'COMPLETED' && !!wo.due_date && new Date(wo.due_date) < new Date()
}

function getFmLevel(capability: string | null, role: string) {
  if (capability) {
    if (['org_admin', 'fm_manager'].includes(capability)) return 'manager'
    if (capability === 'fm_viewer')  return 'viewer'
    if (capability === 'fm_contributor') return 'fm_contributor'
    if (capability === 'fm_worker')      return 'fm_worker'
  }
  if (['admin', 'supervisor'].includes(role)) return 'manager'
  if (role === 'inspector') return 'fm_contributor'
  if (role === 'vendor')    return 'fm_worker'
  return 'viewer'
}

// ── Inline field row ───────────────────────────────────────────────────────

function FieldRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.625rem', padding: '0.625rem 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 160, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        {icon && <span style={{ color: 'var(--muted)', display: 'flex' }}>{icon}</span>}
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div style={{ flex: 1, fontSize: '0.875rem', color: 'var(--fg)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
        {value}
      </div>
    </div>
  )
}

// ── Source badge ───────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string | null }) {
  if (!source || source === 'DIRECT') return null
  const label = source === 'INSPECTION' ? '⚡ From Inspection' : source.replace(/_/g, ' ')
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: 999,
      background: 'var(--amber-c)', color: 'var(--amber)', border: '1px solid var(--amber)',
    }}>
      {label}
    </span>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function FmWorkOrderDetailPage() {
  const t = useFmT()
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [wo, setWo]               = useState<FmWorkOrder | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [fmLevel, setFmLevel]     = useState<string>('viewer')
  const [teamMembers, setTeam]    = useState<TeamMember[]>([])
  const [transitioning, setTransitioning] = useState(false)
  const [transitionErr, setTransitionErr] = useState<string | null>(null)

  // Edit mode
  const [editing, setEditing]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editForm, setEditForm]   = useState({
    title:          '',
    description:    '',
    category:       '',
    priority:       'MEDIUM',
    due_date:       '',
    assignee_type:  '',
    assigned_to_id: '',
  })

  // ── Load session FM level ─────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.rpc('get_my_profile').single().then(({ data }) => {
      if (data) {
        const row = data as { capability: string | null; role: string }
        setFmLevel(getFmLevel(row.capability, row.role))
      }
    })
  }, [])

  // ── Load work order ───────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/fm/work-orders/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Work order not found')
        return r.json() as Promise<FmWorkOrder>
      })
      .then((data) => {
        setWo(data)
        setEditForm({
          title:          data.title,
          description:    data.description ?? '',
          category:       data.category ?? '',
          priority:       data.priority,
          due_date:       data.due_date ? data.due_date.split('T')[0] : '',
          assignee_type:  data.assignee_type ?? '',
          assigned_to_id: data.assigned_to_id ?? '',
        })
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  // ── Load team for assignee picker ─────────────────────────────────────────
  useEffect(() => {
    if (fmLevel !== 'manager') return
    fetch('/api/fm/team')
      .then((r) => r.json() as Promise<Array<{ user_id: string; full_name: string }>>)
      .then((m) => setTeam(m.map((u) => ({ id: u.user_id, full_name: u.full_name }))))
      .catch(() => {})
  }, [fmLevel])

  // ── Status transition ─────────────────────────────────────────────────────
  async function handleTransition(newStatus: string) {
    if (!wo) return
    setTransitioning(true)
    setTransitionErr(null)
    try {
      const res = await fetch(`/api/fm/work-orders/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to update status')
      }
      const updated = await res.json() as FmWorkOrder
      setWo(updated)
    } catch (e: unknown) {
      setTransitionErr(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setTransitioning(false)
    }
  }

  // ── Save edit ─────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!wo) return
    setSaving(true)
    setSaveError(null)
    try {
      const payload: Record<string, unknown> = {
        title:       editForm.title.trim(),
        description: editForm.description.trim() || null,
        category:    editForm.category   || null,
        priority:    editForm.priority,
        due_date:    editForm.due_date ? new Date(editForm.due_date).toISOString() : null,
      }
      if (fmLevel === 'manager') {
        payload.assignee_type  = editForm.assignee_type  || null
        payload.assigned_to_id = editForm.assigned_to_id || null
      }
      const res = await fetch(`/api/fm/work-orders/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Save failed')
      }
      const updated = await res.json() as FmWorkOrder
      setWo(updated)
      setEditing(false)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
      </div>
    )
  }

  if (error || !wo) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--red)' }}>
        <AlertTriangle size={28} style={{ margin: '0 auto 0.75rem' }} />
        <p style={{ fontSize: '0.875rem' }}>{error ?? 'Work order not found'}</p>
        <FmButton variant="secondary" size="sm" onClick={() => router.push('/dashboard/fm/work-orders')} style={{ marginTop: '1rem' }}>
          Back to Work Orders
        </FmButton>
      </div>
    )
  }

  const isManager    = fmLevel === 'manager'
  const isWorker     = fmLevel === 'fm_worker'
  const overdue      = isOverdue(wo)
  const transitions  = isManager
    ? (MANAGER_TRANSITIONS[wo.status] ?? [])
    : isWorker
      ? (WORKER_TRANSITIONS[wo.status] ?? [])
      : []

  const canEdit = isManager ||
    (fmLevel === 'fm_contributor' && wo.status === 'PENDING_REVIEW')

  // Build timeline
  type TLEvent = { ts: string; label: string; icon: React.ReactNode; color: string }
  const timeline: TLEvent[] = [
    {
      ts:    wo.created_at,
      label: `Created${wo.submitted_by ? ` by ${wo.submitted_by.full_name}` : ''}`,
      icon:  <Wrench size={12} />,
      color: 'var(--muted)',
    },
  ]
  if (wo.engaged_at) {
    timeline.push({
      ts:    wo.engaged_at,
      label: `Work started${wo.engaged_by ? ` by ${wo.engaged_by.full_name}` : ''}`,
      icon:  <Play size={12} />,
      color: 'var(--primary)',
    })
  }
  if (wo.resolved_at) {
    timeline.push({
      ts:    wo.resolved_at,
      label: `Resolved${wo.resolved_by ? ` by ${wo.resolved_by.full_name}` : ''}`,
      icon:  <CheckCircle2 size={12} />,
      color: 'var(--teal)',
    })
  }
  timeline.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 720, paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 20px))' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
        <button
          onClick={() => router.push('/dashboard/fm/work-orders')}
          style={{
            marginTop: '0.2rem', padding: '0.375rem',
            background: 'var(--card-b)', border: '1px solid var(--border)',
            borderRadius: 8, cursor: 'pointer', color: 'var(--muted)',
            display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
          aria-label="Back to work orders"
        >
          <ArrowLeft size={17} />
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
            <FmBadge variant={statusVariant(wo.status)}>
              {wo.status.replace(/_/g, ' ')}
            </FmBadge>
            <FmBadge variant={priorityVariant(wo.priority)}>{wo.priority}</FmBadge>
            <SourceBadge source={wo.source} />
            {overdue && (
              <span style={{
                fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: 999,
                background: 'var(--red-c)', color: 'var(--red)', border: '1px solid var(--red)',
              }}>
                OVERDUE
              </span>
            )}
          </div>
          {editing ? (
            <input
              className="fm-input"
              value={editForm.title}
              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}
              autoFocus
            />
          ) : (
            <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--fg)', margin: 0, lineHeight: 1.35 }}>
              {wo.title}
            </h1>
          )}
          {wo.fm_properties && (
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.25rem 0 0', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Building2 size={12} />
              <Link href={`/dashboard/fm/properties/${wo.fm_properties.id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
                {wo.fm_properties.name}
              </Link>
            </p>
          )}
        </div>

        {/* Edit / Save buttons */}
        {canEdit && (
          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
            {editing ? (
              <>
                <FmButton size="sm" variant="secondary" onClick={() => setEditing(false)} icon={<X size={14} />}>Cancel</FmButton>
                <FmButton size="sm" loading={saving} onClick={handleSave} icon={<Save size={14} />}>Save</FmButton>
              </>
            ) : (
              <FmButton size="sm" variant="secondary" onClick={() => setEditing(true)} icon={<Edit2 size={14} />}>Edit</FmButton>
            )}
          </div>
        )}
      </div>

      {/* Save error */}
      {saveError && (
        <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.625rem', fontSize: '0.8rem', color: 'var(--red)' }}>
          {saveError}
        </div>
      )}

      {/* ── Status actions ── */}
      {transitions.length > 0 && (
        <FmCard>
          <FmSectionLabel>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ChevronDown size={13} style={{ color: 'var(--primary)' }} />
              Status Actions
            </span>
          </FmSectionLabel>
          {transitionErr && (
            <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--red)', marginTop: '0.75rem' }}>
              {transitionErr}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            {transitions.map((tr) => (
              <FmButton
                key={tr.value}
                size="sm"
                icon={transitioning ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : tr.icon}
                onClick={() => handleTransition(tr.value)}
                loading={transitioning}
                variant={tr.value === 'COMPLETED' ? undefined : 'secondary'}
              >
                {tr.label}
              </FmButton>
            ))}
          </div>
        </FmCard>
      )}

      {/* ── Details ── */}
      <FmCard>
        <FmSectionLabel>Details</FmSectionLabel>
        <div style={{ marginTop: '0.5rem' }}>
          {/* Category */}
          <FieldRow
            label="Category"
            icon={<Tag size={12} />}
            value={
              editing && isManager ? (
                <select className="fm-input" value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))} style={{ fontSize: '0.85rem', padding: '0.3rem 0.5rem' }}>
                  <option value="">— None —</option>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              ) : categoryLabel(wo.category) ? (
                <span style={{ fontSize: '0.8rem', fontWeight: 600, background: 'var(--card-b)', border: '1px solid var(--border)', padding: '0.2rem 0.6rem', borderRadius: 6 }}>
                  {categoryLabel(wo.category)}
                </span>
              ) : <span style={{ color: 'var(--faint)' }}>—</span>
            }
          />

          {/* Priority */}
          <FieldRow
            label="Priority"
            value={
              editing && isManager ? (
                <select className="fm-input" value={editForm.priority} onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))} style={{ fontSize: '0.85rem', padding: '0.3rem 0.5rem' }}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : <FmBadge variant={priorityVariant(wo.priority)}>{wo.priority}</FmBadge>
            }
          />

          {/* Due date */}
          <FieldRow
            label="Due Date"
            icon={<Calendar size={12} />}
            value={
              editing ? (
                <input type="date" className="fm-input" value={editForm.due_date} onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))} style={{ fontSize: '0.85rem', padding: '0.3rem 0.5rem' }} />
              ) : (
                <span style={{ color: overdue ? 'var(--red)' : 'var(--fg)', fontWeight: overdue ? 700 : 400 }}>
                  {fmtDate(wo.due_date)}
                  {overdue && ' — OVERDUE'}
                </span>
              )
            }
          />

          {/* Assignee type (manager only) */}
          {(isManager || wo.assignee_type) && (
            <FieldRow
              label="Assignee Type"
              icon={<User size={12} />}
              value={
                editing && isManager ? (
                  <select className="fm-input" value={editForm.assignee_type} onChange={(e) => setEditForm((f) => ({ ...f, assignee_type: e.target.value, assigned_to_id: '' }))} style={{ fontSize: '0.85rem', padding: '0.3rem 0.5rem' }}>
                    <option value="">— Unassigned —</option>
                    {ASSIGNEE_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                ) : assigneeTypeLabel(wo.assignee_type) ? (
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, background: 'var(--primary-c)', color: 'var(--primary)', padding: '0.2rem 0.6rem', borderRadius: 6 }}>
                    {assigneeTypeLabel(wo.assignee_type)}
                  </span>
                ) : <span style={{ color: 'var(--faint)' }}>—</span>
              }
            />
          )}

          {/* Assigned to */}
          {(isManager || wo.assigned_to) && (
            <FieldRow
              label="Assigned To"
              icon={<User size={12} />}
              value={
                editing && isManager && (editForm.assignee_type === 'HS_STAFF' || editForm.assignee_type === 'MUNICIPALITY') ? (
                  <select className="fm-input" value={editForm.assigned_to_id} onChange={(e) => setEditForm((f) => ({ ...f, assigned_to_id: e.target.value }))} style={{ fontSize: '0.85rem', padding: '0.3rem 0.5rem' }}>
                    <option value="">— Not assigned —</option>
                    {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                ) : wo.assigned_to ? (
                  <span style={{ fontWeight: 600 }}>{wo.assigned_to.full_name}</span>
                ) : (
                  <span style={{ color: 'var(--faint)' }}>Not assigned</span>
                )
              }
            />
          )}

          {/* Source / linked inspection */}
          {wo.fm_inspections && (
            <FieldRow
              label="Inspection"
              icon={<ClipboardCheck size={12} />}
              value={
                <Link
                  href={`/dashboard/fm/inspections/${wo.fm_inspections.id}`}
                  style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.875rem' }}
                >
                  <ClipboardCheck size={13} />
                  {wo.fm_inspections.fm_properties?.name ?? 'View inspection'} →
                </Link>
              }
            />
          )}

          {/* Submitted by */}
          {wo.submitted_by && (
            <FieldRow
              label="Submitted By"
              icon={<User size={12} />}
              value={<span>{wo.submitted_by.full_name}</span>}
            />
          )}

          {/* Created */}
          <FieldRow
            label="Created"
            icon={<Clock size={12} />}
            value={<span style={{ color: 'var(--muted)' }}>{fmtDateTime(wo.created_at)}</span>}
          />
        </div>
      </FmCard>

      {/* ── Description ── */}
      <FmCard>
        <FmSectionLabel>Description</FmSectionLabel>
        {editing ? (
          <textarea
            className="fm-input"
            rows={5}
            value={editForm.description}
            onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Describe the issue and any relevant details…"
            style={{ resize: 'vertical', fontSize: '0.9rem', marginTop: '0.75rem', minHeight: 100 }}
          />
        ) : (
          <p style={{ fontSize: '0.875rem', color: wo.description ? 'var(--fg)' : 'var(--faint)', lineHeight: 1.6, marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>
            {wo.description ?? 'No description provided.'}
          </p>
        )}
      </FmCard>

      {/* ── Activity ── */}
      <FmCard>
        <FmSectionLabel>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Clock size={13} style={{ color: 'var(--primary)' }} />
            Activity
          </span>
        </FmSectionLabel>
        <div style={{ marginTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {timeline.map((ev, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.75rem', position: 'relative' }}>
              {i < timeline.length - 1 && (
                <div style={{
                  position: 'absolute', left: '0.6rem', top: '1.5rem',
                  width: 1, bottom: 0, background: 'var(--border)',
                }} />
              )}
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--card-b)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: ev.color, flexShrink: 0, marginTop: '0.125rem',
              }}>
                {ev.icon}
              </div>
              <div style={{ flex: 1, paddingBottom: '1rem' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', margin: 0 }}>{ev.label}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0.15rem 0 0' }}>
                  {fmtDateTime(ev.ts)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </FmCard>

    </div>
  )
}
