'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import {
  X, RefreshCw, Server, HardDrive, Shield, Mail, GitBranch,
  CheckCircle2, AlertTriangle, Clock, ChevronDown, Wifi,
  Database, Globe, Activity, Zap, Package, ExternalLink,
  Cpu, MemoryStick, CloudUpload,
} from 'lucide-react'
import type { GithubRelease, UptimeMonitor, CloudflareStats, ResendStats } from '@/app/api/admin/system/route'
import type { BackupFile } from '@/app/api/admin/backups/route'

// ── Types ──────────────────────────────────────────────────────────────────

interface VpsMetrics {
  ok:       boolean
  error?:   string
  cpu?:     { pct: number }
  ram?:     { pct: number; usedMiB: number; totalMiB: number }
  disk?:    { pct: number; usedGiB: number; totalGiB: number }
  load?:    { load1: number; load5: number; load15: number }
  uptimeSec?: number
}

interface SystemData {
  stagingVersion: string
  vps:        VpsMetrics
  prod:       { ok: boolean; version: string | null; status?: string }
  changelog:  { ok: boolean; releases: GithubRelease[]; error?: string }
  uptime:     { ok: boolean; monitors: UptimeMonitor[]; error?: string }
  cloudflare: { ok: boolean; stats: CloudflareStats | null; error?: string }
  resend:     { ok: boolean; stats: ResendStats | null; error?: string }
}

interface BackupData {
  files:  BackupFile[]
  bucket: string
}

