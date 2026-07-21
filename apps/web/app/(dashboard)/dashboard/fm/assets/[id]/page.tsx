'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, AlertTriangle, Wrench,
  MapPin, Building2, Tag, QrCode, ClipboardCheck,
  Image, FileText, Download, Trash2, Upload,
  Pencil, Plus, X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import {
  FmCard, FmBadge, FmButton, FmModal,
  FmModalFooter, FmSectionLabel, statusVariant, AssetCustodyTab,
} from '@/components/fm'
import { useFmT } from '@/lib/locale'
import { useRole } from '@/hooks/useRole'

// ── Types ──────────────────────────────────────────────────────────────────

interface FmAttachment {
  id: string
  filename: string
  file_size: number | null
  mime_type: string | null
  signed_url: string | null
  created_at: string
}

interface FmInspectionSummary {
  id: string
  status: string
  score: number | null
  completed_at: string | null
  created_at: string
  fm_properties?: { name: string } | null
}

interface FmPropertySummary { id: string; name: string }

interface FmCustodianSummary { id: string; full_name: string; custodian_type: string }
interface FmSpaceSummary { id: string; name: string; space_type: string }

interface FmAsset {
  id: string
  name: string
  code: string
  category: string
  condition: string
  location: string | null
  serial_number?: string | null
  last_inspection?: string | null
  property_id?: string | null
  mobility?: string
  status?: string
  current_custodian?: FmCustodianSummary | null
  current_space?: FmSpaceSummary | null
  fm_properties?: FmPropertySummary | null
  fm_inspections?: FmInspectionSummary[]
  fm_attachments?: FmAttachment[]
}

interface EditForm {
  name: string; code: string; category: string
  condition: string; location: string; serial_number: string
}

const CATEGORIES = ['ELECTRICAL', 'PLUMBING', 'HVAC', 'STRUCTURAL', 'FIRE_SAFETY', 'OTHER'] as const
const CONDITIONS = ['GOOD', 'FAIR', 'POOR'] as const

const conditionVariant = (c: string) =>
  c === 'GOOD' ? 'success' as const :
  c === 'FAIR' ? 'warning' as const : 'danger' as const

function fileSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImage(mime: string | null): boolean {
  return (mime ?? '').startsWith('image/')
}

// ── Tab component ──────────────────────────────────────────────────────────

type TabId = 'overview' | 'custody' | 'history' | 'docs'

