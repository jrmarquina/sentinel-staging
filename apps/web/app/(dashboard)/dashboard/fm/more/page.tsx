'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ClipboardList, FileSearch, Wrench, BarChart2,
  UserCircle, Settings, LogOut, ChevronRight,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface MenuItem {
  label:    string
  href?:    string
  icon:     React.ElementType
  iconBg:   string
  danger?:  boolean
  action?:  () => void
}

interface MenuSection {
  heading: string
  items:   MenuItem[]
}

// ── Row component ──────────────────────────────────────────────────────────

function MoreRow({ item }: { item: MenuItem }) {
  const inner = (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '12px 16px',
        background:     'var(--mob-card)',
        borderBottom:   '1px solid var(--mob-border)',
        cursor:         'pointer',
        textDecoration: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width:          36,
          height:         36,
          borderRadius:   10,
          background:     item.iconBg,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
        }}>
          <item.icon size={18} color={item.danger ? '#EF4444' : '#374151'} />
        </div>
        <span style={{
          fontSize:   14,
          fontWeight: 600,
          color:      item.danger ? '#EF4444' : 'var(--mob-fg)',
        }}>
          {item.label}
        </span>
      </div>
      {!item.danger && (
        <ChevronRight size={16} color="var(--mob-muted)" />
      )}
    </div>
  )

  if (item.action) {
    return <button onClick={item.action} style={{ width: '100%', border: 'none', background: 'none', padding: 0 }}>{inner}</button>
  }
  if (item.href) {
    return <Link href={item.href} style={{ display: 'block', textDecoration: 'none' }}>{inner}</Link>
  }
  return inner
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FMMorePage() {
  const router = useRouter()

  const sections: MenuSection[] = [
    {
      heading: 'Facilities',
      items: [
        {
          label:   'Work Orders',
          href:    '/dashboard/fm/work-orders',
          icon:    ClipboardList,
          iconBg:  '#EFF6FF',
        },
        {
          label:   'FCA Reports',
          href:    '/dashboard/fm/fca',
          icon:    FileSearch,
          iconBg:  '#F0FDF4',
        },
        {
          label:   'Assets',
          href:    '/dashboard/fm/assets',
          icon:    Wrench,
          iconBg:  '#FFFBEB',
        },
        {
          label:   'Reports',
          href:    '/dashboard/fm/reports',
          icon:    BarChart2,
          iconBg:  '#FFF1F2',
        },
      ],
    },
    {
      heading: 'Account',
      items: [
        {
          label:   'Profile',
          href:    '/dashboard/profile',
          icon:    UserCircle,
          iconBg:  '#F3F4F6',
        },
        {
          label:   'Settings',
          href:    '/dashboard/settings',
          icon:    Settings,
          iconBg:  '#F3F4F6',
        },
        {
          label:   'Sign Out',
          icon:    LogOut,
          iconBg:  '#FFF1F2',
          danger:  true,
          action:  () => router.push('/api/auth/signout'),
        },
      ],
    },
  ]

  return (
    <div>
      {/* Mobile-only header */}
      <div
        className="lg:hidden"
        style={{
          padding:      '16px 16px 8px',
          background:   'var(--mob-bg)',
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--mob-fg)', margin: 0 }}>More</h1>
      </div>

      {/* Desktop redirect notice */}
      <div className="hidden lg:block" style={{ padding: '4rem 0', textAlign: 'center', color: 'var(--muted)' }}>
        <p style={{ fontSize: '0.9rem' }}>This page is part of the mobile navigation.</p>
        <Link href="/dashboard/fm" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, marginTop: '0.5rem', display: 'block' }}>
          Go to FM Dashboard →
        </Link>
      </div>

      {/* Mobile sections */}
      <div className="lg:hidden" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 20px))' }}>
        {sections.map((section) => (
          <div key={section.heading} style={{ marginTop: 24 }}>
            <p style={{
              fontSize:      11,
              fontWeight:    700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color:         'var(--mob-muted)',
              padding:       '0 16px 6px',
            }}>
              {section.heading}
            </p>
            <div style={{ borderTop: '1px solid var(--mob-border)' }}>
              {section.items.map((item) => (
                <MoreRow key={item.label} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
