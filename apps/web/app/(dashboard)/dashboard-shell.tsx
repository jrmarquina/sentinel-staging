'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { useDesignTheme } from '@/lib/design-theme'
import type { AppRole } from '@sentinel/shared'

interface DashboardShellProps {
  children:      React.ReactNode
  userEmail?:    string
  userFullName?: string | null
  userAvatar?:   string | null
  /** Passed from server so Sidebar shows real org name without an extra client fetch */
  orgName?:      string | null
  /** Passed from server for initial render; Sidebar/Header also call useRole() client-side */
  userRole?:     AppRole | null
}

export default function DashboardShell({
  children,
  userEmail,
  userFullName,
  userAvatar,
  orgName,
  userRole,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { setDesignTheme } = useDesignTheme()

  // Non-admins are always locked to the dev theme — only admins can switch designs
  useEffect(() => {
    if (userRole !== 'admin') {
      setDesignTheme('dev')
    }
  }, [userRole, setDesignTheme])

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      <Sidebar
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        orgName={orgName ?? undefined}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          userEmail={userEmail}
          userFullName={userFullName}
          userAvatar={userAvatar}
          initialRole={userRole}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6" style={{ background: 'var(--bg)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