function Tab({ id, active, label, icon, onClick }: {
  id: TabId; active: boolean; label: string; icon: React.ReactNode; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.6rem 0.25rem',
        fontSize: '0.82rem', fontWeight: 600,
        color: active ? 'var(--primary)' : 'var(--muted)',
        background: 'none', border: 'none', cursor: 'pointer',
        borderBottom: `2px solid ${active ? 'var(--primary)' : 'transparent'}`,
        transition: 'color 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

// ── Spec tile ──────────────────────────────────────────────────────────────

function SpecTile({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--card-b)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '0.875rem 1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.4rem' }}>
        {icon && <span style={{ color: 'var(--muted)', display: 'flex' }}>{icon}</span>}
        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>
          {label}
        </p>
      </div>
      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--fg)' }}>{value}</div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function FMAssetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const t = useFmT()
  const { role } = useRole()
  const canManageCustody = role === 'admin' || role === 'supervisor'
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [asset, setAsset]         = useState<FmAsset | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [tab, setTab]             = useState<TabId>('overview')

  // Edit modal
  const [showEdit, setShowEdit]   = useState(false)
  const [editForm, setEditForm]   = useState<EditForm>({ name: '', code: '', category: 'OTHER', condition: 'GOOD', location: '', serial_number: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Upload
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/fm/assets/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(t('asset.empty'))
        return r.json() as Promise<FmAsset>
      })
      .then((a) => {
        setAsset(a)
        setEditForm({
          name: a.name,
          code: a.code,
          category: a.category,
          condition: a.condition,
          location: a.location ?? '',
          serial_number: a.serial_number ?? '',
        })
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [id, t])

  useEffect(() => { load() }, [load])

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    setEditError(null)
    if (!editForm.name.trim()) { setEditError(t('asset.err.name')); return }
    if (!editForm.code.trim()) { setEditError(t('asset.err.code')); return }
    setEditSaving(true)
    try {
      const res = await fetch(`/api/fm/assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          code: editForm.code.trim().toUpperCase(),
          category: editForm.category,
          condition: editForm.condition,
          location: editForm.location.trim() || null,
          serial_number: editForm.serial_number.trim() || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? t('error.generic'))
      }
      setShowEdit(false)
      load()
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/fm/assets/${id}/attachments`, { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? t('error.generic'))
      }
      load()
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : t('error.generic'))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDeleteAttachment(attId: string) {
    try {
      await fetch(`/api/fm/assets/${id}/attachments/${attId}`, { method: 'DELETE' })
      load()
    } catch {
      // silent — non-critical
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
  if (error || !asset) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--red)' }}>
        <AlertTriangle size={28} style={{ margin: '0 auto 0.75rem' }} />
        <p style={{ fontSize: '0.875rem' }}>{error ?? t('asset.empty')}</p>
        <FmButton variant="secondary" size="sm" onClick={load} style={{ marginTop: '1rem' }}>
          {t('retry')}
        </FmButton>
        <br />
        <FmButton variant="secondary" size="sm" onClick={() => router.push('/dashboard/fm/assets')} style={{ marginTop: '0.5rem' }}>
          {t('back')}
        </FmButton>
      </div>
    )
  }

  const inspections = asset.fm_inspections ?? []
  const attachments = asset.fm_attachments ?? []
  const qrValue = typeof window !== 'undefined'
    ? `${window.location.origin}/dashboard/fm/assets/${id}`
    : `/dashboard/fm/assets/${id}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
        <button
          onClick={() => router.push('/dashboard/fm/assets')}
          style={{
            marginTop: '0.2rem', padding: '0.375rem',
            background: 'var(--card-b)', border: '1px solid var(--border)',
            borderRadius: 8, cursor: 'pointer', color: 'var(--muted)',
            display: 'flex', alignItems: 'center',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
          aria-label={t('back')}
        >
          <ArrowLeft size={17} />
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>{asset.name}</h1>
            <span style={{
              fontSize: '0.7rem', fontFamily: 'monospace', fontWeight: 700,
              background: 'var(--primary-c)', color: 'var(--primary)',
              padding: '0.15rem 0.5rem', borderRadius: 9999,
              border: '1px solid var(--primary)30',
              letterSpacing: '0.06em',
            }}>
              {asset.code}
            </span>
            <FmBadge variant={conditionVariant(asset.condition)}>
              {t(`asset.condition.${asset.condition}` as Parameters<typeof t>[0])}
            </FmBadge>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
            {asset.category.replace(/_/g, ' ')}
            {asset.fm_properties && (
              <> · <Link href={`/dashboard/fm/properties/${asset.fm_properties.id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
                {asset.fm_properties.name}
              </Link></>
            )}
          </p>
        </div>

        <FmButton
          icon={<Pencil size={14} />}
          variant="secondary"
          size="sm"
          onClick={() => setShowEdit(true)}
        >
          {t('edit')}
        </FmButton>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        <Tab id="overview" active={tab === 'overview'} label="Overview"           icon={<Wrench size={13} />}        onClick={() => setTab('overview')} />
        {asset.mobility === 'MOBILE' && (
          <Tab id="custody" active={tab === 'custody'} label="Chain of Custody"   icon={<QrCode size={13} />}         onClick={() => setTab('custody')} />
        )}
        <Tab id="history"  active={tab === 'history'}  label="Service History"    icon={<ClipboardCheck size={13} />} onClick={() => setTab('history')} />
        <Tab id="docs"     active={tab === 'docs'}     label="Photos & Documents" icon={<Image size={13} />}          onClick={() => setTab('docs')} />
      </div>

      {/* ─── Custody tab ──────────────────────────────────────────────────── */}
      {tab === 'custody' && (
        <AssetCustodyTab
          assetId={id}
          propertyId={asset.property_id ?? asset.fm_properties?.id ?? null}
          mobility={asset.mobility ?? 'FIXED'}
          canManage={canManageCustody}
          onChanged={load}
        />
      )}

      {/* ─── Overview tab ─────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Specs grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <SpecTile label={t('asset.form.category')}  value={asset.category.replace(/_/g, ' ')} icon={<Tag size={12} />} />
            <SpecTile label={t('asset.form.condition')} value={<FmBadge variant={conditionVariant(asset.condition)}>{t(`asset.condition.${asset.condition}` as Parameters<typeof t>[0])}</FmBadge>} />
            {asset.location && <SpecTile label={t('asset.form.location')} value={asset.location} icon={<MapPin size={12} />} />}
            {asset.fm_properties && (
              <SpecTile
                label={t('asset.form.property')}
                icon={<Building2 size={12} />}
                value={
                  <Link href={`/dashboard/fm/properties/${asset.fm_properties.id}`}
                    style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                    {asset.fm_properties.name}
                  </Link>
                }
              />
            )}
            {asset.serial_number && <SpecTile label={t('asset.form.serial')} value={<span style={{ fontFamily: 'monospace' }}>{asset.serial_number}</span>} />}
            {asset.last_inspection && (
              <SpecTile label="Last Inspection" value={new Date(asset.last_inspection).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} />
            )}
          </div>

          {/* QR Code */}
          <FmCard>
            <FmSectionLabel>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <QrCode size={13} style={{ color: 'var(--primary)' }} />
                Asset QR Code
              </span>
            </FmSectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', paddingTop: '0.5rem' }}>
              <div style={{
                padding: '1rem',
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid var(--border)',
                display: 'inline-flex',
              }}>
                <QRCodeSVG
                  value={qrValue}
                  size={140}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textAlign: 'center', maxWidth: 260 }}>
                Scan to open this asset record directly on any device
              </p>
              <p style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'var(--faint)' }}>
                {asset.code}
              </p>
            </div>
          </FmCard>
        </div>
      )}

      {/* ─── Service History tab ───────────────────────────────────────────── */}
      {tab === 'history' && (
        <FmCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <FmSectionLabel>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ClipboardCheck size={13} style={{ color: 'var(--primary)' }} />
                {inspections.length} {inspections.length !== 1 ? 'inspections' : 'inspection'}
              </span>
            </FmSectionLabel>
            <FmButton
              icon={<Plus size={14} />}
              size="sm"
              onClick={() => router.push(`/dashboard/fm/inspections/new?asset=${id}`)}
            >
              {t('insp.fm.start')}
            </FmButton>
          </div>

          {inspections.length === 0 ? (
            <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
              <ClipboardCheck size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
              {t('prop.detail.inspEmpty')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>{t('insp.fm.col.status')}</th>
                    <th>{t('insp.fm.col.score')}</th>
                    <th>{t('asset.col.property')}</th>
                    <th>{t('insp.fm.col.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {inspections.map((insp) => (
                    <tr
                      key={insp.id}
                      onClick={() => router.push(`/dashboard/fm/inspections/${insp.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
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
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                          {insp.fm_properties?.name ?? '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                          {new Date(insp.completed_at ?? insp.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FmCard>
      )}

      {/* ─── Photos & Docs tab ────────────────────────────────────────────── */}
      {tab === 'docs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Upload area */}
          <FmCard>
            <FmSectionLabel>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Upload size={13} style={{ color: 'var(--primary)' }} />
                Upload File
              </span>
            </FmSectionLabel>
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '0.5rem',
              border: `2px dashed var(--border)`,
              borderRadius: 10, padding: '2rem 1rem',
              cursor: uploading ? 'wait' : 'pointer',
              transition: 'border-color 0.15s ease',
              marginTop: '0.75rem',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              {uploading ? (
                <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
              ) : (
                <Upload size={22} style={{ color: 'var(--muted)' }} />
              )}
              <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontWeight: 600 }}>
                {uploading ? t('saving') : 'Click to select a file'}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--faint)' }}>
                Photos, PDFs and documents up to 10 MB
              </span>
              <input type="file" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
            </label>
            {uploadError && (
              <p style={{ fontSize: '0.8rem', color: 'var(--red)', marginTop: '0.5rem' }}>{uploadError}</p>
            )}
          </FmCard>

          {/* Attachment grid */}
          {attachments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
              <FileText size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
              No attachments yet
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
              {attachments.map((att) => (
                <div key={att.id} style={{
                  background: 'var(--card-b)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '0.875rem',
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                }}>
                  {/* Icon / thumbnail */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}>
                    {isImage(att.mime_type) && att.signed_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={att.signed_url} alt={att.filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <FileText size={18} style={{ color: 'var(--muted)' }} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {att.filename}
                    </p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: 0 }}>
                      {fileSize(att.file_size)} · {new Date(att.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                    {att.signed_url && (
                      <a
                        href={att.signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '0.375rem', borderRadius: 6,
                          color: 'var(--muted)', display: 'flex',
                          transition: 'color 0.15s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
                        aria-label="Download"
                      >
                        <Download size={15} />
                      </a>
                    )}
                    <button
                      onClick={() => handleDeleteAttachment(att.id)}
                      style={{
                        padding: '0.375rem', borderRadius: 6, background: 'none', border: 'none',
                        cursor: 'pointer', color: 'var(--muted)', display: 'flex',
                        transition: 'color 0.15s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
                      aria-label={t('delete')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Edit Asset Modal ── */}
      <FmModal
        open={showEdit}
        onClose={() => { setShowEdit(false); setEditError(null) }}
        title={t('asset.form.editTitle')}
        subtitle="Update asset specifications"
      >
        <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {editError && (
            <div style={{ background: 'var(--red-c)', border: '1px solid var(--red)', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.8rem', color: 'var(--red)' }}>
              {editError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {/* Name */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                {t('asset.form.name')} <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                className="fm-input"
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Code */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                {t('asset.form.code')} <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                className="fm-input"
                style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                type="text"
                value={editForm.code}
                onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
            </div>

            {/* Serial */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                {t('asset.form.serial')} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>({t('optional')})</span>
              </label>
              <input
                className="fm-input"
                style={{ fontFamily: 'monospace' }}
                type="text"
                value={editForm.serial_number}
                onChange={(e) => setEditForm((f) => ({ ...f, serial_number: e.target.value }))}
              />
            </div>

            {/* Category */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>{t('asset.form.category')}</label>
              <select className="fm-input" value={editForm.category}
                onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                style={{ appearance: 'none' }}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>

            {/* Condition */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>{t('asset.form.condition')}</label>
              <select className="fm-input" value={editForm.condition}
                onChange={(e) => setEditForm((f) => ({ ...f, condition: e.target.value }))}
                style={{ appearance: 'none' }}>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{t(`asset.condition.${c}` as Parameters<typeof t>[0])}</option>
                ))}
              </select>
            </div>

            {/* Location */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '0.3rem' }}>
                {t('asset.form.location')} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>({t('optional')})</span>
              </label>
              <input
                className="fm-input"
                type="text"
                value={editForm.location}
                onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Room 204, 2nd floor"
              />
            </div>
          </div>

          <FmModalFooter>
            <FmButton type="button" variant="secondary" size="sm"
              onClick={() => { setShowEdit(false); setEditError(null) }}>
              {t('cancel')}
            </FmButton>
            <FmButton type="submit" size="sm" loading={editSaving}>
              {editSaving ? t('saving') : t('asset.form.saveBtn')}
            </FmButton>
          </FmModalFooter>
        </form>
      </FmModal>

    </div>
  )
}
