'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertTriangle, Sparkles, Check, CheckCircle2 } from 'lucide-react'
import { FmCard, FmButton, FmBadge, FmInput, FmSectionLabel } from '@/components/fm'
import { useRole } from '@/hooks/useRole'

interface Variant { name: string; count: number; ids: string[] }
interface Cluster { key: string; total: number; suggested: string; variants: Variant[] }

export default function NormalizeDescriptionsPage() {
  const { role } = useRole()
  const canManage = role === 'admin' || role === 'supervisor'

  const [clusters, setClusters] = useState<Cluster[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canonical, setCanonical] = useState<Record<string, string>>({})
  const [applying, setApplying] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, number>>({})

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/fm/assets/description-clusters')
      .then((r) => { if (!r.ok) throw new Error('Failed to load clusters'); return r.json() as Promise<{ clusters: Cluster[] }> })
      .then((d) => {
        const cs = Array.isArray(d.clusters) ? d.clusters : []
        setClusters(cs)
        setCanonical(Object.fromEntries(cs.map((c) => [c.key, c.suggested])))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function applyCluster(c: Cluster) {
    const name = (canonical[c.key] ?? '').trim()
    if (!name) return
    setApplying(c.key)
    try {
      const ids = c.variants.flatMap((v) => v.ids)
      const res = await fetch('/api/fm/assets/bulk', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, patch: { name } }),
      })
      const body = await res.json() as { error?: string; updated?: number }
      if (!res.ok) throw new Error(body.error ?? 'Update failed')
      setDone((p) => ({ ...p, [c.key]: body.updated ?? ids.length }))
      setClusters((prev) => prev.filter((x) => x.key !== c.key))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setApplying(null) }
  }

  const doneCount = Object.values(done).reduce((s, n) => s + n, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <Link href="/dashboard/fm/assets" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--muted)', textDecoration: 'none' }}>
          <ArrowLeft size={14} /> Back to assets
        </Link>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--fg)', margin: '0.5rem 0 0' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} style={{ color: 'var(--primary)' }} /> Merge duplicate descriptions
          </span>
        </h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.3rem', maxWidth: 640 }}>
          Assets whose descriptions differ only by spelling, word order, filler words, or singular/plural
          are grouped below. Pick one canonical name per group and apply it. Genuinely different items
          (e.g. “plástico” vs not) stay in separate groups. For stragglers a group misses, use
          multi-select on the assets list.
        </p>
      </div>

      {doneCount > 0 && (
        <FmCard style={{ padding: '0.75rem 1.1rem', borderLeft: '3px solid var(--teal)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--fg)', fontSize: '0.82rem' }}>
            <CheckCircle2 size={16} style={{ color: 'var(--teal)' }} /> Renamed {doneCount} assets across {Object.keys(done).length} groups.
          </span>
        </FmCard>
      )}

      {!canManage ? (
        <FmCard><div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
          You need supervisor access to merge descriptions.
        </div></FmCard>
      ) : loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} /></div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--red)' }}><AlertTriangle size={26} style={{ margin: '0 auto 0.6rem' }} /><p style={{ fontSize: '0.85rem' }}>{error}</p></div>
      ) : clusters.length === 0 ? (
        <FmCard><div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
          <Check size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
          No duplicate description groups found.
        </div></FmCard>
      ) : (
        <>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0 }}>{clusters.length} groups to review</p>
          {clusters.map((c) => (
            <FmCard key={c.key} style={{ padding: '1rem 1.25rem' }}>
              <FmSectionLabel>{c.total} assets · {c.variants.length} spellings</FmSectionLabel>
              <div style={{ margin: '0.7rem 0', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {c.variants.map((v) => (
                  <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                    <FmBadge variant="neutral">{v.count}</FmBadge>
                    <button
                      onClick={() => setCanonical((p) => ({ ...p, [c.key]: v.name }))}
                      title="Use this spelling"
                      style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--fg)', padding: 0 }}>
                      {v.name}
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <FmInput label="Canonical name (applied to all)" value={canonical[c.key] ?? ''}
                    onChange={(e) => setCanonical((p) => ({ ...p, [c.key]: e.target.value }))} />
                </div>
                <FmButton size="sm" loading={applying === c.key} onClick={() => applyCluster(c)}>
                  Apply to {c.total}
                </FmButton>
              </div>
            </FmCard>
          ))}
        </>
      )}
    </div>
  )
}
