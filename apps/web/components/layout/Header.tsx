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
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 lg:px-6 flex-shrink-0 relative z-30">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
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
            className="flex items-center gap-2 p-1.5 pr-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {userAvatar ? (
              <img src={userAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                {initials}
              </div>
            )}
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-none truncate max-w-[130px]">
                {userFullName || userEmail}
              </p>
              <p className="text-xs text-slate-400 leading-none mt-0.5">
                {role ? ROLE_LABELS[role] : '…'}
              </p>
            </div>
            <ChevronDown size={14} className={cn('text-slate-400 transition-transform flex-shrink-0', open && 'rotate-180')} />
          </button>

          {/* Dropdown panel */}
          {open && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
              {/* User info */}
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                {userFullName && (
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{userFullName}</p>
                )}
                <p className={`text-xs truncate ${userFullName ? 'text-slate-400' : 'font-semibold text-slate-900 dark:text-white'}`}>{userEmail}</p>
                <p className="text-xs text-slate-400 mt-0.5">{role ? ROLE_LABELS[role] : ''}</p>
              </div>

              {/* Edit profile */}
              <div className="p-1 border-b border-slate-100 dark:border-slate-800">
                <Link
                  href="/dashboard/profile"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <UserCircle size={14} className="text-slate-400" />
                  Edit Profile
                </Link>
              </div>

              {/* Appearance */}
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  {t('menu.appearance')}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTheme('light')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      theme === 'light'
                        ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/40 dark:border-blue-600 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    )}
                  >
                    <Sun size={13} />
                    {t('menu.light')}
                    {theme === 'light' && <Check size={11} className="ml-0.5" />}
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      theme === 'dark'
                        ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/40 dark:border-blue-600 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    )}
                  >
                    <Moon size={13} />
                    {t('menu.dark')}
                    {theme === 'dark' && <Check size={11} className="ml-0.5" />}
                  </button>
                </div>
              </div>

              {/* Language */}
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  {t('menu.language')}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLocale('en')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      locale === 'en'
                        ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/40 dark:border-blue-600 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    )}
                  >
                    <Globe size={13} />
                    EN
                    {locale === 'en' && <Check size={11} className="ml-0.5" />}
                  </button>
                  <button
                    onClick={() => setLocale('es')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      locale === 'es'
                        ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/40 dark:border-blue-600 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    )}
                  >
                    <Globe size={13} />
                    ES
                    {locale === 'es' && <Check size={11} className="ml-0.5" />}
                  </button>
                </div>
              </div>

              {/* Module — admin only */}
              {isAdmin && (
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Module
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAppMode('pw')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                        appMode === 'pw'
                          ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/40 dark:border-blue-600 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      )}
                    >
                      Public Works
                      {appMode === 'pw' && <Check size={11} className="ml-0.5" />}
                    </button>
                    <button
                      onClick={() => setAppMode('fm')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                        appMode === 'fm'
                          ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/40 dark:border-blue-600 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      )}
                    >
                      Facility Mgmt
                      {appMode === 'fm' && <Check size={11} className="ml-0.5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Design — admin only */}
              {isAdmin && (
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    {t('menu.design')}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDesignTheme('classic')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                        designTheme === 'classic'
                          ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/40 dark:border-blue-600 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      )}
                    >
                      {t('menu.classic')}
                      {designTheme === 'classic' && <Check size={11} className="ml-0.5" />}
                    </button>
                    <button
                      onClick={() => setDesignTheme('dev')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                        designTheme === 'dev'
                          ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/40 dark:border-blue-600 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      )}
                    >
                      {t('menu.development')}
                      {designTheme === 'dev' && <Check size={11} className="ml-0.5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Sign out — plain link to avoid server-action bundle-mismatch on redeploy */}
              <div className="p-1">
                <a
                  href="/api/auth/signout"
                  className="block w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
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
