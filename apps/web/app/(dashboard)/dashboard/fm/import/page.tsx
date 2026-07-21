'use client'

import { useRef, useState } from 'react'
import { Upload, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { FmCard, FmButton, FmBadge, FmSectionLabel } from '@/components/fm'
import { useRole } from '@/hooks/useRole'

interface DryRun {
  dryRun: true
  stats: { sheets: number; rows: number; skipped: number }
  counts: { properties: number; spaces: number; custodians: number; assets: number; retired: number; fixed: number }
  warnings: string[]
  sampleAssets: { code: string; name: string; category: string; mobility: string; status: string }[]
}
interface ImportResult {
  ok: true
  imported: { properties: number; custodians: number; spaces: number; assets: number }
  stats: { sheets: number; rows: number; skipped: number }
  warnings: string[]
}

export default function InventoryImportPage() {
  const { role } = useRole()
  const canManage = role === 'admin' || role === 'supervisor'

  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<'preview' | 'import' | 'export' | null>(null)
  const [preview, setPreview] = useState<DryRun | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function pick(f: File | null) {
    setFile(f); setPreview(null); setResult(null); setError(null)
  }

  async function send(dryRun: boolean) {
    if (!file) return
    setBusy(dryRun ? 'preview' : 'import'); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/fm/import/inventory${dryRun ? '?dryRun=true' : ''}`, { method: 'POST', body: fd })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Import failed')
      if (dryRun) { setPreview(body as DryRun); setResult(null) }
      else { setResult(body as ImportResult); setPreview(null) }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setBusy(null) }
  }

  async function exportXlsx() {
    setBusy('export'); setError(null)
    try {
      const res = await fetch('/api/fm/export/inventory')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sims-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setBusy(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Import / Export Inventory</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
          Load the municipal Inventario spreadsheet into SIMS, or export the current inventory back to Excel.
        </p>
      </div>

      {/* Export */}
      <FmCard style={{ padding: '1.25rem' }}>
        <FmSectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Download size={13} style={{ color: 'var(--primary)' }} />Export</span></FmSectionLabel>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.6rem 0 0.9rem' }}>
          Download all current assets as an .xlsx — corrected data round-trips back through import.
        </p>
        <FmButton size="sm" variant="secondary" icon={<Download size={14} />} loading={busy === 'export'} onClick={exportXlsx}>
          Export to Excel
        </FmButton>
      </FmCard>

      {/* Import */}
      {canManage && (
        <FmCard style={{ padding: '1.25rem' }}>
          <FmSectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Upload size={13} style={{ color: 'var(--primary)' }} />Import</span></FmSectionLabel>

          <div style={{ marginTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: '2px dashed var(--border)', borderRadius: 10, padding: '1.5rem',
                textAlign: 'center', cursor: 'pointer', color: 'var(--muted)',
              }}>
              <FileSpreadsheet size={26} style={{ margin: '0 auto 0.5rem', opacity: 0.6 }} />
              {file ? (
                <span style={{ color: 'var(--fg)', fontWeight: 600, fontSize: '0.85rem' }}>{file.name}</span>
              ) : (
                <span style={{ fontSize: '0.85rem' }}>Click to choose an .xlsx file</span>
              )}
              <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            </div>

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <FmButton size="sm" variant="secondary" disabled={!file} loading={busy === 'preview'} onClick={() => send(true)}>
                Preview
              </FmButton>
              <FmButton size="sm" disabled={!file || !preview} loading={busy === 'import'} onClick={() => send(false)}>
                Import
              </FmButton>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: 0 }}>
              Preview first to see what will be created. Import is idempotent — re-running updates existing rows (matched by asset code) rather than duplicating.
            </p>
          </div>
        </FmCard>
      )}

      {error && (
        <FmCard style={{ padding: '1rem 1.25rem', borderLeft: '3px solid var(--red)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--red)', fontSize: '0.85rem' }}>
            <AlertTriangle size={16} />{error}
          </span>
        </FmCard>
      )}

      {/* Preview summary */}
      {preview && (
        <FmCard style={{ padding: '1.25rem' }}>
          <FmSectionLabel>Preview (nothing saved yet)</FmSectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', margin: '0.9rem 0' }}>
            <Stat label="Sheets" value={preview.stats.sheets} />
            <Stat label="Rows read" value={preview.stats.rows} />
            <Stat label="Properties" value={preview.counts.properties} />
            <Stat label="Spaces" value={preview.counts.spaces} />
            <Stat label="Custodians" value={preview.counts.custodians} />
            <Stat label="Assets" value={preview.counts.assets} />
            <Stat label="Retired" value={preview.counts.retired} />
            <Stat label="Fixed" value={preview.counts.fixed} />
            <Stat label="Skipped rows" value={preview.stats.skipped} />
          </div>
          {preview.warnings.length > 0 && (
            <details style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
              <summary style={{ cursor: 'pointer' }}>{preview.warnings.length} warnings</summary>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </details>
          )}
        </FmCard>
      )}

      {/* Import result */}
      {result && (
        <FmCard style={{ padding: '1.25rem', borderLeft: '3px solid var(--teal)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--fg)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.8rem' }}>
            <CheckCircle2 size={18} style={{ color: 'var(--teal)' }} /> Import complete
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
            <Stat label="Assets" value={result.imported.assets} />
            <Stat label="Properties" value={result.imported.properties} />
            <Stat label="New spaces" value={result.imported.spaces} />
            <Stat label="New custodians" value={result.imported.custodians} />
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.9rem' }}>
            Review under <FmBadge variant="info">Assets</FmBadge> and correct mobility, categories, and custody as needed, then re-export.
          </p>
        </FmCard>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: 'var(--card-b)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem 0.9rem' }}>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--fg)' }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  )
}
