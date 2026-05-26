'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, AlertTriangle, CheckCircle,
  FileText, User, Calendar, ClipboardCheck,
  Play, ShieldAlert, Image as ImageIcon,
  MapPin, X, ZoomIn, ZoomOut, RotateCcw,
  Wrench, Clock, CheckCircle2,
} from 'lucide-react'
import {
  FmCard, FmBadge, FmButton, FmSectionLabel, statusVariant,
} from '@/components/fm'
import { useFmT } from '@/lib/locale'

// ── Types ──────────────────────────────────────────────────────────────────

interface EvidencePhoto {
  id: string
  url: string
  file_key: string
  name?: string
}

interface LocationPin {
  floor_plan_id:  string
  floor_plan_url: string
  x: number
  y: number
}

interface FmInspectionItem {
  id:                 string
  key:                string
  label:              string
  result:             string | null
  severity:           string | null
  notes:              string | null
  inspector_notes:    string | null
  recommended_action: string | null
  rating:             number | null
  evidence:           EvidencePhoto[] | null
  location_data:      LocationPin | null
}

interface FmWorkOrder {
  id:               string
  title:            string
  status:           string
  priority:         string
  created_at:       string
  resolved_at:      string | null
  checklist_item_id: string | null
  assigned_to:      { full_name: string } | null
  submitted_by:     { full_name: string } | null
  resolved_by:      { full_name: string } | null
}

interface FmInspection {
  id:             string
  status:         string
  score:          number | null
  started_at:     string | null
  completed_at:   string | null
  scheduled_for:  string | null
  created_at:     string
  fm_properties?: { id: string; name: string } | null
  fm_templates?:  { name: string } | null
  inspector?:     { full_name: string } | null
  approved_by?:   { full_name: string } | null
  fm_inspection_items?: FmInspectionItem[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function resultVariant(r: string | null) {
  const u = r?.toUpperCase()
  if (u === 'PASS') return 'success' as const
  if (u === 'FAIL') return 'danger'  as const
  return 'neutral' as const
}

function severityVariant(s: string | null) {
  if (s === 'HIGH')   return 'danger'  as const
  if (s === 'MEDIUM') return 'warning' as const
  if (s === 'LOW')    return 'info'    as const
  return 'neutral' as const
}

function woStatusVariant(s: string) {
  if (s === 'RESOLVED' || s === 'CLOSED') return 'success'  as const
  if (s === 'OPEN')                       return 'info'      as const
  if (s === 'IN_PROGRESS')                return 'warning'   as const
  if (s === 'PENDING_REVIEW')             return 'neutral'   as const
  return 'neutral' as const
}

function fmtDate(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// ── Meta tile ──────────────────────────────────────────────────────────────

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

// ── Full-Screen Viewer ─────────────────────────────────────────────────────

interface ViewerItem {
  label:    string
  evidence: EvidencePhoto[]
  pin:      LocationPin | null
}

function ZoomPanPanel({
  src,
  alt,
  overlay,
}: {
  src:      string
  alt:      string
  overlay?: React.ReactNode
}) {
  const [zoom, setZoom]   = useState(1)
  const [tx, setTx]       = useState(0)
  const [ty, setTy]       = useState(0)
  const dragging          = useRef(false)
  const lastPos           = useRef({ x: 0, y: 0 })
  const lastDist          = useRef<number | null>(null)

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    setZoom((z) => Math.max(0.5, Math.min(8, z - e.deltaY * 0.002)))
  }

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true
    lastPos.current  = { x: e.clientX, y: e.clientY }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return
    setTx((v) => v + (e.clientX - lastPos.current.x) / zoom)
    setTy((v) => v + (e.clientY - lastPos.current.y) / zoom)
    lastPos.current = { x: e.clientX, y: e.clientY }
  }
  function onMouseUp() { dragging.current = false }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      dragging.current = true
      lastPos.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      lastDist.current = null
    } else if (e.touches.length === 2) {
      dragging.current = false
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastDist.current = Math.hypot(dx, dy)
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    if (e.touches.length === 1 && dragging.current) {
      setTx((v) => v + (e.touches[0].clientX - lastPos.current.x) / zoom)
      setTy((v) => v + (e.touches[0].clientY - lastPos.current.y) / zoom)
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    } else if (e.touches.length === 2 && lastDist.current !== null) {
      const dx   = e.touches[0].clientX - e.touches[1].clientX
      const dy   = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const ratio = dist / lastDist.current
      setZoom((z) => Math.max(0.5, Math.min(8, z * ratio)))
      lastDist.current = dist
    }
  }
  function onTouchEnd() { dragging.current = false; lastDist.current = null }

