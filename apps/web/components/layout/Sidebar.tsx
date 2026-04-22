'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Map,
  Calendar,
  ClipboardList,
  FileText,
  Users,
  Settings,
  X,
  AlertTriangle,
  ClipboardCheck,
  FolderKanban,
  Palette,
  BarChart2,
  Building2,
  Wrench,
  ScrollText,
  CalendarClock,
  ChartBar,
} from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { useT } from '@/lib/locale'
import { useDesignTheme } from '@/lib/design-theme'
import { useTheme } from '@/lib/theme'
import { useAppMode } from '@/lib/app-mode'
import { cn } from '@/lib/utils'
import type { TranslationKey } from '@/lib/translations/en'


interface NavItem {
  labelKey: TranslationKey
  href: string
  icon: React.ElementType
  roles?: string[]
}

const pwNavItems: NavItem[] = [
  { labelKey: 'nav.dashboard',   href: '/dashboard',                icon: LayoutDashboard },
  { labelKey: 'nav.map',         href: '/dashboard/map',            icon: Map },
  { labelKey: 'nav.projects',    href: '/dashboard/projects',       icon: FolderKanban },
  { labelKey: 'nav.workOrders',  href: '/dashboard/work-orders',    icon: ClipboardList },
  { labelKey: 'nav.potholes',    href: '/dashboard/potholes',       icon: AlertTriangle },
  { labelKey: 'nav.inspections', href: '/dashboard/inspections',    icon: ClipboardCheck },
  { labelKey: 'nav.calendar',    href: '/dashboard/calendar',       icon: Calendar },
  { labelKey: 'nav.contracts',   href: '/dashboard/contracts',      icon: FileText },
  { labelKey: 'nav.team',          href: '/dashboard/team',            icon: Users,   roles: ['admin', 'supervisor'] },
  { labelKey: 'nav.reports',       href: '/dashboard/reports',         icon: BarChart2, roles: ['admin', 'supervisor'] },
  { labelKey: 'nav.designSettings',href: '/dashboard/design-settings', icon: Palette, roles: ['admin'] },
  { labelKey: 'nav.settings',      href: '/dashboard/settings',        icon: Settings,roles: ['admin'] },
]

const fmNavItems: NavItem[] = [
  { labelKey: 'nav.fmDashboard',   href: '/dashboard/fm',                    icon: LayoutDashboard },
  { labelKey: 'nav.fmProperties',  href: '/dashboard/fm/properties',         icon: Building2 },
  { labelKey: 'nav.fmAssets',      href: '/dashboard/fm/assets',             icon: Wrench },
  { labelKey: 'nav.fmInspections', href: '/dashboard/fm/inspections',        icon: ClipboardCheck },
  { labelKey: 'nav.fmWorkOrders',  href: '/dashboard/fm/work-orders',        icon: ClipboardList },
  { labelKey: 'nav.fmTemplates',   href: '/dashboard/fm/templates',          icon: ScrollText, roles: ['admin', 'supervisor'] },
  { labelKey: 'nav.fmSchedules',   href: '/dashboard/fm/schedules',          icon: CalendarClock, roles: ['admin', 'supervisor'] },
  { labelKey: 'nav.fmReports',     href: '/dashboard/fm/reports',            icon: ChartBar, roles: ['admin', 'supervisor'] },
  { labelKey: 'nav.team',          href: '/dashboard/team',                  icon: Users,   roles: ['admin'] },
  { labelKey: 'nav.settings',      href: '/dashboard/settings',              icon: Settings,roles: ['admin'] },
]

interface SidebarProps {
  mobileOpen: boolean
  onClose: () => void
  /** Org display name — passed from server to avoid extra client fetch */
  orgName?: string
}

export function Sidebar({ mobileOpen, onClose, orgName }: SidebarProps) {
  const pathname = usePathname()
  const { role } = useRole()
  const t = useT()
  const { designTheme } = useDesignTheme()
  const { theme } = useTheme()
  const { appMode } = useAppMode()
  const isCA = designTheme === 'dev'
  const useDarkLogo = isCA && theme === 'light'

  const navItems = appMode === 'fm' ? fmNavItems : pwNavItems
  const visibleItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(role ?? '')
  )

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-64 flex flex-col transition-transform duration-200',
          'lg:relative lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          isCA
            ? 'border-r'
            : 'bg-[#0D1B2E] dark:bg-[#080F1C] border-r border-white/10'
        )}
        style={isCA ? {
          background: 'var(--ca-section)',
          borderColor: 'var(--ca-card-high)',
        } : undefined}
      >
        {/* Logo */}
        <div
          className={cn('flex items-center justify-between h-16 px-5 flex-shrink-0', isCA ? 'border-b' : 'border-b border-white/10')}
          style={isCA ? { borderColor: 'var(--ca-card-high)' } : undefined}
        >
          <div className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={useDarkLogo ? '/logo-black.png' : '/logo-white.png'}
              alt="Sentinel"
              style={{ height: 26, width: 'auto' }}
            />
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1"
            style={isCA ? { color: 'var(--ca-ink-faint)' } : undefined}
          >
            <X size={18} className={isCA ? '' : 'text-slate-400'} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {visibleItems.map((item) => {
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)

            if (isCA) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    background: isActive ? 'var(--ca-primary-c)' : 'transparent',
                    color: isActive ? 'var(--ca-primary)' : 'var(--ca-ink-muted)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'var(--ca-card)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <item.icon size={17} className="flex-shrink-0" />
                  {t(item.labelKey)}
                </Link>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
              >
                <item.icon size={18} className="flex-shrink-0" />
                {t(item.labelKey)}
              </Link>
            )
          })}
        </nav>

        {/* Org badge */}
        <div
          className={cn('px-5 py-4 flex-shrink-0', isCA ? 'border-t' : 'border-t border-white/10')}
          style={isCA ? { borderColor: 'var(--ca-card-high)' } : undefined}
        >
          <p
            className={cn('text-xs', isCA ? '' : 'text-slate-500')}
            style={isCA ? { color: 'var(--ca-ink-faint)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' } : undefined}
          >
            {t('nav.municipalityOf')}
          </p>
          <p
            className={cn('text-sm font-medium mt-0.5', isCA ? '' : 'text-slate-300')}
            style={isCA ? { color: 'var(--ca-ink-muted)', fontWeight: 600 } : undefined}
          >
            {orgName ?? 'Guaynabo, PR'}
          </p>
        </div>
      </aside>
    </>
  )
}
