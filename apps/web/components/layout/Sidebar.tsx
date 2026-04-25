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
  { labelKey: 'nav.team',          href: '/dashboard/team',            icon: Users,    roles: ['admin', 'supervisor'] },
  { labelKey: 'nav.reports',       href: '/dashboard/reports',         icon: BarChart2, roles: ['admin', 'supervisor'] },
  { labelKey: 'nav.designSettings',href: '/dashboard/design-settings', icon: Palette,  roles: ['admin'] },
  { labelKey: 'nav.settings',      href: '/dashboard/settings',        icon: Settings, roles: ['admin'] },
]

const fmNavItems: NavItem[] = [
  { labelKey: 'nav.fmDashboard',   href: '/dashboard/fm',                    icon: LayoutDashboard },
  { labelKey: 'nav.fmProperties',  href: '/dashboard/fm/properties',         icon: Building2 },
  { labelKey: 'nav.fmAssets',      href: '/dashboard/fm/assets',             icon: Wrench },
  { labelKey: 'nav.fmInspections', href: '/dashboard/fm/inspections',        icon: ClipboardCheck },
  { labelKey: 'nav.fmWorkOrders',  href: '/dashboard/fm/work-orders',        icon: ClipboardList },
  { labelKey: 'nav.fmTemplates',   href: '/dashboard/fm/templates',          icon: ScrollText,    roles: ['admin', 'supervisor'] },
  { labelKey: 'nav.fmSchedules',   href: '/dashboard/fm/schedules',          icon: CalendarClock, roles: ['admin', 'supervisor'] },
  { labelKey: 'nav.fmReports',     href: '/dashboard/fm/reports',            icon: ChartBar,      roles: ['admin', 'supervisor'] },
  { labelKey: 'nav.team',          href: '/dashboard/team',                  icon: Users,         roles: ['admin'] },
  { labelKey: 'nav.settings',      href: '/dashboard/settings',              icon: Settings,      roles: ['admin'] },
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
  const { appMode } = useAppMode()
  const isCA = designTheme === 'dev'

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

      {/* Sidebar panel — 240px matches mockup */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex flex-col transition-transform duration-200',
          'lg:relative lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{
          width: 240,
          background: isCA ? 'var(--card-b)' : 'var(--sidebar)',
          borderRight: isCA
            ? '1px solid var(--border)'
            : '1px solid rgba(255,255,255,.06)',
        }}
      >
        {/* ── Logo row (64px tall, matches mockup .sidebar-logo) ── */}
        <div
          className="flex items-center justify-between flex-shrink-0"
          style={{
            height: 64,
            padding: '0 20px',
            borderBottom: isCA
              ? '1px solid var(--border)'
              : '1px solid rgba(255,255,255,.08)',
          }}
        >
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={isCA ? '/logo-black.png' : '/logo-white.png'}
              alt="Sentinel"
              style={{ height: 26, width: 'auto' }}
            />
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1"
            style={{ color: isCA ? 'var(--faint)' : 'rgba(255,255,255,.4)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Nav (12px padding all around, matches .sidebar-nav) ── */}
        <nav className="flex-1 overflow-y-auto" style={{ padding: 12 }}>
          {visibleItems.map((item) => {
            // Root dashboard items use exact match so sub-pages don't keep them highlighted
            const exactMatchHrefs = ['/dashboard', '/dashboard/fm']
            const isActive = exactMatchHrefs.includes(item.href)
              ? pathname === item.href
              : pathname.startsWith(item.href)

            if (isCA) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 1,
                    color: isActive ? 'var(--primary)' : 'var(--muted)',
                    background: isActive ? 'var(--primary-c)' : 'transparent',
                    transition: 'background .15s, color .15s, transform .15s',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = 'var(--fg)'
                      e.currentTarget.style.background = 'var(--card)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = 'var(--muted)'
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  <item.icon size={17} style={{ flexShrink: 0 }} />
                  {t(item.labelKey)}
                </Link>
              )
            }

            // ── Classic dark-sidebar nav item ──────────────────────────────
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 1,
                  color: isActive ? '#fff' : 'rgba(255,255,255,.5)',
                  background: isActive ? '#2563eb' : 'transparent',
                  boxShadow: isActive ? '0 2px 8px rgba(37,99,235,.4)' : 'none',
                  transition: 'background .15s, color .15s, transform .15s, box-shadow .15s',
                  textDecoration: 'none',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'rgba(255,255,255,.92)'
                    e.currentTarget.style.transform = 'translateX(2px)'
                    e.currentTarget.style.background = 'rgba(255,255,255,.08)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'rgba(255,255,255,.5)'
                    e.currentTarget.style.transform = 'translateX(0)'
                    e.currentTarget.style.background = 'transparent'
                  }
                }}
              >
                <item.icon size={17} style={{ flexShrink: 0 }} />
                {t(item.labelKey)}
              </Link>
            )
          })}
        </nav>

        {/* ── Org footer (matches .sidebar-footer) ── */}
        <div
          className="flex-shrink-0"
          style={{
            padding: '16px 20px',
            borderTop: isCA
              ? '1px solid var(--border)'
              : '1px solid rgba(255,255,255,.08)',
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: isCA ? 'var(--faint)' : 'rgba(255,255,255,.3)',
            }}
          >
            {t('nav.municipalityOf')}
          </p>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              marginTop: 2,
              color: isCA ? 'var(--muted)' : 'rgba(255,255,255,.7)',
            }}
          >
            {orgName ?? 'Guaynabo, PR'}
          </p>
        </div>
      </aside>
    </>
  )
}