// ── Small helpers ──────────────────────────────────────────────────────────

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m}m`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function pctColor(pct: number, warn = 70, danger = 90): string {
  if (pct >= danger) return 'bg-red-500'
  if (pct >= warn)   return 'bg-amber-500'
  return 'bg-emerald-500'
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
}

function NotConfigured({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[100px] gap-2 text-center">
      <span className="text-xs text-slate-400">{label} not configured</span>
      <span className="text-[10px] text-slate-300 dark:text-slate-600">Add API key to .env.local</span>
    </div>
  )
}

function TileHeader({ icon, title, ok, badge }: { icon: React.ReactNode; title: string; ok?: boolean; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-slate-400">{icon}</span>
      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-1">{title}</span>
      {ok !== undefined && <StatusDot ok={ok} />}
      {badge && <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{badge}</span>}
    </div>
  )
}

function PlaceholderTile({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-2 opacity-60">
      <div className="flex items-center gap-2">
        <span className="text-slate-300 dark:text-slate-600">{icon}</span>
        <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{title}</span>
        <span className="ml-auto text-[9px] uppercase tracking-wide text-slate-300 dark:text-slate-600 font-semibold">Coming soon</span>
      </div>
      <p className="text-[10px] text-slate-300 dark:text-slate-600 leading-relaxed">{description}</p>
    </div>
  )
}

// ── Gauge / bar ────────────────────────────────────────────────────────────

function BarGauge({ label, pct, sublabel, warn, danger }: {
  label:    string
  pct:      number
  sublabel?: string
  warn?:    number
  danger?:  number
}) {
  const color = pctColor(pct, warn, danger)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {sublabel && <p className="text-[10px] text-slate-400">{sublabel}</p>}
    </div>
  )
}

// ── Tiles ──────────────────────────────────────────────────────────────────

function VpsTile({ vps }: { vps: VpsMetrics }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <TileHeader icon={<Server size={14} />} title="VPS Health" ok={vps.ok} badge="Contabo" />
      {!vps.ok ? (
        <p className="text-xs text-red-500">{vps.error}</p>
      ) : (
        <div className="space-y-3">
          <BarGauge
            label="CPU"
            pct={vps.cpu?.pct ?? 0}
            sublabel={`Load avg: ${vps.load?.load1} / ${vps.load?.load5} / ${vps.load?.load15}`}
          />
          <BarGauge
            label="RAM"
            pct={vps.ram?.pct ?? 0}
            sublabel={`${vps.ram?.usedMiB ?? 0} MiB / ${vps.ram?.totalMiB ?? 0} MiB`}
            warn={75} danger={90}
          />
          <BarGauge
            label="Disk"
            pct={vps.disk?.pct ?? 0}
            sublabel={`${vps.disk?.usedGiB ?? 0} GB / ${vps.disk?.totalGiB ?? 0} GB`}
            warn={75} danger={90}
          />
          {(vps.uptimeSec ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
              <Clock size={10} className="text-slate-400" />
              <span className="text-[10px] text-slate-400">Uptime: {formatUptime(vps.uptimeSec!)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function UptimeTile({ uptime }: { uptime: { ok: boolean; monitors: UptimeMonitor[]; error?: string } }) {
  const statusLabel: Record<number, string> = { 0: 'Paused', 1: 'Pending', 2: 'Up', 8: 'Seems down', 9: 'Down' }
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <TileHeader icon={<Activity size={14} />} title="Uptime" ok={uptime.ok} badge="UptimeRobot" />
      {!uptime.ok ? (
        <NotConfigured label="UptimeRobot" />
      ) : uptime.monitors.length === 0 ? (
        <p className="text-xs text-slate-400">No monitors found.</p>
      ) : (
        <div className="space-y-2">
          {uptime.monitors.map(m => (
            <div key={m.id} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.status === 2 ? 'bg-emerald-500' : m.status === 0 ? 'bg-slate-400' : 'bg-red-500'}`} />
              <span className="text-[11px] text-slate-700 dark:text-slate-300 flex-1 truncate">{m.name}</span>
              <span className="text-[10px] text-slate-400 tabular-nums">{m.uptimeRatio}%</span>
              <span className="text-[10px] text-slate-300 dark:text-slate-600 hidden sm:block">{statusLabel[m.status] ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CloudflareTile({ cf }: { cf: { ok: boolean; stats: CloudflareStats | null; error?: string } }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <TileHeader icon={<Globe size={14} />} title="Cloudflare" ok={cf.ok} badge={cf.stats?.period} />
      {!cf.ok ? (
        <NotConfigured label="Cloudflare" />
      ) : cf.stats ? (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Requests',  value: cf.stats.requests.toLocaleString() },
            { label: 'Bandwidth', value: formatBytes(cf.stats.bandwidth) },
            { label: 'Threats',   value: cf.stats.threats.toLocaleString() },
            { label: 'Cache hit', value: `${cf.stats.cachedPct}%` },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className="text-sm font-bold text-slate-800 dark:text-white tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ResendTile({ resend }: { resend: { ok: boolean; stats: ResendStats | null; error?: string } }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <TileHeader icon={<Mail size={14} />} title="Email (Resend)" ok={resend.ok} badge={resend.stats?.period} />
      {!resend.ok ? (
        <NotConfigured label="Resend" />
      ) : resend.stats ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Sent',      value: resend.stats.sent,      color: 'text-slate-800 dark:text-white' },
            { label: 'Delivered', value: resend.stats.delivered, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Bounced',   value: resend.stats.bounced,   color: 'text-red-500' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className={`text-lg font-black tabular-nums ${color}`}>{value}</p>
              <p className="text-[10px] text-slate-400">{label}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function BackupsTile({ backups }: { backups: BackupFile[] }) {
  const recent = backups.slice(0, 6)
  const lastProd    = backups.find(f => f.env === 'prod')
  const lastStaging = backups.find(f => f.env === 'staging')
  const ageHours = (f: BackupFile | undefined) =>
    f ? (Date.now() - parseISO(f.date).getTime()) / 3_600_000 : null

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <TileHeader icon={<HardDrive size={14} />} title="Backups" ok={true} badge="Backblaze B2" />

      {/* Last backup summary */}
      <div className="flex gap-3 mb-3">
        {[{ label: 'Prod', f: lastProd }, { label: 'Staging', f: lastStaging }].map(({ label, f }) => {
          const h = ageHours(f)
          const ok = h !== null && h < 25
          return (
            <div key={label} className="flex-1 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 text-center">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className={`text-xs font-semibold mt-0.5 ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {f ? formatDistanceToNow(parseISO(f.date), { addSuffix: true }) : '—'}
              </p>
            </div>
          )
        })}
      </div>

      {/* Recent files */}
      <div className="space-y-1">
        {recent.map(f => (
          <div key={`${f.env}-${f.name}`} className="flex items-center gap-2 text-[10px]">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${f.env === 'prod' ? 'bg-blue-400' : 'bg-amber-400'}`} />
            <span className="text-slate-500 dark:text-slate-400 flex-1 tabular-nums">
              {format(parseISO(f.date), 'MMM d HH:mm')}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${f.env === 'prod' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300'}`}>
              {f.env}
            </span>
            <span className="text-slate-400 tabular-nums">{formatFileSize(f.size)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChangelogTile({ changelog }: { changelog: { ok: boolean; releases: GithubRelease[]; error?: string } }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([changelog.releases[0]?.id]))

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <TileHeader icon={<GitBranch size={14} />} title="Version History" badge="GitHub Releases" />
      {!changelog.ok ? (
        <NotConfigured label="GitHub (GITHUB_TOKEN)" />
      ) : changelog.releases.length === 0 ? (
        <p className="text-xs text-slate-400">No releases found. Tag a release on GitHub to start tracking versions.</p>
      ) : (
        <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
          {changelog.releases.map(r => (
            <div key={r.id} className="border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggle(r.id)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left"
              >
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${r.prerelease ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                  {r.tag}
                </span>
                <span className="text-[11px] text-slate-700 dark:text-slate-300 flex-1 truncate">{r.name}</span>
                <span className="text-[10px] text-slate-400 flex-shrink-0">{format(parseISO(r.publishedAt), 'MMM d, yyyy')}</span>
                <ChevronDown size={11} className={`text-slate-400 transition-transform flex-shrink-0 ${expanded.has(r.id) ? 'rotate-180' : ''}`} />
              </button>
              {expanded.has(r.id) && r.body && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <pre className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-pre-wrap font-sans leading-relaxed">
                    {r.body}
                  </pre>
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-[10px] text-blue-500 hover:text-blue-700">
                    <ExternalLink size={9} /> View on GitHub
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Version header ─────────────────────────────────────────────────────────

function VersionHeader({
  stagingVersion,
  prod,
}: {
  stagingVersion: string
  prod: { ok: boolean; version: string | null; status?: string }
}) {
  const same = prod.version === stagingVersion
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-lg px-3 py-1.5">
        <StatusDot ok={true} />
        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">Staging</span>
        <span className="text-sm font-black text-amber-900 dark:text-amber-100">v{stagingVersion}</span>
      </div>
      <div className="text-slate-300 dark:text-slate-600 text-xs">→</div>
      <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 border ${prod.ok ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
        <StatusDot ok={prod.ok} />
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${prod.ok ? 'text-blue-700 dark:text-blue-300' : 'text-slate-400'}`}>Production</span>
        <span className={`text-sm font-black ${prod.ok ? 'text-blue-900 dark:text-blue-100' : 'text-slate-400'}`}>
          {prod.version ? `v${prod.version}` : '—'}
        </span>
      </div>
      {same && prod.ok && (
        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 size={11} /> Environments in sync
        </span>
      )}
      {!same && prod.version && (
        <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle size={11} /> Staging ahead of production
        </span>
      )}
    </div>
  )
}

// ── Main overlay ───────────────────────────────────────────────────────────

export function SystemHealthOverlay({ onClose }: { onClose: () => void }) {
  const [data,    setData]    = useState<SystemData | null>(null)
  const [backups, setBackups] = useState<BackupData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sysRes, bkRes] = await Promise.allSettled([
        fetch('/api/admin/system').then(r => r.json()),
        fetch('/api/admin/backups').then(r => r.json()),
      ])
      if (sysRes.status === 'fulfilled') setData(sysRes.value)
      if (bkRes.status === 'fulfilled')  setBackups(bkRes.value)
      setLastFetched(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    // Prevent body scroll while overlay is open
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [fetchAll])

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center gap-4 px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-blue-500" />
          <h1 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">System Health</h1>
        </div>

        <div className="flex-1">
          {data && (
            <VersionHeader stagingVersion={data.stagingVersion} prod={data.prod} />
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {lastFetched && (
            <span className="text-[10px] text-slate-400 hidden sm:block">
              Updated {format(lastFetched, 'HH:mm:ss')}
            </span>
          )}
          <button
            onClick={fetchAll}
            disabled={loading}
            className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && !data ? (
          <div className="flex items-center justify-center h-64 gap-3 text-slate-400">
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm">Loading system data…</span>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Main grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {data && <VpsTile vps={data.vps} />}
              {data && <UptimeTile uptime={data.uptime} />}
              {data && <CloudflareTile cf={data.cloudflare} />}
              {data && <ResendTile resend={data.resend} />}
            </div>

            {/* Backups + changelog row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {backups && <BackupsTile backups={backups.files} />}
              {data    && <ChangelogTile changelog={data.changelog} />}
            </div>

            {/* Placeholder tiles for future integrations */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Planned integrations</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <PlaceholderTile
                  icon={<Package size={13} />}
                  title="GitHub CI/CD"
                  description="Workflow run status, deploy history, open PRs"
                />
                <PlaceholderTile
                  icon={<Wifi size={13} />}
                  title="Novu Notifications"
                  description="Delivery rates by channel — email, SMS, WhatsApp"
                />
                <PlaceholderTile
                  icon={<Database size={13} />}
                  title="Supabase Analytics"
                  description="DB connections, query perf, storage used per bucket"
                />
                <PlaceholderTile
                  icon={<CloudUpload size={13} />}
                  title="SAP / ERP"
                  description="Sync status once ERP integration is live"
                />
                <PlaceholderTile
                  icon={<Globe size={13} />}
                  title="Citizen Portal"
                  description="Service request volume and resolution times"
                />
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
