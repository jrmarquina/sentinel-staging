'use client'

/**
 * PropertyGallery
 * ──────────────────────────────────────────────────────────────────────────
 * Tab body for the "Galería" / "Gallery" section on the property detail page.
 *
 *   - Lists fm_attachments scoped to a property.
 *   - Upload accepts: images (jpg/png/webp/heic/gif), PDF, Word, Excel,
 *     PowerPoint, plain text, CSV. Limit 20 MB.
 *   - Click a tile → AttachmentViewer modal:
 *       images: zoomable, full-screen capable
 *       PDF:    iframe with browser-native PDF viewer (multi-page, zoom)
 *       office: Office Online viewer iframe (read-only preview)
 *       other:  fallback open/download buttons
 *   - All viewers expose download + open-in-new-tab + full-screen.
 */

import { useEffect, useState, useCallback, useRef, memo } from 'react'
import {
  Upload, Trash2, X, ZoomIn, ZoomOut, Maximize2, Minimize2,
  Download, ExternalLink, ChevronLeft, ChevronRight,
  FileText, FileSpreadsheet, File as FileIcon, Image as ImageIcon,
  Loader2, AlertTriangle,
} from 'lucide-react'
import { useFmT } from '@/lib/locale'

// ── Types ──────────────────────────────────────────────────────────────────

export interface GalleryItem {
  id:         string
  name:       string
  type:       string   // mime
  file_key:   string
  url:        string
  created_at: string
}

