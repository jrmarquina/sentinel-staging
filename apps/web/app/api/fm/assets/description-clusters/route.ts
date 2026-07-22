import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'
import { normalizeDescriptionKey } from '@/lib/text/normalize-description'

function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

interface Variant { name: string; count: number; ids: string[] }
interface Cluster { key: string; total: number; suggested: string; variants: Variant[] }

// Groups mobile/fixed assets by a normalized description key and returns only
// clusters that contain more than one distinct raw description (i.e. real merge
// candidates). The suggested canonical name is the most common variant.
export async function GET(_req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()

    const { data, error } = await supabase
      .from('fm_assets')
      .select('id, name')
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .limit(20000)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = (data ?? []) as { id: string; name: string }[]

    // key → (rawName → {count, ids})
    const byKey = new Map<string, Map<string, { count: number; ids: string[] }>>()
    for (const r of rows) {
      const name = r.name ?? ''
      const key = normalizeDescriptionKey(name)
      if (!key) continue
      if (!byKey.has(key)) byKey.set(key, new Map())
      const variants = byKey.get(key)!
      if (!variants.has(name)) variants.set(name, { count: 0, ids: [] })
      const v = variants.get(name)!
      v.count++
      v.ids.push(r.id)
    }

    const clusters: Cluster[] = []
    for (const [key, variants] of byKey) {
      if (variants.size < 2) continue // only surface real duplicates
      const variantList: Variant[] = Array.from(variants.entries())
        .map(([name, v]) => ({ name, count: v.count, ids: v.ids }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      clusters.push({
        key,
        total: variantList.reduce((s, v) => s + v.count, 0),
        suggested: variantList[0].name,
        variants: variantList,
      })
    }
    // biggest clusters first
    clusters.sort((a, b) => b.total - a.total || b.variants.length - a.variants.length)

    return NextResponse.json({
      clusterCount: clusters.length,
      assetsAffected: clusters.reduce((s, c) => s + c.total, 0),
      clusters,
    })
  } catch (e) { return caught(e) }
}
