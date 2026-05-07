'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, Loader2, AlertTriangle, X,
  ClipboardCheck, ChevronRight, Calendar,
} from 'lucide-react'
import {
  FmCard, FmBadge, FmButton, FmModal,
  FmModalFooter, FmSectionLabel, statusVariant,
} from '@/components/fm'

// ── Types ──────────────────────────────────────────────────────────────────

interface FmProperty { id: string; name: string }
interface FmTemplate { id: string; name: string }
interface FmAsset    { id: string; name: string; property_id: string | null }

interface FmInspection {
  id: string
  status: string
  score: number | null
  created_at: string
  scheduled_for: string | null
  fm_properties: { name: string } | null
  fm_templates:  { name: string } | null
  inspector:     { full_name: string } | null
}

interface StartForm {
  property_id: string; template_id: string; asset_id: string; scheduled_for: string
}

const EMPTY_FORM: StartForm = { property_id: '', template_id: '', asset_id: '', scheduled_for: '' }

type FilterTab = 'ALL' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'COMPLETED' | 'DRAFT'
const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'ALL',              label: 'Todas' },
  { value: 'IN_PROGRESS',      label: 'En Proceso' },
  { value: 'PENDING_APPROVAL', label: 'Pendiente de Aprobación' },
  { value: 'COMPLETED',        label: 'Completada' },
  { value: 'DRAFT',            label: 'Borrador' },
]

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FMInspectionsPage() {
  const router = useRouter()

  const [inspections, setInspections] = useState<FmInspection[]>([])
  const [properties, setProperties]   = useState<FmProperty[]>([])
  const [templates, setTemplates]     = useState<FmTemplate[]>([])
  const [assets, setAssets]           = useState<FmAsset[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [activeTab, setActiveTab]     = useState<FilterTab>('ALL')
  const [search, setSearch]           = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [form, setForm]               = useState<StartForm>(EMPTY_FORM)
  const [saving, setSaving]           = useState(false)
  const [formError, setFormError]     = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/fm/inspections').then((r) => r.json() as Promise<FmInspection[]>),
      fetch('/api/fm/properties').then((r) => r.json() as Promise<FmProperty[]>),
      fetch('/api/fm/templates').then((r) => r.json() as Promise<FmTemplate[]>),
      fetch('/api/fm/assets').then((r) => r.json() as Promise<FmAsset[]>),
    ])
      .then(([insp, props, tmpl, asst]) => {
        setInspections(Array.isArray(insp) ? insp : [])
        setProperties(Array.isArray(props) ? props : [])
        setTemplates(Array.isArray(tmpl) ? tmpl : [])
        setAssets(Array.isArray(asst) ? asst : [])
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const filteredAssets = assets.filter(
    (a) => !form.property_id || a.property_id === form.property_id
  )

  const filtered = inspections.filter((i) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      (i.fm_properties?.name ?? '').toLowerCase().includes(q) ||
      (i.fm_templates?.name ?? '').toLowerCase().includes(q) ||
      (i.inspector?.full_name ?? '').toLowerCase().includes(q)
    const matchTab = activeTab === 'ALL' ? true : i.status === activeTab
    return matchSearch && matchTab
  })

  function tabCount(tab: FilterTab) {
    if (tab === 'ALL') return inspections.length
    return inspections.filter((i) => i.status === tab).length
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.property_id) { setFormError('La propiedad es obligatoria'); return }
    if (!form.template_id) { setFormError('La plantilla es obligatoria'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/fm/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id:   form.property_id,
          template_id:   form.template_id,
          asset_id:      form.asset_id || undefined,
          scheduled_for: form.scheduled_for || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Error al iniciar la inspección')
      }
      const data = await res.json() as { id: string }
      setShowModal(false)
      setForm(EMPTY_FORM)
      router.push(`/dashboard/fm/inspections/${data.id}/run`)
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Inspecciones</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
            {inspections.length} inspección{inspections.length !== 1 ? 'es' : ''} en total
          </p>
        </div>
        <FmButton icon={<Plus size={15} />} onClick={() => setShowModal(true)} size="sm">
          Iniciar Inspección
        </FmButton>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Buscar por propiedad, plantilla o inspector…"
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
          const active = activeTab === t.value
          const count  = tabCount(t.value)
          return (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value)}
              style={{
                padding: '0.3rem 0.75rem', borderRadius: 9999,
                fontSize: '0.72rem', fontWeight: 700,
                border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                background: active ? 'var(--primary-c)' : 'var(--card-b)',
                color: active ? 'var(--primary)' : 'var(--muted)',
                cursor: 'pointer', transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', gap: '0.35rem',
              }}
            >
              {t.label}
              <span style={{ opacity: 0.7, fontWeight: 800 }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
          <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--red)' }}>
          <AlertTriangle size={28} style={{ margin: '0 auto 0.75rem' }} />
          <p style={{ fontSize: '0.875rem' }}>{error}</p>
          <FmButton variant="secondary" size="sm" onClick={load} style={{ marginTop: '1rem' }}>Reintentar</FmButton>
        </div>
      ) : (
        <FmCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <FmSectionLabel>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ClipboardCheck size={13} style={{ color: 'var(--primary)' }} />
                {filtered.length} inspección{filtered.length !== 1 ? 'es' : ''}
                {(search || activeTab !== 'ALL') && ' (filtradas)'}
              </span>
            </FmSectionLabel>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
              <ClipboardCheck size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
              No hay inspecciones que coincidan con los filtros
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>Propiedad</th>
                    <th>Plantilla</th>
                    <th>Estado</th>
                    <th>Puntaje</th>
                    <th>Fecha</th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((insp) => {
                    const isRunnable = insp.status === 'DRAFT' || insp.status === 'IN_PROGRESS'
                    const href = isRunnable
                      ? `/dashboard/fm/inspections/${insp.id}/run`
                      : `/dashboard/fm/inspections/${insp.id}`
                    return (
                      <tr
                        key={insp.id}
                        onClick={() => router.push(href)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <p style={{ fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
                            {insp.fm_properties?.name ?? '—'}
                          </p>
                          {insp.inspector && (
                            <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0.1rem 0 0' }}>
                              {insp.inspector.full_name}
                            </p>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                            {insp.fm_templates?.name ?? '—'}
                          </span>
                        </td>
                        <td>
                          <FmBadge variant={statusVariant(insp.status)}>
                            {insp.status.replace(/_/g, ' ')}
                          </FmBadge>
                        </td>
                        <td>
                          <span style={{
                            fontSize: '0.875rem', fontWeight: 700,
                            color: insp.score == null ? 'var(--muted)' :
                              insp.score >= 80 ? 'var(--teal)' :
                              insp.score >= 60 ? 'var(--amber)' : 'var(--red)',
                          }}>
                            {insp.score != null ? `${insp.score}%` : '—'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                            <Calendar size={11} />
                            {new Date(insp.scheduled_for ?? insp.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        </td>
                        <td>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, justifyContent: 'flex-end' }}>
                            {isRunnable ? 'Continuar' : 'Ver'} <ChevronRight size={13} />
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </FmCard>
      )}

      {/* Start Inspection Modal */}
      <FmModal
        open={showModal}
        onClose={() => { setShowModal(false); setForm(EMPTY_FORM); setFormError(null) }}
        title="Iniciar Inspección"
        subtitle="Elige una propiedad y una plantilla para comenzar"
      >
        <form onSubmit={handleStart} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {formError && (
            <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.8rem', color: 'var(--red)' }}>
              {formError}
            </div>
          )}

          {/* Property */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
              Propiedad <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <select className="fm-input" value={form.property_id}
              onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value, asset_id: '' }))}
              style={{ appearance: 'none' }}>
              <option value="">— Seleccionar propiedad —</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Template */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
              Plantilla <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <select className="fm-input" value={form.template_id}
              onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))}
              style={{ appearance: 'none' }}>
              <option value="">— Seleccionar plantilla —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Asset (optional, filtered by property) */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
              Activo <span style={{ color: 'var(--faint)', fontWeight: 400 }}>(opcional)</span>
            </label>
            <select className="fm-input" value={form.asset_id}
              onChange={(e) => setForm((f) => ({ ...f, asset_id: e.target.value }))}
              disabled={!form.property_id}
              style={{ appearance: 'none', opacity: !form.property_id ? 0.5 : 1 }}>
              <option value="">— Propiedad completa —</option>
              {filteredAssets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* Scheduled for */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
              Programado Para <span style={{ color: 'var(--faint)', fontWeight: 400 }}>(opcional)</span>
            </label>
            <input className="fm-input" type="date" value={form.scheduled_for}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_for: e.target.value }))} />
          </div>

          <FmModalFooter>
            <FmButton type="button" variant="secondary" size="sm"
              onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setFormError(null) }}>
              Cancelar
            </FmButton>
            <FmButton type="submit" size="sm" loading={saving} icon={<ClipboardCheck size={14} />}>
              {saving ? 'Iniciando…' : 'Iniciar Inspección'}
            </FmButton>
          </FmModalFooter>
        </form>
      </FmModal>

    </div>
  )
}