interface Props {
  propertyId: string
  /** Called after a successful upload or delete so the parent page can
   *  refresh its tab counts and other dependent UI. */
  onChange?: () => void
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isImage(mime: string)  { return mime.startsWith('image/') }
function isPdf(mime: string)    { return mime === 'application/pdf' }
function isOffice(mime: string) {
  return [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ].includes(mime)
}

function fileTypeIcon(mime: string, size = 32) {
  if (isImage(mime))  return <ImageIcon size={size} />
  if (isPdf(mime))    return <FileText size={size} />
  if (mime.includes('sheet') || mime.includes('excel')) return <FileSpreadsheet size={size} />
  if (mime.includes('word'))  return <FileText size={size} />
  return <FileIcon size={size} />
}

/**
 * Office-Online viewer URL. We use the view.aspx endpoint instead of
 * embed.aspx — view.aspx renders read-only without the "Edit in Word /
 * Excel / PowerPoint" affordance that embed.aspx exposes.
 */
function officeViewerUrl(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}&wdAllowInteractivity=False&wdHideHeaders=True&wdHideGridlines=True`
}

/**
 * PDF iframe URL. The hash fragment is read by Chrome's built-in PDF
 * viewer and disables: top toolbar (download, print, save-to-Drive,
 * edit), navigation pane, and scrollbars. Multi-page nav and zoom still
 * work via pinch / Ctrl+scroll / keyboard.
 */
function pdfViewerUrl(fileUrl: string): string {
  return `${fileUrl}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&view=FitH`
}

// ── Main component ─────────────────────────────────────────────────────────

type FilterType = 'all' | 'images' | 'documents'

export default function PropertyGallery({ propertyId, onChange }: Props) {
  const t = useFmT()
  const [items, setItems]       = useState<GalleryItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filter, setFilter]     = useState<FilterType>('all')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/fm/properties/${propertyId}/attachments`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(t('gallery.error'))))
      .then((data: GalleryItem[]) => setItems(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t('gallery.error')))
      .finally(() => setLoading(false))
  }, [propertyId, t])

  useEffect(() => { load() }, [load])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/fm/properties/${propertyId}/attachments`, {
        method: 'POST', body: fd,
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? t('gallery.error'))
      }
      const created = await res.json() as GalleryItem
      setItems(prev => [created, ...prev])
      onChange?.()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('gallery.error'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('gallery.deleteConfirm'))) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/fm/properties/${propertyId}/attachments/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(t('error.generic'))
      setItems(prev => prev.filter(it => it.id !== id))
      onChange?.()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('error.generic'))
    } finally {
      setDeleting(null)
    }
  }

  const filteredItems = items.filter(it => {
    if (filter === 'images')    return isImage(it.type)
    if (filter === 'documents') return !isImage(it.type)
    return true
  })

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--fg)' }}>
          {t('gallery.title')}
          {items.length > 0 && (
            <span style={{ marginLeft: '0.5rem', color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem' }}>
              ({items.length})
            </span>
          )}
        </h3>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.5rem 0.875rem',
          background: uploading ? 'var(--card-b)' : 'var(--primary)',
          color: uploading ? 'var(--muted)' : '#fff',
          borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
          cursor: uploading ? 'not-allowed' : 'pointer',
          border: '1px solid transparent',
        }}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? t('gallery.uploading') : t('gallery.upload')}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv"
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {/* Filter pills */}
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {(['all', 'images', 'documents'] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: 9999,
                fontSize: '0.75rem', fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${filter === f ? 'var(--primary)' : 'var(--border)'}`,
                background: filter === f ? 'var(--primary-c)' : 'transparent',
                color: filter === f ? 'var(--primary)' : 'var(--muted)',
                transition: 'all 0.15s ease',
              }}
            >
              {t(`gallery.filter.${f}` as Parameters<typeof t>[0])}
              <span style={{ marginLeft: '0.35rem', opacity: 0.7 }}>
                ({f === 'all' ? items.length : f === 'images' ? items.filter(i => isImage(i.type)).length : items.filter(i => !isImage(i.type)).length})
              </span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{
          padding: '0.75rem 1rem', marginBottom: '1rem',
          background: 'rgba(220, 38, 38, 0.08)',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          borderRadius: 8, color: '#dc2626',
          fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div style={{
          padding: '3rem 1rem', textAlign: 'center',
          color: 'var(--muted)', background: 'var(--card-b)',
          border: '1px dashed var(--border)', borderRadius: 12,
          fontSize: '0.9rem',
        }}>
          {t('gallery.empty')}
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{
          padding: '3rem 1rem', textAlign: 'center',
          color: 'var(--muted)', background: 'var(--card-b)',
          border: '1px dashed var(--border)', borderRadius: 12,
          fontSize: '0.9rem',
        }}>
          No {filter === 'images' ? 'images' : 'documents'} uploaded yet.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '0.875rem',
        }}>
          {filteredItems.map((it) => {
            const originalIdx = items.indexOf(it)
            return (
              <GalleryTile
                key={it.id}
                item={it}
                onClick={() => setActiveIdx(originalIdx)}
                onDelete={() => handleDelete(it.id)}
                deleting={deleting === it.id}
              />
            )
          })}
        </div>
      )}

      {activeIdx !== null && (
        <AttachmentViewer
          items={items}
          startIndex={activeIdx}
          onClose={() => setActiveIdx(null)}
        />
      )}
    </div>
  )
}

// ── PDF Thumbnail ──────────────────────────────────────────────────────────

const PdfThumbnail = memo(function PdfThumbnail({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function render() {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
        const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise
        if (cancelled) return
        const page = await pdf.getPage(1)
        if (cancelled || !canvasRef.current) return
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const vp = page.getViewport({ scale: 1 })
        const scale = Math.max(canvas.offsetWidth / vp.width, canvas.offsetHeight / vp.height) || 0.5
        const scaled = page.getViewport({ scale })
        canvas.width = scaled.width
        canvas.height = scaled.height
        await page.render({ canvasContext: ctx, canvas, viewport: scaled }).promise
        if (!cancelled) setReady(true)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    render()
    return () => { cancelled = true }
  }, [url])

  if (failed) return null

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%', height: '100%',
        objectFit: 'cover',
        opacity: ready ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    />
  )
})

