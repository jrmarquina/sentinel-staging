import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/get-session'
import DashboardShell from './dashboard-shell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  if (!session) {
    redirect('/login')
  }

  return (
    <DashboardShell
      userEmail={session.email}
      userFullName={session.fullName}
      userAvatar={session.avatarUrl}
      userRole={session.role}
      orgName={session.orgName}
    >
      {children}
    </DashboardShell>
  )
}
