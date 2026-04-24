'use client'

import { useState, useRef, useEffect } from 'react'
import { Menu, Sun, Moon, Check, ChevronDown, Globe, UserCircle } from 'lucide-react'
import Link from 'next/link'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useRole } from '@/hooks/useRole'
import { useTheme } from '@/lib/theme'
import { useLocale, useT } from '@/lib/locale'
import { useDesignTheme } from '@/lib/design-theme'
import { useAppMode } from '@/lib/app-mode'
import { ROLE_LABELS } from '@sentinel/shared'
import { cn } from '@/lib/utils'

// ── Shared dropdown sub-components ────────────────────────────────────────

function DropdownSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--faint)', letterSpacing: '.1em' }}>
        {label}
      </p>
      <div className="flex gap-2">{children}</div>
    </div>
  )
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
      style={{
        border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
        background: active ? 'var(--primary-c)' : 'var(--card-b)',
        color: active ? 'var(--primary)' : 'var(--muted)',
      }}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface HeaderProps {
  onMenuClick: () => void
  userEmail?: string
  userFullName?: string | null
  userAvatar?: string | null
}

export function Header({ onMenuClick, userEmail, userFullName, userAvatar }: HeaderProps) {
  const { role } = useRole()
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useLocale()
  const { designTheme, setDesignTheme } = useDesignTheme()
  const { appMode, setAppMode } = useAppMode()
  const t = useT()
  const isAdmin = role === 'admin'
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const displayName = userFullName || userEmail || 'User'
  const initials = displayName[0]?.toUpperCase() ?? 'U'

  return (
    <header
      className="flex items-center justify-between px-4 lg:px-6 flex-shrink-0 relative z-30"
      style={{
        height: 48,
        background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg transition-colors"
        style={{ color: 'var(--muted)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card-b)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <div className="hidden lg:block" />

      {/* Right side */}
      <div className="flex items-center gap-3">
        <NotificationBell />

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 p-1.5 pr-2 rounded-lg transition-colors"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card-b)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            {userAvatar ? (
              <img src={userAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                style={{ background: 'var(--primary)' }}>
                {initials}
              </div>
            )}
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium leading-none truncate max-w-[130px]" style={{ color: 'var(--fg)' }}>
                {userFullName || userEmail}
              </p>
              <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--faint)' }}>
                {role ? ROLE_LABELS[role] : '…'}
              </p>
            </div>
            <ChevronDown size={14} className={cn('transition-transform flex-shrink-0', open && 'rotate-180')} style={{ color: 'var(--faint)' }} />
          </button>

          {/* Dropdown panel */}
          {open && (
            <div
              className="absolute right-0 top-full mt-2 w-56 rounded-xl z-50 overflow-hidden"
              style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
            >
              {/* User info */}
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                {userFullName && (
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--fg)' }}>{userFullName}</p>
                )}
                <p className={`text-xs truncate ${userFullName ? '' : 'font-semibold'}`} style={{ color: userFullName ? 'var(--muted)' : 'var(--fg)' }}>{userEmail}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--faint)' }}>{role ? ROLE_LABELS[role] : ''}</p>
              </div>

              {/* Edit profile */}
              <div className="p-1" style={{ borderBottom: '1px solid var(--border)' }}>
                <Link
                  href="/dashboard/profile"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors"
                  style={{ color: 'var(--fg)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--card-b)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <UserCircle size={14} style={{ color: 'var(--faint)' }} />
                  Edit Profile
                </Link>
              </div>

              {/* Appearance */}
              <DropdownSection label={t('menu.appearance')}>
                <ToggleBtn active={theme === 'light'} onClick={() => setTheme('light')}><Sun size={13} />{t('menu.light')}{theme === 'light' && <Check size={11} />}</ToggleBtn>
                <ToggleBtn active={theme === 'dark'}  onClick={() => setTheme('dark')}><Moon size={13} />{t('menu.dark')}{theme === 'dark' && <Check size={11} />}</ToggleBtn>
              </DropdownSection>

              {/* Language */}
              <DropdownSection label={t('menu.language')}>
                <ToggleBtn active={locale === 'en'} onClick={() => setLocale('en')}><Globe size={13} />EN{locale === 'en' && <Check size={11} />}</ToggleBtn>
                <ToggleBtn active={locale === 'es'} onClick={() => setLocale('es')}><Globe size={13} />ES{locale === 'es' && <Check size={11} />}</ToggleBtn>
              </DropdownSection>

              {/* Module — admin only */}
              {isAdmin && (
                <DropdownSection label="Module">
                  <ToggleBtn active={appMode === 'pw'} onClick={() => setAppMode('pw')}>Public Works{appMode === 'pw' && <Check size={11} />}</ToggleBtn>
                  <ToggleBtn active={appMode === 'fm'} onClick={() => setAppMode('fm')}>Facility Mgmt{appMode === 'fm' && <Check size={11} />}</ToggleBtn>
                </DropdownSection>
              )}

              {/* Design — admin only */}
              {isAdmin && (
                <DropdownSection label={t('menu.design')}>
                  <ToggleBtn active={designTheme === 'classic'} onClick={() => setDesignTheme('classic')}>{t('menu.classic')}{designTheme === 'classic' && <Check size={11} />}</ToggleBtn>
                  <ToggleBtn active={designTheme === 'dev'}     onClick={() => setDesignTheme('dev')}>{t('menu.development')}{designTheme === 'dev' && <Check size={11} />}</ToggleBtn>
                </DropdownSection>
              )}

              {/* Sign out */}
              <div className="p-1">
                <a
                  href="/api/auth/signout"
                  className="block w-full text-left px-3 py-2 text-sm rounded-lg transition-colors"
                  style={{ color: 'var(--red)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--red-c)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {t('menu.signOut')}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
