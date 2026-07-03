import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { AppProviders } from '@/components/providers/AppProviders'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'SIMS — Sentinel Infrastructure Management System',
  description: 'Sentinel Infrastructure Management System — Guaynabo, Puerto Rico',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SIMS',
  },
}

export const viewport: Viewport = {
  themeColor: '#0D1B2E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

// Inline script: reads localStorage before first paint to prevent FOUC
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('sentinel-theme');
    if (t === 'light') { document.documentElement.classList.remove('dark'); }
    else { document.documentElement.classList.add('dark'); }
    var l = localStorage.getItem('sentinel-locale') || 'en';
    document.documentElement.setAttribute('lang', l);
    var d = localStorage.getItem('sentinel-design');
    if (d === 'classic') { document.documentElement.classList.remove('design-dev'); }
    else { document.documentElement.classList.add('design-dev'); }
  } catch(e) {
    document.documentElement.classList.add('dark');
  }
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className="font-sans antialiased bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
        <AppProviders>
          {children}
        </AppProviders>
      </body>
    </html>
  )
}
