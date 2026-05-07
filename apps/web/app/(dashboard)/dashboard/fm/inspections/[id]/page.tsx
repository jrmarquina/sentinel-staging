'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, AlertTriangle, CheckCircle,
  Download, FileText, User, Calendar, ClipboardCheck,
  Play, ShieldAlert,
} from 'lucide-react'
import {
  FmCard, FmBadge, FmButton, FmSectionLabel, statusVariant,
} from '@/components/fm'
import { useFmT } from '@/lib/locale'

// ── Types ──────────────────────────────────────────────────────────────────

interface FmInspectionItem {
  id: string
  key: string
  label: string
  result: string | null
  severity: string | null
  notes: string | null
}

interface FmAttachment {
  id: string
  filename: string
  file_size: number | null
  mime_type: string | null
  signed_url: string | null
}

interface FmInspection {
  id: string
  status: string
  score: number | null
  started_at: string | null
  completed_at: string | null
  scheduled_for: string | null
  fm_properties?: { id: string; name: string } | null
  fm_templates?:  { name: string } | null
  inspector?:     { full_name: string } | null
  approved_by?:   { full_name: string } | null
  fm_inspection_items?: FmInspectionItem[]
  fm_attachments?: FmAttachment[]
}

function fileSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function resultVariant(r: string | null) {
  if (r === 'PASS') return 'success' as const
  if (r === 'FAIL') return 'danger' as const
  return 'neutral' as const
}

function severityVariant(s: string | null) {
  if (s === 'HIGH')   return 'danger' as const
  if (s === 'MEDIUM') return 'warning' as const
  if (s === 'LOW')    return 'info' as const
  return 'neutral' as const
}

// ── Spec tile ──────────────────────────────────────────────────────────────

function MetaTile({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.875rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
        {icon && <span style={{ color: 'var(--muted)', display: 'flex' }}>{icon}</span>}
        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>{label}</p>
      </div>
      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--fg)' }}>{value}</div>
    </div>
  )
}

