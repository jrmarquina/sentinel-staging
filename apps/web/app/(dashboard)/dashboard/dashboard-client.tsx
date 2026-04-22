'use client'

import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ClipboardList, Map, Calendar, AlertTriangle, Clock, Ban, FolderKanban } from 'lucide-react'
import { useDesignTheme } from '@/lib/design-theme'
import { DashboardDev } from './dashboard-dev'
import type {
  DevStats,
  DevPriorityItem,
  DevUpcomingItem,
  AssigneeWorkload,
  PotholeBacklogData,
  ProjectMarker,
  GanttProject,
} from './dashboard-dev'

// ── Helpers ───────────────────────────────────────────────────────────────────
function greetingByHour(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const quickLinks = [
  { label: 'Work Orders', href: '/dashboard/work-orders', icon: ClipboardList, color: 'bg-blue-500' },
  { label: 'Projects',    href: '/dashboard/projects',    icon: FolderKanban,  color: 'bg-indigo-500' },
  { label: 'Map View',    href: '/dashboard/map',         icon: Map,           color: 'bg-emerald-500' },
  { label: 'Calendar',    href: '/dashboard/calendar',    icon: Calendar,      color: 'bg-purple-500' },
]

const STATUS_DOT: Record<string, string> = {
  overdue: 'bg-red-500',
  at_risk: 'bg-amber-400',
  on_track: 'bg-emerald-500',
  closed:   'bg-slate-400',
}

interface Props {
  firstName: string
  stats: DevStats
  priorityItems: DevPriorityItem[]
  upcoming: DevUpcomingItem[]
  assigneeWorkload: AssigneeWorkload[]
  potholeStats: PotholeBacklogData
  projectMarkers: ProjectMarker[]
  ganttProjects: GanttProject[]
}

// ── Classic dashboard ─────────────────────────────────────────────────────────
function DashboardClassic({ firstName, stats, priorityItems, upcoming, assigneeWorkload: _a, potholeStats: _p, projectMarkers: _m, ganttProjects: _g }: Props) {
  const statsGrid = [
    { label: 'Open Work Orders',    value: stats.openWorkOrders,    href: '/dashboard/work-orders' },
    { label: 'Due This Week',       value: stats.dueThisWeek,       href: '/dashboard/work-orders', accent: stats.dueThisWeek > 0 },
    { label: 'Active Contracts',    value: stats.activeContracts,   href: '/dashboard/contracts' },
    { label: 'Pending Inspections', value: stats.pendingInspections,href: '/dashboard/inspections' },
    { label: 'Active Potholes',     value: stats.activePotholes,    href: '/dashboard/potholes' },
    { label: 'Active Projects',     value: stats.activeProjects,    href: '/dashboard/projects' },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {greetingByHour()}, {firstName}
        </h1>
        <p className="text-slate-500 mt-1">Here&apos;s what&apos;s happening in Guaynabo today.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
          >
            <div className={`${link.color} w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0`}>
              <link.icon size={18} className="text-white" />
            </div>
            <span className="font-medium text-sm text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {link.label}
            </span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statsGrid.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
          >
            <p className={`text-2xl font-bold ${stat.accent ? 'text-amber-500' : 'text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'}`}>
              {stat.value}
            </p>
            <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
            {stat.value === 0 && (
              <p className="text-[10px] text-blue-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Add one →</p>
            )}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Priority panel */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <AlertTriangle size={16} className="text-red-500" />
            <h2 className="font-semibold text-slate-800 dark:text-white text-sm">Needs Attention</h2>
            {priorityItems.length > 0 && (
              <span className="ml-auto text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium px-2 py-0.5 rounded-full">
                {priorityItems.length}
              </span>
            )}
          </div>

          {priorityItems.length === 0 ? (
            <div className="px-5 py-10 text-center space-y-2">
              <p className="text-sm text-slate-400">All clear — no overdue or blocked items.</p>
              {stats.openWorkOrders === 0 && (
                <Link href="/dashboard/work-orders/new" className="inline-block text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  Create your first work order →
                </Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {priorityItems.map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <Link href={item.href} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[item.delay]}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-slate-400">{item.number}</span>
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.title}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          item.type === 'project'
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        }`}>
                          {item.type === 'project' ? 'Project' : 'WO'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                        {item.dueDate && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            Due {format(parseISO(item.dueDate), 'MMM d, yyyy')}
                          </span>
                        )}
                        {item.blocked && item.blockedBy && (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                            <Ban size={11} />
                            Blocked by {item.blockedBy}
                          </span>
                        )}
                        {!item.blocked && (
                          <span className={`font-medium ${item.delay === 'overdue' ? 'text-red-500' : 'text-amber-500'}`}>
                            {item.delay === 'overdue' ? 'Overdue' : 'Due soon'}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upcoming deadlines */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <Clock size={16} className="text-blue-500" />
            <h2 className="font-semibold text-slate-800 dark:text-white text-sm">Next 14 Days</h2>
          </div>

          {upcoming.length === 0 ? (
            <div className="px-5 py-10 text-center space-y-3">
              <p className="text-sm text-slate-400">Nothing due in the next 14 days.</p>
              <div className="flex flex-col items-center gap-1.5">
                <Link href="/dashboard/work-orders/new" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">New work order →</Link>
                <Link href="/dashboard/projects/new" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">New project →</Link>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcoming.map((item) => (
                <li key={`up-${item.type}-${item.id}`}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                      item.type === 'contract'
                        ? 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${item.type === 'contract' ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>{item.title}</p>
                      <p className={`text-xs mt-0.5 ${item.type === 'contract' ? 'text-red-400 dark:text-red-500' : 'text-slate-400'}`}>{format(parseISO(item.dueDate), 'MMM d')}</p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                      item.type === 'contract'
                        ? 'bg-red-200 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                        : item.type === 'project'
                        ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    }`}>
                      {item.type === 'contract' ? 'CT' : item.type === 'project' ? 'PJ' : 'WO'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Switcher ──────────────────────────────────────────────────────────────────
export function DashboardClient({
  firstName,
  stats,
  priorityItems,
  upcoming,
  assigneeWorkload,
  potholeStats,
  projectMarkers,
  ganttProjects,
}: Props) {
  const { designTheme } = useDesignTheme()

  if (designTheme === 'dev') {
    return (
      <DashboardDev
        firstName={firstName}
        stats={stats}
        priorityItems={priorityItems}
        upcoming={upcoming}
        assigneeWorkload={assigneeWorkload}
        potholeStats={potholeStats}
        projectMarkers={projectMarkers}
        ganttProjects={ganttProjects}
      />
    )
  }

  return (
    <DashboardClassic
      firstName={firstName}
      stats={stats}
      priorityItems={priorityItems}
      upcoming={upcoming}
      assigneeWorkload={assigneeWorkload}
      potholeStats={potholeStats}
      projectMarkers={projectMarkers}
      ganttProjects={ganttProjects}
    />
  )
}