// ── Tile ───────────────────────────────────────────────────────────────────

function GalleryTile({
  item, onClick, onDelete, deleting,
}: { item: GalleryItem; onClick: () => void; onDelete: () => void; deleting: boolean }) {
  const showImage = isImage(item.type)
  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--card-b)',
        border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.12)' }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
    >
      <div style={{
        aspectRatio: '4 / 3',
        background: showImage ? `url(${item.url}) center/cover no-repeat`
                              : isPdf(item.type) ? '#1a1a2e' : 'linear-gradient(145deg, #1b263b, #415a77)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', position: 'relative', overflow: 'hidden',
      }}>
        {showImage && null}
        {isPdf(item.type) && (
          <>
            <PdfThumbnail url={item.url} />
            <div style={{
              position: 'absolute', top: 6, right: 6,
              background: '#e63946', color: '#fff',
              fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.05em',
              padding: '2px 5px', borderRadius: 4,
            }}>PDF</div>
          </>
        )}
        {!showImage && !isPdf(item.type) && fileTypeIcon(item.type, 40)}
      </div>
      <div style={{ padding: '0.5rem 0.625rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: '0.78rem', color: 'var(--fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{item.name}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          disabled={deleting}
          title="Delete"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', padding: 4, display: 'flex', alignItems: 'center',
          }}
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  )
}

// ── Viewer modal ───────────────────────────────────────────────────────────

