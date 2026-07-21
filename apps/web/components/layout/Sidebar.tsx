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
  ArrowLeftRight,
  FileSearch,
  TrendingUp,
  History,
  MapPin,
} from 'lucide-react'
import { useT } from '@/lib/locale'
import { useDesignTheme } from '@/lib/design-theme'
import { useDevThemeOverrides } from '@/lib/dev-theme-overrides'
import { useTheme } from '@/lib/theme'
import { useAppMode } from '@/lib/app-mode'
import { cn } from '@/lib/utils'
import type { TranslationKey } from '@/lib/translations/en'

// ── Types ──────────────────────────────────────────────────────────────────

interface NavItem {
  labelKey: TranslationKey
  href:     string
  icon:     React.ElementType
}

interface NavSection {
  heading?: string
  items:    NavItem[]
}

// ── Nav definitions ────────────────────────────────────────────────────────
// Each capability gets exactly the sections it should see.

const PW_SECTIONS: NavSection[] = [
  {
    items: [
      { labelKey: 'nav.dashboard',  href: '/dashboard',             icon: LayoutDashboard },
    ],
  },
  {
    heading: 'Public Works',
    items: [
      { labelKey: 'nav.workOrders',  href: '/dashboard/work-orders',  icon: ClipboardList },
      { labelKey: 'nav.map',         href: '/dashboard/map',           icon: Map },
      { labelKey: 'nav.contracts',   href: '/dashboard/contracts',     icon: FileText },
      { labelKey: 'nav.potholes',    href: '/dashboard/potholes',      icon: AlertTriangle },
    ],
  },
]

const PW_MANAGER_EXTRA: NavSection = {
  heading: 'Admin',
  items: [
    { labelKey: 'nav.team',     href: '/dashboard/team',     icon: Users },
    { labelKey: 'nav.settings', href: '/dashboard/settings', icon: Settings },
  ],
}

const FM_SECTIONS: NavSection[] = [
  {
    items: [
      { labelKey: 'nav.fmDashboard', href: '/dashboard/fm', icon: LayoutDashboard },
    ],
  },
  {
    heading: 'Facilities',
    items: [
      { labelKey: 'nav.fmWorkOrders',  href: '/dashboard/fm/work-orders',  icon: ClipboardList },
      { labelKey: 'nav.fmInspections', href: '/dashboard/fm/inspections',  icon: ClipboardCheck },
      { labelKey: 'nav.fmFCA',         href: '/dashboard/fm/fca',          icon: FileSearch },
      { labelKey: 'nav.fmProperties',  href: '/dashboard/fm/properties',   icon: Building2 },
      { labelKey: 'nav.fmAssets',      href: '/dashboard/fm/assets',       icon: Wrench },
      { labelKey: 'nav.fmCustody',     href: '/dashboard/fm/custody',      icon: History },
      { labelKey: 'nav.fmCustodians',  href: '/dashboard/fm/custodians',   icon: Users },
      { labelKey: 'nav.fmSpaces',      href: '/dashboard/fm/spaces',       icon: MapPin },
    ],
  },
]

const FM_MANAGER_EXTRA: NavSection = {
  heading: 'Admin',
  items: [
    { labelKey: 'nav.fmTeam',   href: '/dashboard/fm/team',    icon: Users },
    { labelKey: 'nav.settings', href: '/dashboard/settings',   icon: Settings },
  ],
}

const ADMIN_FM_EXTRAS: NavSection = {
  items: [
    { labelKey: 'nav.projects',    href: '/dashboard/projects',     icon: FolderKanban },
    { labelKey: 'nav.fmTemplates', href: '/dashboard/fm/templates', icon: ScrollText },
    { labelKey: 'nav.fmSchedules', href: '/dashboard/fm/schedules', icon: CalendarClock },
    { labelKey: 'nav.fmReports',   href: '/dashboard/fm/reports',   icon: ChartBar },
  ],
}

const ADMIN_PW_EXTRAS: NavSection = {
  items: [
    { labelKey: 'nav.projects',       href: '/dashboard/projects',       icon: FolderKanban },
    { labelKey: 'nav.calendar',       href: '/dashboard/calendar',       icon: Calendar },
    { labelKey: 'nav.reports',        href: '/dashboard/reports',        icon: BarChart2 },
    { labelKey: 'nav.designSettings', href: '/dashboard/design-settings', icon: Palette },
  ],
}

const ADMIN_SHARED: NavSection = {
  heading: 'Admin',
  items: [
    { labelKey: 'nav.team',     href: '/dashboard/team',     icon: Users },
    { labelKey: 'nav.settings', href: '/dashboard/settings', icon: Settings },
  ],
}

// ── Build sections by capability ───────────────────────────────────────────

