'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  Wrench,
  ClipboardCheck,
  AlertTriangle,
  Loader2,
  ChevronRight,
} from 'lucide-react'

interface DashboardData {
  properties: { total: number; active: number }
  assets: { total: number; byCondition: { good: number; fair: number; poor: number } }
  inspections: { total: number; completed: number; pending: number; inProgress: number; averageScore: number }
  workOrders: { total: number; open: number; inProgress: number; completed: number; highPriority: number }
  recentInspections: Array<{
    id: string
    status: string
    score: number | null
    created_at: string
    fm_properties: { name: string } | null
  }>
}

const STATUS_BADGE: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  PENDING_APPROVAL: 'bg-orange-100 text-orange-700',
  DRAFT: 'bg-slate-100 text-slate-600',
}

function StatCard({
  icon,
  title,
  primary,
  secondary,
  href,
}: {
  icon: React.ReactNode
  title: string
  primary: string
  secondary: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between">
        <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg text-blue-600 dark:text-blue-400">
          {icon}
        </div>
        <ChevronRight size={16} className="text-slate-400" />
      </div>
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{primary}</p>
        <p className="text-sm text-slate-500 mt-0.5">{secondary}</p>
      </div>
    </Link>
  )
}

export default function FMDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/fm/analytics/dashboard')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load dashboard data')
        return r.json() as Promise<DashboardData>
      })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="py-16 text-center text-red-500">
        <AlertTriangle size={32} className="mx-auto mb-3" />
        <p>{error ?? 'No data available'}</p>
      </div>
    )
  }

  const { properties, assets, inspections, workOrders, recentInspections } = data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
          Facility Management
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Overview of all managed properties and assets</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<Building2 size={20} />}
          title="Properties"
          primary={String(properties.active)}
          secondary={`${properties.total} total`}
          href="/dashboard/fm/properties"
        />
        <StatCard
          icon={<Wrench size={20} />}
          title="Assets"
          primary={String(assets.total)}
          secondary={`${assets.byCondition.good}G / ${assets.byCondition.fair}F / ${assets.byCondition.poor}P`}
          href="/dashboard/fm/assets"
        />
        <StatCard
          icon={<ClipboardCheck size={20} />}
          title="Inspections"
          primary={
            inspections.averageScore > 0
              ? `${inspections.averageScore}%`
              : '—'
          }
          secondary={`${inspections.completed} of ${inspections.total} completed`}
          href="/dashboard/fm/inspections"
        />
        <StatCard
          icon={<AlertTriangle size={20} />}
          title="Work Orders"
          primary={String(workOrders.open)}
          secondary={`${workOrders.highPriority} high priority open`}
          href="/dashboard/fm/work-orders"
        />
      </div>

      {/* Recent inspections */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 dark:text-white">Recent Inspections</h2>
          <Link
            href="/dashboard/fm/inspections"
            className="text-sm text-blue-600 hover:underline"
          >
            View all
          </Link>
        </div>

        {recentInspections.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">No inspections yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Property</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Score</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentInspections.map((insp) => (
                  <tr
                    key={insp.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    onClick={() => { window.location.href = `/dashboard/fm/inspections/${insp.id}` }}
                  >
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">
                      {insp.fm_properties?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[insp.status] ?? 'bg-slate-100 text-slate-600'}`}
                      >
                        {insp.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                      {insp.score != null ? `${insp.score}%` : 'N/A'}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {new Date(insp.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
