/**
 * FM Layout Wrapper
 *
 * Applies the `.fm-shell` dark glassmorphism token scope to all FM pages.
 * This wrapper sits inside the outer DashboardShell (which renders the
 * shared Sidebar and Header) — those stay exactly as-is, using PW design
 * tokens. Only the FM content area goes dark.
 *
 * No PW pages are affected; this layout only applies to /dashboard/fm/*.
 */
export default function FMLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="fm-shell h-full" style={{ minHeight: '100%' }}>
      {children}
    </div>
  )
}
