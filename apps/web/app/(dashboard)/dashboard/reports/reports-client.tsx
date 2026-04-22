'use client'

import Link from 'next/link'
import { TrendingUp, AlertTriangle, DollarSign, CheckCircle, Clock, Wrench, FileText } from 'lucide-react'

export interface ReportsData {
  totalWoCost:          number
  completionRate:       number
  activeWOs:            number
  overdueCount:         number
  openPotholes:         number
  avgResolutionDays:    number | null
  activeContractValue:  number
  woStatusCounts:       Record<string, number>
  costByProject:        Array<{ number: string; name: string; total_cost: number; wo_count: number }>
  woMonthlyTrend:       Array<{ month: string; created: number; closed: number }>
  potholeResolution:    Array<{ severity: string; total: number; resolved: number; avg_days: number | null }>
  inspectorPerf:        Array<{ inspector_name: string; total: number; completed: number; completion_rate: number; avg_score: number | null }>
}

const STATUS_COLOR: Record<string, string> = {
  open:        'bg-blue-500',
  in_progress: 'bg-amber-500',
  on_hold:     'bg-orange-400',
  closed:      'bg-green-500',
  cancelled:   'bg-red-400',
  draft:       'bg-slate-400',
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-yellow-500',
  low:      'bg-slate-400',
}