// ── Score gauge ────────────────────────────────────────────────────────────

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? 'var(--teal)' : score >= 60 ? 'var(--amber)' : 'var(--red)'
  const pct   = Math.min(100, Math.max(0, score))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '1rem 0' }}>
      <div style={{ position: 'relative', width: 80, height: 80 }}>
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border)" strokeWidth="8" />
          <circle
            cx="40" cy="40" r="34" fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={`${(pct / 100) * 213.6} 213.6`}
            strokeLinecap="round"
            transform="rotate(-90 40 40)"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color }}>{score}%</span>
        </div>
      </div>
      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </p>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FMInspectionDetailPage() {
  const t = useFmT()
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [inspection, setInspection] = useState<FmInspection | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [approving, setApproving]   = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/fm/inspections/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(t('error.generic'))
        return r.json() as Promise<FmInspection>
      })
      .then(setInspection)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleApprove() {
    setApproving(true)
    setApproveError(null)
    try {
      const res = await fetch(`/api/fm/inspections/${id}/approve`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? t('error.generic'))
      }
      const updated = await res.json() as FmInspection
      setInspection(updated)
    } catch (e: unknown) {
      setApproveError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setApproving(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !inspection) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--red)' }}>
        <AlertTriangle size={28} style={{ margin: '0 auto 0.75rem' }} />
        <p style={{ fontSize: '0.875rem' }}>{error ?? t('error.generic')}</p>
        <FmButton variant="secondary" size="sm" onClick={() => router.push('/dashboard/fm/inspections')} style={{ marginTop: '1rem' }}>
          {t('insp.fm.detail.back')}
        </FmButton>
      </div>
    )
  }

  const items       = inspection.fm_inspection_items ?? []
  const attachments = inspection.fm_attachments ?? []
  const isRunnable  = inspection.status === 'DRAFT' || inspection.status === 'IN_PROGRESS'
  const isPending   = inspection.status === 'PENDING_APPROVAL'
  const failedItems = items.filter((i) => i.result === 'FAIL')
  const criticalItems = items.filter((i) => i.severity === 'HIGH' && i.result === 'FAIL')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
        <button
          onClick={() => router.push('/dashboard/fm/inspections')}
          style={{
            marginTop: '0.2rem', padding: '0.375rem',
            background: 'var(--card-b)', border: '1px solid var(--border)',
            borderRadius: 8, cursor: 'pointer', color: 'var(--muted)',
            display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
          aria-label={t('insp.fm.detail.back')}
        >
          <ArrowLeft size={17} />
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
              {inspection.fm_properties?.name ?? 'Inspection'}
            </h1>
            {inspection.fm_templates?.name && (
              <FmBadge variant="info">{inspection.fm_templates.name}</FmBadge>
            )}
            <FmBadge variant={statusVariant(inspection.status)}>
              {inspection.status.replace(/_/g, ' ')}
            </FmBadge>
          </div>
          {inspection.fm_properties && (
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
              <Link href={`/dashboard/fm/properties/${inspection.fm_properties.id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
                {inspection.fm_properties.name}
              </Link>
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          {isPending && (
            <FmButton
              icon={approving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
              onClick={handleApprove}
              size="sm"
            >
              {approving ? t('insp.fm.detail.approving') : t('insp.fm.detail.approve')}
            </FmButton>
          )}
          {isRunnable && (
            <FmButton
              icon={<Play size={14} />}
              size="sm"
              onClick={() => router.push(`/dashboard/fm/inspections/${id}/run`)}
            >
              {t('insp.fm.detail.continue')}
            </FmButton>
          )}
        </div>
      </div>

      {/* Approve error */}
      {approveError && (
        <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.8rem', color: 'var(--red)' }}>
          {approveError}
        </div>
      )}

      {/* Critical issues banner */}
      {criticalItems.length > 0 && (
        <div style={{
          background: 'var(--red-c)', border: '1px solid var(--red)',
          borderRadius: 12, padding: '0.875rem 1rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
        }}>
          <ShieldAlert size={18} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--red)', margin: 0 }}>
              {criticalItems.length} {t('insp.fm.detail.criticalBanner')}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--red)', margin: 0, opacity: 0.8 }}>
              {criticalItems.map((i) => i.label).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* ── Score + Meta row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: inspection.score != null ? 'auto 1fr' : '1fr', gap: '1rem', alignItems: 'start' }}>
        {inspection.score != null && (
          <FmCard style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ScoreGauge score={inspection.score} label={t('insp.fm.detail.score')} />
          </FmCard>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
          {inspection.inspector?.full_name && (
            <MetaTile label={t('insp.fm.detail.inspector')} value={inspection.inspector.full_name} icon={<User size={12} />} />
          )}
          {inspection.started_at && (
            <MetaTile label={t('insp.fm.detail.started')} value={new Date(inspection.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} icon={<Calendar size={12} />} />
          )}
          {inspection.completed_at && (
            <MetaTile label={t('insp.fm.detail.completed')} value={new Date(inspection.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} icon={<Calendar size={12} />} />
          )}
          {inspection.approved_by?.full_name && (
            <MetaTile label={t('insp.fm.detail.approvedBy')} value={inspection.approved_by.full_name} icon={<CheckCircle size={12} />} />
          )}
          {items.length > 0 && (
            <MetaTile
              label={t('insp.fm.detail.items')}
              value={
                <span>
                  {items.length} {t('insp.fm.detail.total')}
                  {failedItems.length > 0 && (
                    <span style={{ color: 'var(--red)', marginLeft: '0.4rem', fontWeight: 700 }}>
                      · {failedItems.length} {t('insp.fm.detail.failed')}
                    </span>
                  )}
                </span>
              }
              icon={<ClipboardCheck size={12} />}
            />
          )}
        </div>
      </div>

      {/* ── Checklist ── */}
      <FmCard style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <FmSectionLabel>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ClipboardCheck size={13} style={{ color: 'var(--primary)' }} />
              {t('insp.fm.detail.checklist')} ({items.length})
            </span>
          </FmSectionLabel>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
            {t('insp.fm.detail.noItems')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="fm-table">
              <thead>
                <tr>
                  <th>{t('insp.fm.detail.col.item')}</th>
                  <th>{t('insp.fm.detail.col.result')}</th>
                  <th>{t('insp.fm.detail.col.severity')}</th>
                  <th>{t('insp.fm.detail.col.notes')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    style={{
                      background: item.result === 'FAIL' && item.severity === 'HIGH'
                        ? 'var(--red-c)' : undefined,
                    }}
                  >
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{item.label}</span>
                    </td>
                    <td>
                      {item.result ? (
                        <FmBadge variant={resultVariant(item.result)}>{item.result}</FmBadge>
                      ) : (
                        <span style={{ color: 'var(--faint)', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                    <td>
                      {item.severity ? (
                        <FmBadge variant={severityVariant(item.severity)}>{item.severity}</FmBadge>
                      ) : (
                        <span style={{ color: 'var(--faint)', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                        {item.notes ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FmCard>

      {/* ── Attachments ── */}
      {attachments.length > 0 && (
        <FmCard>
          <FmSectionLabel>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={13} style={{ color: 'var(--primary)' }} />
              {t('insp.fm.detail.attachments')} ({attachments.length})
            </span>
          </FmSectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.625rem', marginTop: '0.75rem' }}>
            {attachments.map((att) => (
              <div key={att.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                background: 'var(--card-b)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '0.625rem 0.75rem',
              }}>
                <FileText size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.filename}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: 0 }}>{fileSize(att.file_size)}</p>
                </div>
                {att.signed_url && (
                  <a
                    href={att.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--muted)', display: 'flex', transition: 'color 0.15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
                    aria-label={t('rep.download')}
                  >
                    <Download size={15} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </FmCard>
      )}

    </div>
  )
}
