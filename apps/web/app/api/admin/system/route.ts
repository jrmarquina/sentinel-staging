import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/get-session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ── Netdata helpers ────────────────────────────────────────────────────────

const NETDATA = 'http://127.0.0.1:19998/api/v1'

async function netdataChart(chart: string): Promise<number[][]> {
  const url = `${NETDATA}/data?chart=${chart}&after=-60&points=1&group=average&format=json`
  const r = await fetch(url, { next: { revalidate: 0 } })
  if (!r.ok) throw new Error(`Netdata ${chart}: ${r.status}`)
  const d = await r.json()
  return d.data ?? []
}

async function netdataInfo(): Promise<Record<string, unknown>> {
  const r = await fetch(`${NETDATA}/info`, { next: { revalidate: 0 } })
  if (!r.ok) throw new Error(`Netdata info: ${r.status}`)
  return r.json()
}

async function getVpsMetrics() {
  try {
    const [cpuData, ramData, diskData, loadData, info] = await Promise.all([
      netdataChart('system.cpu'),
      netdataChart('system.ram'),
      netdataChart('disk_space._'),
      netdataChart('system.load'),
      netdataInfo(),
    ])

    // CPU: values are percentages, first row is the data point
    const cpuRow   = cpuData[0] ?? []
    const cpuUsed  = cpuRow.slice(1).reduce((s: number, v: number) => s + (v || 0), 0)

    // RAM: in MiB — dimensions: free, used, cached, buffers
    const ramRow    = ramData[0] ?? []
    const ramFree   = Math.abs(ramRow[1] ?? 0)
    const ramUsed   = Math.abs(ramRow[2] ?? 0)
    const ramCached = Math.abs(ramRow[3] ?? 0)
    const ramTotal  = ramFree + ramUsed + ramCached + Math.abs(ramRow[4] ?? 0)
    const ramPct    = ramTotal > 0 ? Math.round((ramUsed / ramTotal) * 100) : 0

    // Disk: avail and used in GiB
    const diskRow   = diskData[0] ?? []
    const diskAvail = Math.abs(diskRow[1] ?? 0)
    const diskUsed  = Math.abs(diskRow[2] ?? 0)
    const diskTotal = diskAvail + diskUsed
    const diskPct   = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0

    // Load avg
    const loadRow = loadData[0] ?? []
    const load1   = loadRow[1] ?? 0
    const load5   = loadRow[2] ?? 0
    const load15  = loadRow[3] ?? 0

    // Uptime from info
    const uptimeSec = (info.mirrored_hosts_status as { uptime?: number } | undefined)?.uptime
      ?? (info as { uptime_seconds?: number }).uptime_seconds
      ?? 0

    return {
      ok: true,
      cpu:  { pct: Math.round(cpuUsed) },
      ram:  { pct: ramPct, usedMiB: Math.round(ramUsed), totalMiB: Math.round(ramTotal) },
      disk: { pct: diskPct, usedGiB: Math.round(diskUsed / 1024), totalGiB: Math.round(diskTotal / 1024) },
      load: { load1: +load1.toFixed(2), load5: +load5.toFixed(2), load15: +load15.toFixed(2) },
      uptimeSec,
      netdataVersion: (info as { version?: string }).version ?? '',
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Netdata unavailable' }
  }
}

// ── Production version ─────────────────────────────────────────────────────

async function getProdVersion() {
  try {
    const r = await fetch('https://sims.sentinelmgpr.com/api/health', {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return { ok: false, version: null }
    const d = await r.json()
    return { ok: true, version: d.version ?? null, status: d.status }
  } catch {
    return { ok: false, version: null }
  }
}

// ── GitHub releases ────────────────────────────────────────────────────────

export interface GithubRelease {
  id:          number
  tag:         string
  name:        string
  body:        string
  publishedAt: string
  url:         string
  prerelease:  boolean
}

async function getChangelog(): Promise<{ ok: boolean; releases: GithubRelease[]; error?: string }> {
  const token = process.env.GITHUB_TOKEN
  const repo  = process.env.GITHUB_REPO ?? 'jrmarquina/sentinel-staging'
  if (!token) return { ok: false, releases: [], error: 'GITHUB_TOKEN not configured' }

  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=20`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      next: { revalidate: 0 },
    })
    if (!r.ok) return { ok: false, releases: [], error: `GitHub API ${r.status}` }
    const data = await r.json()
    const releases: GithubRelease[] = data.map((d: Record<string, unknown>) => ({
      id:          d.id,
      tag:         d.tag_name,
      name:        d.name || d.tag_name,
      body:        d.body ?? '',
      publishedAt: d.published_at,
      url:         d.html_url,
      prerelease:  d.prerelease,
    }))
    return { ok: true, releases }
  } catch (e) {
    return { ok: false, releases: [], error: e instanceof Error ? e.message : 'Unknown' }
  }
}

// ── UptimeRobot ────────────────────────────────────────────────────────────

export interface UptimeMonitor {
  id:           number
  name:         string
  url:          string
  status:       number  // 0=paused,1=not checked,2=up,8=seems down,9=down
  uptimeRatio:  string
  responseMsAvg: number
}

async function getUptimeRobot(): Promise<{ ok: boolean; monitors: UptimeMonitor[]; error?: string }> {
  const key = process.env.UPTIMEROBOT_API_KEY
  if (!key) return { ok: false, monitors: [], error: 'UPTIMEROBOT_API_KEY not configured' }

  try {
    const r = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        api_key:             key,
        format:              'json',
        custom_uptime_ratios:'7-30-90',
        response_times:      '1',
        response_times_limit:'1',
      }),
      next: { revalidate: 0 },
    })
    if (!r.ok) return { ok: false, monitors: [], error: `UptimeRobot ${r.status}` }
    const d = await r.json()
    if (d.stat !== 'ok') return { ok: false, monitors: [], error: d.error?.message ?? 'API error' }
    const monitors: UptimeMonitor[] = (d.monitors ?? []).map((m: Record<string, unknown>) => ({
      id:            m.id,
      name:          m.friendly_name,
      url:           m.url,
      status:        m.status,
      uptimeRatio:   (m.custom_uptime_ratio as string)?.split('-')[0] ?? '—',
      responseMsAvg: (m.response_times as { value?: number }[])?.[0]?.value ?? 0,
    }))
    return { ok: true, monitors }
  } catch (e) {
    return { ok: false, monitors: [], error: e instanceof Error ? e.message : 'Unknown' }
  }
}

// ── Cloudflare ─────────────────────────────────────────────────────────────

export interface CloudflareStats {
  requests:    number
  bandwidth:   number  // bytes
  threats:     number
  cachedPct:   number
  period:      string
}

async function getCloudflare(): Promise<{ ok: boolean; stats: CloudflareStats | null; error?: string }> {
  const token  = process.env.CLOUDFLARE_API_TOKEN
  const zoneId = process.env.CLOUDFLARE_ZONE_ID
  if (!token || !zoneId) return { ok: false, stats: null, error: 'CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not configured' }

  try {
    // Last 7 days via GraphQL analytics API
    const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)
    const until = new Date().toISOString().slice(0, 10)
    const query = `{
      viewer {
        zones(filter: { zoneTag: "${zoneId}" }) {
          httpRequests1dGroups(limit: 7, filter: { date_geq: "${since}", date_leq: "${until}" }) {
            sum { requests cachedRequests bytes threats }
          }
        }
      }
    }`
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      next: { revalidate: 0 },
    })
    if (!r.ok) return { ok: false, stats: null, error: `Cloudflare ${r.status}` }
    const d = await r.json()
    const groups = d.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? []
    const totals = groups.reduce(
      (acc: Record<string, number>, g: { sum: Record<string, number> }) => {
        acc.requests       += g.sum.requests       ?? 0
        acc.cachedRequests += g.sum.cachedRequests  ?? 0
        acc.bytes          += g.sum.bytes           ?? 0
        acc.threats        += g.sum.threats         ?? 0
        return acc
      },
      { requests: 0, cachedRequests: 0, bytes: 0, threats: 0 }
    )
    const cachedPct = totals.requests > 0
      ? Math.round((totals.cachedRequests / totals.requests) * 100)
      : 0
    return {
      ok: true,
      stats: {
        requests:  totals.requests,
        bandwidth: totals.bytes,
        threats:   totals.threats,
        cachedPct,
        period:    'last 7 days',
      },
    }
  } catch (e) {
    return { ok: false, stats: null, error: e instanceof Error ? e.message : 'Unknown' }
  }
}

// ── Resend ─────────────────────────────────────────────────────────────────

export interface ResendStats {
  sent:      number
  delivered: number
  bounced:   number
  period:    string
}

async function getResend(): Promise<{ ok: boolean; stats: ResendStats | null; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, stats: null, error: 'RESEND_API_KEY not configured' }

  try {
    const r = await fetch('https://api.resend.com/emails?limit=100', {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: 0 },
    })
    if (!r.ok) return { ok: false, stats: null, error: `Resend ${r.status}` }
    const d = await r.json()
    const emails = (d.data ?? []) as { last_event: string }[]
    const sent      = emails.length
    const delivered = emails.filter(e => ['delivered', 'opened', 'clicked'].includes(e.last_event)).length
    const bounced   = emails.filter(e => ['bounced', 'complained'].includes(e.last_event)).length
    return { ok: true, stats: { sent, delivered, bounced, period: 'last 100 emails' } }
  } catch (e) {
    return { ok: false, stats: null, error: e instanceof Error ? e.message : 'Unknown' }
  }
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const stagingVersion = process.env.npm_package_version ?? '1.1.0'

    const [vps, prodVersion, changelog, uptime, cloudflare, resend] = await Promise.allSettled([
      getVpsMetrics(),
      getProdVersion(),
      getChangelog(),
      getUptimeRobot(),
      getCloudflare(),
      getResend(),
    ])

    return NextResponse.json({
      stagingVersion,
      vps:        vps.status        === 'fulfilled' ? vps.value        : { ok: false, error: 'fetch failed' },
      prod:       prodVersion.status === 'fulfilled' ? prodVersion.value : { ok: false, version: null },
      changelog:  changelog.status  === 'fulfilled' ? changelog.value  : { ok: false, releases: [] },
      uptime:     uptime.status     === 'fulfilled' ? uptime.value     : { ok: false, monitors: [] },
      cloudflare: cloudflare.status === 'fulfilled' ? cloudflare.value : { ok: false, stats: null },
      resend:     resend.status     === 'fulfilled' ? resend.value     : { ok: false, stats: null },
    })
  } catch (err) {
    console.error('System status error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