const SEVERITY_TEXT: Record<string, string> = {
  critical: 'text-red-600 dark:text-red-400',
  high:     'text-orange-600 dark:text-orange-400',
  medium:   'text-yellow-600 dark:text-yellow-500',
  low:      'text-slate-500',
}

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`
}

// Simple vertical bar chart in pure CSS
function BarChart({ data }: { data: Array<{ label: string; a: number; b: number }> }) {
  const max = Math.max(...data.flatMap((d) => [d.a, d.b]), 1)
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end gap-0.5 h-24">
            <div
              className="flex-1 bg-blue-500 rounded-t transition-all"
              style={{ height: `${Math.max((d.a / max) * 100, d.a > 0 ? 4 : 0)}%` }}
              title={`Created: ${d.a}`}
            />
            <div
              className="flex-1 bg-green-500 rounded-t transition-all"
              style={{ height: `${Math.max((d.b / max) * 100, d.b > 0 ? 4 : 0)}%` }}
              title={`Closed: ${d.b}`}
            />
          </div>
          <span className="text-[9px] text-slate-400 text-center leading-none">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// Horizontal percentage bar
function HBar({ value, max, color = 'bg-blue-500', label }: { value: number; max: number; color?: string; label?: string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {label && <span className="text-xs text-slate-500 w-12 text-right shrink-0">{label}</span>}
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, color = 'text-blue-600' }: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <Icon size={16} className={color} />
      </div>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

export function ReportsClient({ data }: { data: ReportsData }) {
  const {
    totalWoCost, completionRate, activeWOs, overdueCount,
    openPotholes, avgResolutionDays, activeContractValue,
    woStatusCounts, costByProject, woMonthlyTrend,
    potholeResolution, inspectorPerf,
  } = data

  const totalWOs = Object.values(woStatusCounts).reduce((a, b) => a + b, 0)
  const maxProjectCost = Math.max(...costByProject.map((p) => p.total_cost), 1)

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Reports & Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">All-time summary across work orders, damage reports, inspections, and contracts.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign}    label="Total WO Cost"       value={fmt$(totalWoCost)}         sub={`${totalWOs} work orders`}      color="text-blue-600" />
        <KpiCard icon={CheckCircle}   label="Completion Rate"     value={`${completionRate}%`}       sub={`${data.woStatusCounts['closed'] ?? 0} closed`} color="text-green-600" />
        <KpiCard icon={AlertTriangle} label="Open Damage Reports" value={openPotholes}               sub={avgResolutionDays ? `Avg ${avgResolutionDays}d to resolve` : 'No resolved data'} color="text-orange-500" />
        <KpiCard icon={FileText}      label="Active Contract Value" value={fmt$(activeContractValue)} sub="Active contracts only"          color="text-purple-600" />
      </div>

      {/* WO Status + Monthly trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* WO Status breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Work Order Status</h2>
            <Link href="/dashboard/work-orders" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>

          {/* Stacked bar */}
          {totalWOs > 0 && (
            <div className="flex h-3 rounded-full overflow-hidden gap-px">
              {(['open','in_progress','on_hold','closed','cancelled','draft'] as const)
                .filter((s) => woStatusCounts[s])
                .map((s) => (
                  <div
                    key={s}
                    className={STATUS_COLOR[s]}
                    style={{ width: `${(woStatusCounts[s] / totalWOs) * 100}%` }}
                    title={`${s}: ${woStatusCounts[s]}`}
                  />
                ))}
            </div>
          )}

          <div className="space-y-2.5">
            {Object.entries(woStatusCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => (
                <div key={status} className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_COLOR[status] ?? 'bg-slate-400'}`} />
                  <span className="text-sm text-slate-700 dark:text-slate-300 capitalize flex-1">
                    {status.replace('_', ' ')}
                  </span>
                  <HBar value={count} max={totalWOs} color={STATUS_COLOR[status]} />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 w-8 text-right">{count}</span>
                </div>
              ))}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            {overdueCount > 0 ? (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                ⚠ {overdueCount} overdue {overdueCount === 1 ? 'order' : 'orders'} past due date
              </p>
            ) : (
              <p className="text-xs text-green-600 dark:text-green-400">No overdue work orders</p>
            )}
          </div>
        </div>

        {/* Monthly trend */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">WO Trend — Last 6 Months</h2>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block"/>Created</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block"/>Closed</span>
            </div>
          </div>
          <BarChart data={woMonthlyTrend.map((m) => ({ label: m.month, a: m.created, b: m.closed }))} />
          <div className="flex justify-between text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
            <span>Total created: <strong className="text-slate-600 dark:text-slate-300">{woMonthlyTrend.reduce((s, m) => s + m.created, 0)}</strong></span>
            <span>Total closed: <strong className="text-green-600">{woMonthlyTrend.reduce((s, m) => s + m.closed, 0)}</strong></span>
          </div>
        </div>
      </div>

      {/* Cost by project */}
      {costByProject.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Cost by Project (Top {costByProject.length})</h2>
            <Link href="/dashboard/projects" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-3">
            {costByProject.map((p) => (
              <div key={p.number} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300 truncate max-w-xs">
                    <span className="font-mono text-xs text-slate-400 mr-2">{p.number}</span>
                    {p.name}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400">{p.wo_count} WO{p.wo_count !== 1 ? 's' : ''}</span>
                    <span className="font-semibold text-slate-900 dark:text-white w-20 text-right">{fmt$(p.total_cost)}</span>
                  </div>
                </div>
                <HBar value={p.total_cost} max={maxProjectCost} color="bg-blue-500" />
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-sm">
            <span className="text-slate-400">Total across {costByProject.length} project{costByProject.length !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {fmt$(costByProject.reduce((s, p) => s + p.total_cost, 0))}
            </span>
          </div>
        </div>
      )}

      {/* Pothole resolution + Inspector performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Pothole resolution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Damage Report Resolution</h2>
            <Link href="/dashboard/potholes" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>

          {potholeResolution.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No damage report data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-medium text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left pb-2">Severity</th>
                    <th className="text-right pb-2">Total</th>
                    <th className="text-right pb-2">Resolved</th>
                    <th className="text-right pb-2">Rate</th>
                    <th className="text-right pb-2">Avg Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {potholeResolution.map((r) => {
                    const rate = r.total > 0 ? Math.round((r.resolved / r.total) * 100) : 0
                    return (
                      <tr key={r.severity}>
                        <td className="py-2">
                          <span className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_COLOR[r.severity] ?? 'bg-slate-400'}`} />
                            <span className={`capitalize font-medium ${SEVERITY_TEXT[r.severity] ?? 'text-slate-600'}`}>{r.severity}</span>
                          </span>
                        </td>
                        <td className="py-2 text-right text-slate-700 dark:text-slate-300">{r.total}</td>
                        <td className="py-2 text-right text-slate-700 dark:text-slate-300">{r.resolved}</td>
                        <td className="py-2 text-right">
                          <span className={`text-xs font-medium ${rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                            {rate}%
                          </span>
                        </td>
                        <td className="py-2 text-right text-slate-500">
                          {r.avg_days != null ? `${r.avg_days}d` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {avgResolutionDays != null && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs text-slate-500">
                Overall average resolution: <strong className="text-slate-700 dark:text-slate-300">{avgResolutionDays} days</strong>
              </p>
            </div>
          )}
        </div>

        {/* Inspector performance */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Inspector Performance</h2>
            <Link href="/dashboard/inspections" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>

          {inspectorPerf.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No inspection data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-medium text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left pb-2">Inspector</th>
                    <th className="text-right pb-2">Total</th>
                    <th className="text-right pb-2">Done</th>
                    <th className="text-right pb-2">Rate</th>
                    <th className="text-right pb-2">Avg Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {inspectorPerf.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 font-medium text-slate-700 dark:text-slate-300 max-w-[140px] truncate">{r.inspector_name}</td>
                      <td className="py-2 text-right text-slate-700 dark:text-slate-300">{r.total}</td>
                      <td className="py-2 text-right text-slate-700 dark:text-slate-300">{r.completed}</td>
                      <td className="py-2 text-right">
                        <span className={`text-xs font-medium ${r.completion_rate >= 80 ? 'text-green-600' : r.completion_rate >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                          {r.completion_rate}%
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        {r.avg_score != null ? (
                          <span className={`text-xs font-semibold ${r.avg_score >= 80 ? 'text-green-600' : r.avg_score >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                            {r.avg_score}%
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