  function reset() { setZoom(1); setTx(0); setTy(0) }

  return (
    <div
      style={{
        flex: 1, overflow: 'hidden', position: 'relative',
        background: '#000', borderRadius: 12, cursor: zoom > 1 ? 'grab' : 'default',
        userSelect: 'none', minHeight: 200,
      }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `scale(${zoom}) translate(${tx}px, ${ty}px)`,
        transformOrigin: 'center center',
        transition: dragging.current ? 'none' : 'transform 0.05s',
        position: 'relative',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          style={{ maxWidth: '100%', maxHeight: '100%', display: 'block', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' }}
          draggable={false}
        />
        {overlay}
      </div>

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: '0.75rem', right: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {[
          { icon: <ZoomIn size={14} />,   fn: () => setZoom((z) => Math.min(8, z + 0.5)) },
          { icon: <ZoomOut size={14} />,  fn: () => setZoom((z) => Math.max(0.5, z - 0.5)) },
          { icon: <RotateCcw size={14} />, fn: reset },
        ].map((btn, i) => (
          <button
            key={i}
            onClick={btn.fn}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {btn.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

function FullScreenViewer({
  item,
  onClose,
}: {
  item:    ViewerItem
  onClose: () => void
}) {
  const [photoIdx, setPhotoIdx] = useState(0)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const photo = item.evidence[photoIdx] ?? null
  const pin   = item.pin

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: '#0a0a0a',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '0.875rem 1.25rem',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex', padding: 4 }}
        >
          <X size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.label}
          </p>
          {photo && item.evidence.length > 1 && (
            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
              Photo {photoIdx + 1} of {item.evidence.length}
            </p>
          )}
        </div>
      </div>

      {/* Content panels */}
      <div style={{
        flex: 1, overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: photo && pin ? '1fr 1fr' : '1fr',
        gap: '0.75rem', padding: '0.75rem',
      }}>
        {/* Photo panel */}
        {photo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Photo
            </p>
            <ZoomPanPanel src={photo.url} alt={photo.name ?? 'Inspection photo'} />

            {/* Photo nav strip (if multiple) */}
            {item.evidence.length > 1 && (
              <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                {item.evidence.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setPhotoIdx(i)}
                    style={{
                      flexShrink: 0,
                      width: 48, height: 48, borderRadius: 6, overflow: 'hidden',
                      border: `2px solid ${i === photoIdx ? 'var(--primary)' : 'rgba(255,255,255,0.15)'}`,
                      padding: 0, cursor: 'pointer', background: 'none',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Floor plan panel */}
        {pin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Floor Plan Location
            </p>
            <ZoomPanPanel
              src={pin.floor_plan_url}
              alt="Floor plan"
              overlay={
                <div style={{
                  position: 'absolute',
                  left:   `${pin.x * 100}%`,
                  top:    `${pin.y * 100}%`,
                  transform: 'translate(-50%, -100%)',
                  pointerEvents: 'none',
                }}>
                  <MapPin size={28} style={{ color: 'var(--red)', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }} />
                </div>
              }
            />
          </div>
        )}
      </div>
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
  const [workOrders, setWorkOrders] = useState<FmWorkOrder[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [approving, setApproving]   = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [viewerItem, setViewerItem] = useState<ViewerItem | null>(null)
  const [checklistView, setChecklistView] = useState<'table' | 'report'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('fm_checklist_view') as 'table' | 'report') ?? 'table'
    }
    return 'table'
  })

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetch(`/api/fm/inspections/${id}`).then((r) => {
        if (!r.ok) throw new Error(t('error.generic'))
        return r.json() as Promise<FmInspection>
      }),
      fetch(`/api/fm/work-orders?inspectionId=${id}`).then((r) =>
        r.ok ? (r.json() as Promise<FmWorkOrder[]>) : ([] as FmWorkOrder[])
      ),
    ])
      .then(([insp, wos]) => {
        setInspection(insp)
        setWorkOrders(wos)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [id, t])

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

  const items         = inspection.fm_inspection_items ?? []
  const isRunnable    = inspection.status === 'DRAFT' || inspection.status === 'IN_PROGRESS'
  const isPending     = inspection.status === 'PENDING_APPROVAL'
  const failedItems   = items.filter((i) => i.result?.toLowerCase() === 'fail')
  const criticalItems = items.filter((i) => i.severity === 'HIGH' && i.result?.toLowerCase() === 'fail')

  // Build activity timeline
  type TimelineEvent = { ts: string; label: string; icon: React.ReactNode; color: string }
  const timeline: TimelineEvent[] = []

  timeline.push({
    ts: inspection.created_at,
    label: `Inspection created${inspection.inspector ? ` by ${inspection.inspector.full_name}` : ''}`,
    icon: <ClipboardCheck size={13} />,
    color: 'var(--muted)',
  })
  if (inspection.started_at) {
    timeline.push({
      ts: inspection.started_at,
      label: 'Inspection started',
      icon: <Play size={13} />,
      color: 'var(--primary)',
    })
  }
  workOrders.forEach((wo) => {
    timeline.push({
      ts: wo.created_at,
      label: `Work order created: ${wo.title}`,
      icon: <Wrench size={13} />,
      color: 'var(--amber)',
    })
    if (wo.resolved_at) {
      timeline.push({
        ts: wo.resolved_at,
        label: `Work order resolved${wo.resolved_by ? ` by ${wo.resolved_by.full_name}` : ''}: ${wo.title}`,
        icon: <CheckCircle2 size={13} />,
        color: 'var(--teal)',
      })
    }
  })
  if (inspection.completed_at) {
    timeline.push({
      ts: inspection.completed_at,
      label: 'Inspection completed',
      icon: <CheckCircle size={13} />,
      color: 'var(--teal)',
    })
  }
  if (inspection.approved_by) {
    timeline.push({
      ts: inspection.completed_at ?? inspection.created_at,
      label: `Approved by ${inspection.approved_by.full_name}`,
      icon: <CheckCircle size={13} />,
      color: 'var(--teal)',
    })
  }
  timeline.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

  return (
    <>
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
              <MetaTile label={t('insp.fm.detail.started')} value={fmtDate(inspection.started_at)} icon={<Calendar size={12} />} />
            )}
            {inspection.completed_at && (
              <MetaTile label={t('insp.fm.detail.completed')} value={fmtDate(inspection.completed_at)} icon={<Calendar size={12} />} />
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
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <FmSectionLabel>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ClipboardCheck size={13} style={{ color: 'var(--primary)' }} />
                {t('insp.fm.detail.checklist')} ({items.length})
              </span>
            </FmSectionLabel>
            {/* View toggle */}
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
              {(['table', 'report'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setChecklistView(v)
                    localStorage.setItem('fm_checklist_view', v)
                  }}
                  style={{
                    padding: '0.3rem 0.75rem',
                    fontSize: '0.72rem', fontWeight: 700,
                    background: checklistView === v ? 'var(--primary)' : 'transparent',
                    color: checklistView === v ? '#fff' : 'var(--muted)',
                    border: 'none', cursor: 'pointer',
                    transition: 'all 0.15s',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}
                >
                  {v === 'table' ? 'Form View' : 'Report View'}
                </button>
              ))}
            </div>
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
              {t('insp.fm.detail.noItems')}
            </div>
          ) : checklistView === 'table' ? (
            /* ── Form View (default table) ── */
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>{t('insp.fm.detail.col.item')}</th>
                    <th>{t('insp.fm.detail.col.result')}</th>
                    <th>{t('insp.fm.detail.col.severity')}</th>
                    <th>Media</th>
                    <th>{t('insp.fm.detail.col.notes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const hasEvidence = Array.isArray(item.evidence) && item.evidence.length > 0
                    const hasPin      = !!item.location_data
                    const canView     = hasEvidence || hasPin
                    const linkedWOs   = workOrders.filter((w) => w.checklist_item_id === item.id)

                    return (
                      <tr
                        key={item.id}
                        onClick={canView ? () => setViewerItem({
                          label:    item.label,
                          evidence: Array.isArray(item.evidence) ? item.evidence : [],
                          pin:      item.location_data,
                        }) : undefined}
                        style={{
                          background: item.result?.toLowerCase() === 'fail' && item.severity === 'HIGH'
                            ? 'var(--red-c)' : undefined,
                          cursor: canView ? 'pointer' : 'default',
                        }}
                        title={canView ? 'Click to view full screen' : undefined}
                      >
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{item.label}</span>
                            {linkedWOs.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                {linkedWOs.map((wo) => (
                                  <Link
                                    key={wo.id}
                                    href={`/dashboard/fm/work-orders/${wo.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ textDecoration: 'none' }}
                                  >
                                    <span style={{
                                      fontSize: '0.65rem', fontWeight: 700,
                                      padding: '0.15rem 0.4rem', borderRadius: 4,
                                      background: 'var(--amber-c)', color: 'var(--amber)',
                                      border: '1px solid var(--amber)',
                                      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                    }}>
                                      <Wrench size={9} /> WO
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {hasEvidence && (
                              <span
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                  fontSize: '0.72rem', fontWeight: 700,
                                  color: 'var(--primary)',
                                  background: 'var(--primary-c, rgba(59,130,246,0.1))',
                                  border: '1px solid rgba(59,130,246,0.3)',
                                  padding: '0.15rem 0.45rem', borderRadius: 6,
                                }}
                                title="Has photos — click to view"
                              >
                                <ImageIcon size={10} />
                                {(item.evidence as EvidencePhoto[]).length}
                              </span>
                            )}
                            {hasPin && (
                              <span
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                  fontSize: '0.72rem', fontWeight: 700,
                                  color: 'var(--teal)',
                                  background: 'var(--teal-c)',
                                  border: '1px solid var(--teal)',
                                  padding: '0.15rem 0.45rem', borderRadius: 6,
                                }}
                                title="Has floor plan pin — click to view"
                              >
                                <MapPin size={10} />
                                Pin
                              </span>
                            )}
                            {!hasEvidence && !hasPin && (
                              <span style={{ color: 'var(--faint)', fontSize: '0.8rem' }}>—</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                            {item.notes ?? '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* ── Report View (RICS-style per-element cards) ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {items.map((item, idx) => {
                const hasEvidence = Array.isArray(item.evidence) && item.evidence.length > 0
                const linkedWOs   = workOrders.filter((w) => w.checklist_item_id === item.id)
                const ratingNum   = item.rating
                const ratingLabel = ratingNum === 3 ? '[3] Urgent'
                  : ratingNum === 2 ? '[2] Attention'
                  : ratingNum === 1 ? '[1] Satisfactory'
                  : item.result?.toUpperCase() === 'NA' ? '[NI] Not Inspected'
                  : item.result?.toUpperCase() === 'PASS' ? 'Pass'
                  : item.result?.toUpperCase() === 'FAIL' ? 'Fail'
                  : '—'
                const ratingColor = ratingNum === 3 ? 'var(--red)'
                  : ratingNum === 2 ? 'var(--amber)'
                  : ratingNum === 1 ? 'var(--teal)'
                  : 'var(--muted)'
                const ratingBg = ratingNum === 3 ? 'var(--red-c)'
                  : ratingNum === 2 ? 'var(--amber-c)'
                  : ratingNum === 1 ? 'var(--teal-c)'
                  : 'var(--card-b)'

                const hasCommentary = item.notes || item.inspector_notes || item.recommended_action

                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '1.25rem 1.5rem',
                      borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    {/* Element header row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: hasCommentary ? '1rem' : 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--fg)', margin: '0 0 0.2rem 0' }}>
                          {item.label}
                        </p>
                        {linkedWOs.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.3rem' }}>
                            {linkedWOs.map((wo) => (
                              <Link key={wo.id} href={`/dashboard/fm/work-orders/${wo.id}`} style={{ textDecoration: 'none' }}>
                                <span style={{
                                  fontSize: '0.65rem', fontWeight: 700,
                                  padding: '0.15rem 0.4rem', borderRadius: 4,
                                  background: 'var(--amber-c)', color: 'var(--amber)',
                                  border: '1px solid var(--amber)',
                                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                }}>
                                  <Wrench size={9} /> WO
                                </span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        {hasEvidence && (
                          <button
                            onClick={() => setViewerItem({
                              label: item.label,
                              evidence: Array.isArray(item.evidence) ? item.evidence : [],
                              pin: item.location_data,
                            })}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                              fontSize: '0.72rem', fontWeight: 700,
                              color: 'var(--primary)',
                              background: 'var(--primary-c, rgba(59,130,246,0.1))',
                              border: '1px solid rgba(59,130,246,0.3)',
                              padding: '0.2rem 0.5rem', borderRadius: 6,
                              cursor: 'pointer',
                            }}
                            title="View photos"
                          >
                            <ImageIcon size={10} />
                            {(item.evidence as EvidencePhoto[]).length}
                          </button>
                        )}
                        <span style={{
                          fontSize: '0.75rem', fontWeight: 800,
                          padding: '0.25rem 0.625rem', borderRadius: 6,
                          background: ratingBg, color: ratingColor,
                          border: `1px solid ${ratingColor}`,
                          whiteSpace: 'nowrap',
                        }}>
                          {ratingLabel}
                        </span>
                      </div>
                    </div>

                    {/* Commentary paragraphs */}
                    {hasCommentary && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {item.notes && (
                          <div>
                            <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.2rem 0' }}>
                              Field Observation
                            </p>
                            <p style={{ fontSize: '0.875rem', color: 'var(--fg)', margin: 0, lineHeight: 1.6 }}>
                              {item.notes}
                            </p>
                          </div>
                        )}
                        {item.inspector_notes && (
                          <div>
                            <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.2rem 0' }}>
                              Inspector Assessment
                            </p>
                            <p style={{ fontSize: '0.875rem', color: 'var(--fg)', margin: 0, lineHeight: 1.6 }}>
                              {item.inspector_notes}
                            </p>
                          </div>
                        )}
                        {item.recommended_action && (
                          <div style={{ background: 'var(--card-b)', borderRadius: 8, padding: '0.75rem 1rem', borderLeft: '3px solid var(--primary)' }}>
                            <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.2rem 0' }}>
                              Recommended Action
                            </p>
                            <p style={{ fontSize: '0.875rem', color: 'var(--fg)', margin: 0, lineHeight: 1.6 }}>
                              {item.recommended_action}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </FmCard>

        {/* ── Work Orders ── */}
        {workOrders.length > 0 && (
          <FmCard style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
              <FmSectionLabel>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Wrench size={13} style={{ color: 'var(--amber)' }} />
                  Work Orders ({workOrders.length})
                </span>
              </FmSectionLabel>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Assigned To</th>
                    <th>Created</th>
                    <th>Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  {workOrders.map((wo) => (
                    <tr key={wo.id}>
                      <td>
                        <Link
                          href={`/dashboard/fm/work-orders/${wo.id}`}
                          style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', fontSize: '0.875rem' }}
                        >
                          {wo.title}
                        </Link>
                      </td>
                      <td><FmBadge variant={woStatusVariant(wo.status)}>{wo.status.replace(/_/g, ' ')}</FmBadge></td>
                      <td><span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{wo.assigned_to?.full_name ?? '—'}</span></td>
                      <td><span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{fmtDate(wo.created_at)}</span></td>
                      <td>
                        {wo.resolved_at ? (
                          <span style={{ fontSize: '0.8rem', color: 'var(--teal)' }}>
                            {fmtDate(wo.resolved_at)}{wo.resolved_by ? ` · ${wo.resolved_by.full_name}` : ''}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--faint)', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FmCard>
        )}

        {/* ── Activity Timeline ── */}
        <FmCard>
          <FmSectionLabel>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={13} style={{ color: 'var(--primary)' }} />
              Activity
            </span>
          </FmSectionLabel>
          <div style={{ marginTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {timeline.map((ev, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.75rem', position: 'relative' }}>
                {/* Spine */}
                {i < timeline.length - 1 && (
                  <div style={{
                    position: 'absolute', left: '0.6rem', top: '1.5rem',
                    width: 1, bottom: 0,
                    background: 'var(--border)',
                  }} />
                )}
                {/* Icon bubble */}
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'var(--card-b)', border: `1px solid var(--border)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: ev.color, flexShrink: 0, marginTop: '0.125rem',
                }}>
                  {ev.icon}
                </div>
                {/* Text */}
                <div style={{ flex: 1, paddingBottom: '1rem' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', margin: 0 }}>{ev.label}</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0.15rem 0 0' }}>
                    <FileText size={10} style={{ display: 'inline', marginRight: '0.2rem', verticalAlign: 'middle' }} />
                    {fmtDateTime(ev.ts)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </FmCard>

      </div>

      {/* ── Full-Screen Viewer ── */}
      {viewerItem && (
        <FullScreenViewer
          item={viewerItem}
          onClose={() => setViewerItem(null)}
        />
      )}
    </>
  )
}