function AttachmentViewer({
  items, startIndex, onClose,
}: { items: GalleryItem[]; startIndex: number; onClose: () => void }) {
  const t = useFmT()
  const [idx, setIdx]     = useState(startIndex)
  const [zoom, setZoom]   = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  // Pan offset (in screen pixels) — only consulted when zoom > 1 on images
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const item = items[idx]

  // Reset zoom + pan whenever the active item changes
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [idx])
  // Reset pan whenever we return to 1× zoom
  useEffect(() => { if (zoom <= 1) setPan({ x: 0, y: 0 }) }, [zoom])

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIdx(i => Math.min(items.length - 1, i + 1))
      if (e.key === 'ArrowLeft')  setIdx(i => Math.max(0, i - 1))
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(5, z + 0.25))
      if (e.key === '-') setZoom(z => Math.max(0.25, z - 0.25))
      if (e.key === '0') setZoom(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items.length, onClose])

  function toggleFullscreen() {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {})
    }
  }

  if (!item) return null

  const isImg = isImage(item.type)
  const isPdfFile = isPdf(item.type)
  const isOfficeFile = isOffice(item.type)

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(8, 10, 16, 0.95)',
        display: 'flex', flexDirection: 'column',
      }}
      onClick={onClose}
    >
      {/* Header */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          color: '#fff', flexWrap: 'wrap', gap: '0.5rem',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            {idx + 1} {t('gallery.viewer.of')} {items.length}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
            {item.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {isImg && (
            <>
              <ToolBtn title={t('gallery.viewer.zoomOut')} onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}><ZoomOut size={16} /></ToolBtn>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', minWidth: 38, textAlign: 'center' }}>
                {Math.round(zoom * 100)}%
              </span>
              <ToolBtn title={t('gallery.viewer.zoomIn')} onClick={() => setZoom(z => Math.min(5, z + 0.25))}><ZoomIn size={16} /></ToolBtn>
              <span style={{ width: 12 }} />
            </>
          )}
          <ToolBtn title={t('gallery.viewer.openTab')} onClick={() => window.open(item.url, '_blank', 'noopener')}>
            <ExternalLink size={16} />
          </ToolBtn>
          <ToolBtn title={t('gallery.viewer.download')} as="a" href={item.url} download={item.name}>
            <Download size={16} />
          </ToolBtn>
          <ToolBtn title={fullscreen ? t('gallery.viewer.exitFs') : t('gallery.viewer.fullscreen')} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </ToolBtn>
          <ToolBtn title={t('gallery.viewer.close')} onClick={onClose}><X size={16} /></ToolBtn>
        </div>
      </div>

      {/* Body */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1, position: 'relative', overflow: 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        {/* Prev / Next */}
        {idx > 0 && (
          <NavBtn side="left" onClick={() => setIdx(idx - 1)} title={t('gallery.viewer.prev')}>
            <ChevronLeft size={28} />
          </NavBtn>
        )}
        {idx < items.length - 1 && (
          <NavBtn side="right" onClick={() => setIdx(idx + 1)} title={t('gallery.viewer.next')}>
            <ChevronRight size={28} />
          </NavBtn>
        )}

        {isImg ? (
          <img
            src={item.url}
            alt={item.name}
            onMouseDown={(e) => {
              if (zoom <= 1) return
              dragRef.current = {
                startX: e.clientX, startY: e.clientY,
                baseX: pan.x, baseY: pan.y,
              }
              setDragging(true)
              e.preventDefault()
            }}
            onMouseMove={(e) => {
              if (!dragRef.current) return
              const d = dragRef.current
              setPan({
                x: d.baseX + (e.clientX - d.startX),
                y: d.baseY + (e.clientY - d.startY),
              })
            }}
            onMouseUp={() => { dragRef.current = null; setDragging(false) }}
            onMouseLeave={() => { dragRef.current = null; setDragging(false) }}
            style={{
              maxWidth: '95%', maxHeight: '90%',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: dragging ? 'none' : 'transform 0.15s ease',
              userSelect: 'none',
              cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
              willChange: zoom > 1 ? 'transform' : 'auto',
            }}
            draggable={false}
          />
        ) : isPdfFile ? (
          <iframe
            src={pdfViewerUrl(item.url)}
            title={item.name}
            style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
          />
        ) : isOfficeFile ? (
          <iframe
            src={officeViewerUrl(item.url)}
            title={item.name}
            style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
          />
        ) : (
          <div style={{ color: '#fff', textAlign: 'center', padding: '2rem' }}>
            <p style={{ marginBottom: '1rem', opacity: 0.8 }}>{t('gallery.unsupported')}</p>
            <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
              <a href={item.url} target="_blank" rel="noopener noreferrer"
                 style={{ color: '#fff', padding: '0.5rem 0.875rem', background: 'rgba(255,255,255,0.1)', borderRadius: 6, textDecoration: 'none', fontSize: '0.85rem' }}>
                {t('gallery.viewer.openTab')}
              </a>
              <a href={item.url} download={item.name}
                 style={{ color: '#fff', padding: '0.5rem 0.875rem', background: 'rgba(255,255,255,0.1)', borderRadius: 6, textDecoration: 'none', fontSize: '0.85rem' }}>
                {t('gallery.viewer.download')}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Small UI helpers ───────────────────────────────────────────────────────

function ToolBtn(
  props: { children: React.ReactNode; title: string; onClick?: () => void; as?: 'a'; href?: string; download?: string }
) {
  const { children, title, onClick, as, href, download } = props
  const styles: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: 6,
    background: 'rgba(255,255,255,0.08)', border: 'none',
    color: '#fff', cursor: 'pointer', textDecoration: 'none',
  }
  if (as === 'a' && href) {
    return (
      <a href={href} download={download} title={title} target={download ? undefined : '_blank'} rel="noopener noreferrer" style={styles}>
        {children}
      </a>
    )
  }
  return (
    <button onClick={onClick} title={title} style={styles}>
      {children}
    </button>
  )
}

function NavBtn({ side, onClick, title, children }: {
  side: 'left' | 'right'; onClick: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        position: 'absolute', top: '50%', [side]: 12, transform: 'translateY(-50%)',
        width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(255,255,255,0.12)', color: '#fff',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2,
      }}
    >
      {children}
    </button>
  )
}
