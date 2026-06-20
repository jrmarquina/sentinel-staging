'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Building2, ClipboardCheck, MoreHorizontal } from 'lucide-react'

const TABS = [
  {
    label: 'Home',
    href:  '/dashboard/fm',
    icon:  Home,
    match: (p: string) => p === '/dashboard/fm',
  },
  {
    label: 'Properties',
    href:  '/dashboard/fm/properties',
    icon:  Building2,
    match: (p: string) => p.startsWith('/dashboard/fm/properties'),
  },
  {
    label: 'Inspections',
    href:  '/dashboard/fm/inspections',
    icon:  ClipboardCheck,
    match: (p: string) => p.startsWith('/dashboard/fm/inspections'),
  },
  {
    label: 'More',
    href:  '/dashboard/fm/more',
    icon:  MoreHorizontal,
    match: (p: string) =>
      p.startsWith('/dashboard/fm/more') ||
      p.startsWith('/dashboard/fm/fca') ||
      p.startsWith('/dashboard/fm/work-orders') ||
      p.startsWith('/dashboard/fm/assets') ||
      p.startsWith('/dashboard/fm/reports'),
  },
] as const

export function MobileBottomNav() {
  const pathname = usePathname()

  if (!pathname.startsWith('/dashboard/fm')) return null

  return (
    <nav
      className="lg:hidden"
      style={{
        position:        'fixed',
        bottom:          0,
        left:            0,
        right:           0,
        zIndex:          40,
        background:      'var(--mob-nav)',
        borderTop:       '1px solid var(--mob-border)',
        paddingBottom:   'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div style={{ display: 'flex', height: 60 }}>
        {TABS.map(({ label, href, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <Link
              key={href}
              href={href}
              style={{
                flex:           1,
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            3,
                textDecoration: 'none',
                color:          active ? 'var(--mob-accent)' : 'var(--mob-muted)',
                transition:     'color 0.15s',
              }}
            >
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, lineHeight: 1 }}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