function getSections(
  capability: string | null,
  appMode: 'pw' | 'fm',
  role?: string | null,
): NavSection[] {
  // Legacy / unset capability — fall back to role-based sections
  if (!capability) {
    if (role === 'admin' || role === 'supervisor') {
      if (appMode === 'fm') {
        return [
          ...FM_SECTIONS,
          ADMIN_FM_EXTRAS,
          ADMIN_SHARED,
        ]
      }
      return [
        ...PW_SECTIONS,
        ADMIN_PW_EXTRAS,
        ADMIN_SHARED,
      ]
    }
    return PW_SECTIONS
  }

  switch (capability) {

    case 'org_admin': {
      // Can toggle between PW and FM modes
      if (appMode === 'fm') {
        return [
          ...FM_SECTIONS,
          ADMIN_FM_EXTRAS,
          ADMIN_SHARED,
        ]
      }
      // PW mode
      return [
        ...PW_SECTIONS,
        ADMIN_PW_EXTRAS,
        ADMIN_SHARED,
      ]
    }

    case 'fm_manager':
      return [
        ...FM_SECTIONS,
        ADMIN_FM_EXTRAS,
        FM_MANAGER_EXTRA,
      ]

    case 'fm_contributor':
      return [
        {
          heading: 'Facilities',
          items: [
            { labelKey: 'nav.fmInspections', href: '/dashboard/fm/inspections', icon: ClipboardCheck },
          ],
        },
      ]

    case 'fm_worker':
      return [
        {
          heading: 'Facilities',
          items: [
            { labelKey: 'nav.fmWorkOrders', href: '/dashboard/fm/work-orders', icon: ClipboardList },
          ],
        },
      ]

    case 'fm_viewer':
      return FM_SECTIONS

    case 'pw_manager':
      return [
        ...PW_SECTIONS,
        PW_MANAGER_EXTRA,
      ]

    case 'pw_viewer':
      return PW_SECTIONS

    case 'pw_worker':
      return [
        {
          heading: 'Public Works',
          items: [
            { labelKey: 'nav.workOrders', href: '/dashboard/work-orders', icon: ClipboardList },
          ],
        },
      ]

    default:
      return PW_SECTIONS
  }
}

// ── Props ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  mobileOpen:      boolean
  onClose:         () => void
  orgName?:        string
  userCapability?: string | null
  userDepartment?: string | null
  userRole?:       string | null
}

// ── Component ──────────────────────────────────────────────────────────────

export function Sidebar({
  mobileOpen, onClose, orgName, userCapability, userRole,
}: SidebarProps) {
  const pathname       = usePathname()
  const t              = useT()
  const { designTheme } = useDesignTheme()
  const { theme }       = useTheme()
  const { overrides }   = useDevThemeOverrides()
  const { appMode, setAppMode } = useAppMode()
  const isCA = designTheme === 'dev'

  const logoSrc = isCA
    ? (overrides[theme === 'dark' ? 'dark' : 'light'].logo === 'white' ? '/logo-white.png' : '/logo-black.png')
    : '/logo-white.png'

  const isAdmin = userCapability === 'org_admin' || ((!userCapability) && userRole === 'admin')
  const sections = getSections(userCapability ?? null, appMode, userRole ?? null)

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
        {/* ── Logo ── */}
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
            <img src={logoSrc} alt="Sentinel" style={{ height: 26, width: 'auto' }} />
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1"
            style={{ color: isCA ? 'var(--faint)' : 'rgba(255,255,255,.4)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── PW / FM toggle (org_admin only) ── */}
        {isAdmin && (
          <div
            style={{
              display: 'flex',
              margin: '10px 12px 0',
              background: isCA ? 'var(--card)' : 'rgba(255,255,255,.06)',
              borderRadius: 8,
              padding: 3,
              gap: 2,
            }}
          >
            {(['pw', 'fm'] as const).map((mode) => {
              const active = appMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => setAppMode(mode)}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '.04em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'background .15s, color .15s',
                    background: active
                      ? (isCA ? 'var(--primary)' : '#2563eb')
                      : 'transparent',
                    color: active
                      ? '#fff'
                      : (isCA ? 'var(--muted)' : 'rgba(255,255,255,.4)'),
                  }}
                >
                  {mode === 'pw' ? 'Public Works' : 'Facilities'}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Nav ── */}
        <nav className="flex-1 overflow-y-auto" style={{ padding: 12 }}>
          {sections.map((section, si) => (
            <div key={si} style={{ marginBottom: 4 }}>
              {section.heading && (
                <p style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: isCA ? 'var(--faint)' : 'rgba(255,255,255,.3)',
                  padding: '10px 12px 4px',
                  margin: 0,
                }}>
                  {section.heading}
                </p>
              )}
              {section.items.map((item) => {
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
                        transition: 'background .15s, color .15s',
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
            </div>
          ))}
        </nav>

        {/* ── Org footer ── */}
        <div
          className="flex-shrink-0"
          style={{
            padding: '16px 20px',
            borderTop: isCA
              ? '1px solid var(--border)'
              : '1px solid rgba(255,255,255,.08)',
          }}
        >
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: isCA ? 'var(--faint)' : 'rgba(255,255,255,.3)',
          }}>
            {t('nav.municipalityOf')}
          </p>
          <p style={{
            fontSize: 13, fontWeight: 600, marginTop: 2,
            color: isCA ? 'var(--muted)' : 'rgba(255,255,255,.7)',
          }}>
            {orgName ?? 'Guaynabo, PR'}
          </p>
        </div>
      </aside>
    </>
  )
}
