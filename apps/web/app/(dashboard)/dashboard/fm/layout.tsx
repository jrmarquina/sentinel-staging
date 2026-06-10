import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Facilities Management — SIMS',
    template: '%s — SIMS',
  },
}

export default function FMLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="fm-shell h-full" style={{ minHeight: '100%' }}>
      {children}
    </div>
  )
}
