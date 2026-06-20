'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, Search, Loader2, AlertTriangle, X,
  ClipboardCheck, ChevronRight, Calendar,
} from 'lucide-react'
import {
  FmCard, FmBadge, FmButton, FmModal,
  FmModalFooter, FmSectionLabel, statusVariant,
} from '@/components/fm'
import { useFmT } from '@/lib/locale'

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

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FMInspectionsPage() {
  const t = useFmT()
  const router = useRouter()

  const filterTabs: { value: FilterTab; label: string }[] = [
    { value: 'ALL',              label: t('insp.fm.tab.all') },
    { value: 'IN_PROGRESS',      label: t('insp.fm.tab.inProgress') },
    { value: 'PENDING_APPROVAL', label: t('insp.fm.tab.pendingApproval') },
    { value: 'COMPLETED',        label: t('insp.fm.tab.completed') },
    { value: 'DRAFT',            label: t('insp.fm.tab.draft') },
  ]

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
  const [isMobile, setIsMobile]       = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

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

  // Refresh tab counts when the user returns to this tab (e.g. after
  // running and completing an inspection in the runner sub-route).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [load])

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
    if (!form.property_id) { setFormError(t('insp.fm.err.property')); return }
    if (!form.template_id) { setFormError(t('insp.fm.err.template')); return }

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
        throw new Error(body.error ?? t('insp.fm.err.start'))
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

  // Inspection status → colored left border
  function inspBorderColor(status: string) {
    if (status === 'COMPLETED')        return '#10B981'
    if (status === 'IN_PROGRESS')      return '#3B82F6'
    if (status === 'PENDING_APPROVAL') return '#F59E0B'
    if (status === 'SCHEDULED')        return '#6366F1'
    return '#6B7280'
  }
  function inspChipStyle(status: string): React.CSSProperties {
    if (status === 'COMPLETED')        return { background: '#D1FAE5', color: '#065F46' }
    if (status === 'IN_PROGRESS')      return { background: '#DBEAFE', color: '#1E40AF' }
    if (status === 'PENDING_APPROVAL') return { background: '#FEF3C7', color: '#92400E' }
    if (status === 'SCHEDULED')        return { background: '#EDE9FE', color: '#5B21B6' }
    return { background: '#F3F4F6', color: '#374151' }
  }
  function inspStatusLabel(status: string) {
    if (status === 'IN_PROGRESS')      return 'In Progress'
    if (status === 'PENDING_APPROVAL') return 'Pending Approval'
    if (status === 'COMPLETED')        return 'Completed'
    if (status === 'SCHEDULED')        return 'Scheduled'
    return status
  }

  return (
    <>

    {/* ── Mobile Inspections (Warmth / Command) ── */}
    <div className="lg:hidden" style={{ margin: '-1rem -1rem 0', padding: '16px 14px' }}>

      {/* Header + new button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--mob-fg)', margin: 0 }}>Inspections</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: 'var(--mob-accent)',
            color:      '#fff',
            border:     'none',
            borderRadius: 10,
            padding:    '7px 14px',
            fontSize:   12,
            fontWeight: 700,
            cursor:     'pointer',
          }}
        >
          + New
        </button>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--mob-card)', borderRadius: 10, border: '1px solid var(--mob-border)', padding: '8px 12px', marginBottom: 12 }}>
        <Search size={14} color="var(--mob-muted)" />
        <input
          type="text"
          placeholder="Search inspections…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: 'var(--mob-fg)', outline: 'none' }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'var(--mob-muted)', display: 'flex' }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', marginBottom: 12 }}>
        {filterTabs.map((tab) => {
          const active = activeTab === tab.value
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              style={{
                padding:      '5px 12px',
                borderRadius: 9999,
                fontSize:     11,
                fontWeight:   700,
                flexShrink:   0,
                border:       `1px solid ${active ? 'var(--mob-accent)' : 'var(--mob-border)'}`,
                background:   active ? 'var(--mob-accent)' : 'var(--mob-card)',
                color:        active ? '#fff' : 'var(--mob-muted)',
                cursor:       'pointer',
              }}
            >
              {tab.label} <span style={{ opacity: 0.7 }}>{tabCount(tab.value)}</span>
            </button>
          )
        })}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--mob-muted)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--mob-muted)', fontSize: 13 }}>
          {search ? 'No matches found' : 'No inspections yet'}
        </div>
      ) : (
        filtered.map((insp) => {
          const isRunnable = insp.status === 'DRAFT' || insp.status === 'IN_PROGRESS'
          const href = isRunnable
            ? `/dashboard/fm/inspections/${insp.id}/run`
            : `/dashboard/fm/inspections/${insp.id}`
          return (
            <Link key={insp.id} href={href} style={{ textDecoration: 'none', display: 'block', marginBottom: 8 }}>
              <div style={{
                padding:      '12px 12px',
                background:   'var(--mob-card)',
                borderRadius: 14,
                border:       '1px solid var(--mob-border)',
                borderLeft:   `4px solid ${inspBorderColor(insp.status)}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--mob-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {insp.fm_properties?.name ?? '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mob-muted)', marginTop: 2 }}>
                      {insp.fm_templates?.name ?? 'No template'}
                    </div>
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 20,
                    fontSize: 9, fontWeight: 700, flexShrink: 0,
                    ...inspChipStyle(insp.status),
                  }}>
                    {inspStatusLabel(insp.status)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: 'var(--mob-muted)' }}>
                  {insp.inspector?.full_name && (
                    <span>👤 {insp.inspector.full_name}</span>
                  )}
                  {insp.scheduled_for && (
                    <span>📅 {new Date(insp.scheduled_for).toLocaleDateString()}</span>
                  )}
                  {insp.score != null && (
                    <span style={{ color: insp.score >= 80 ? '#10B981' : insp.score >= 60 ? '#F59E0B' : '#EF4444', fontWeight: 700 }}>
                      Score: {insp.score}%
                    </span>
                  )}
                </div>
              </div>
            </Link>
          )
        })
      )}
    </div>

    {/* ── Desktop layout — unchanged ── */}
    <div className="hidden lg:block">
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>{t('insp.fm.title')}</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
            {inspections.length} {t('insp.fm.title').toLowerCase()}
          </p>
        </div>
        <FmButton
          icon={<Plus size={15} />}
          onClick={() => setShowModal(true)}
          size="sm"
          style={isMobile ? { width: '100%', justifyContent: 'center' } : undefined}
        >
          {t('insp.fm.start')}
        </FmButton>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder={t('insp.fm.search')}
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
      <div style={{
        display: 'flex', gap: '0.5rem',
        flexWrap: isMobile ? 'nowrap' : 'wrap',
        overflowX: isMobile ? 'auto' : 'visible',
        paddingBottom: isMobile ? '0.25rem' : 0,
        scrollbarWidth: 'none',
      }}>
        {filterTabs.map((tab) => {
          const active = activeTab === tab.value
          const count  = tabCount(tab.value)
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              style={{
                padding: '0.3rem 0.75rem', borderRadius: 9999,
                fontSize: '0.72rem', fontWeight: 700,
                border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                background: active ? 'var(--primary-c)' : 'var(--card-b)',
                color: active ? 'var(--primary)' : 'var(--muted)',
                cursor: 'pointer', transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                flexShrink: 0,
              }}
            >
              {tab.label}
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
          <FmButton variant="secondary" size="sm" onClick={load} style={{ marginTop: '1rem' }}>{t('retry')}</FmButton>
        </div>
      ) : (
        <FmCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <FmSectionLabel>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ClipboardCheck size={13} style={{ color: 'var(--primary)' }} />
                {filtered.length} {t('insp.fm.title').toLowerCase()}
                {(search || activeTab !== 'ALL') && ' (filtradas)'}
              </span>
            </FmSectionLabel>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
              <ClipboardCheck size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
              {t('insp.fm.empty')}
            </div>
          ) : isMobile ? (
            /* ── Mobile card list ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {filtered.map((insp, idx) => {
                const isRunnable = insp.status === 'DRAFT' || insp.status === 'IN_PROGRESS'
                const href = isRunnable
                  ? `/dashboard/fm/inspections/${insp.id}/run`
                  : `/dashboard/fm/inspections/${insp.id}`
                return (
                  <div
                    key={insp.id}
                    onClick={() => router.push(href)}
                    style={{
                      padding: '0.875rem 1rem',
                      borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: '0.4rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, color: 'var(--fg)', margin: 0, fontSize: '0.875rem', lineHeight: 1.3 }}>
                          {insp.fm_properties?.name ?? '—'}
                        </p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0.1rem 0 0' }}>
                          {insp.fm_templates?.name ?? '—'}
                        </p>
                      </div>
                      <FmBadge variant={statusVariant(insp.status)}>
                        {insp.status.replace(/_/g, ' ')}
                      </FmBadge>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{
                          fontSize: '0.8rem', fontWeight: 700,
                          color: insp.score == null ? 'var(--muted)' :
                            insp.score >= 80 ? 'var(--teal)' :
                            insp.score >= 60 ? 'var(--amber)' : 'var(--red)',
                        }}>
                          {insp.score != null ? `${insp.score}%` : '—'}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', color: 'var(--muted)' }}>
                          <Calendar size={11} />
                          {new Date(insp.scheduled_for ?? insp.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>
                        {isRunnable ? t('insp.fm.continue') : t('insp.fm.view')} <ChevronRight size={13} />
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* ── Desktop table ── */
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>{t('insp.fm.col.property')}</th>
                    <th>{t('insp.fm.col.template')}</th>
                    <th>{t('insp.fm.col.status')}</th>
                    <th>{t('insp.fm.col.score')}</th>
                    <th>{t('insp.fm.col.date')}</th>
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
                            {isRunnable ? t('insp.fm.continue') : t('insp.fm.view')} <ChevronRight size={13} />
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
        title={t('insp.fm.modal.title')}
        subtitle={t('insp.fm.modal.sub')}
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
              {t('insp.fm.form.property')} <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <select className="fm-input" value={form.property_id}
              onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value, asset_id: '' }))}
              style={{ appearance: 'none' }}>
              <option value="">{t('none')}</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Template */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
              {t('insp.fm.form.template')} <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <select className="fm-input" value={form.template_id}
              onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))}
              style={{ appearance: 'none' }}>
              <option value="">{t('none')}</option>
              {templates.map((tmpl) => <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>)}
            </select>
          </div>

          {/* Asset (optional, filtered by property) */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
              {t('insp.fm.form.asset')}
            </label>
            <select className="fm-input" value={form.asset_id}
              onChange={(e) => setForm((f) => ({ ...f, asset_id: e.target.value }))}
              disabled={!form.property_id}
              style={{ appearance: 'none', opacity: !form.property_id ? 0.5 : 1 }}>
              <option value="">{t('insp.fm.form.wholeProperty')}</option>
              {filteredAssets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* Scheduled for */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
              {t('insp.fm.form.scheduledFor')}
            </label>
            <input className="fm-input" type="date" value={form.scheduled_for}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_for: e.target.value }))} />
          </div>

          <FmModalFooter>
            <FmButton type="button" variant="secondary" size="sm"
              onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setFormError(null) }}>
              {t('cancel')}
            </FmButton>
            <FmButton type="submit" size="sm" loading={saving} icon={<ClipboardCheck size={14} />}>
              {saving ? t('insp.fm.starting') : t('insp.fm.start')}
            </FmButton>
          </FmModalFooter>
        </form>
      </FmModal>

    </div>
    </div> {/* end hidden lg:block desktop wrapper */}
    </> /* end mobile+desktop fragment */
  )
}
