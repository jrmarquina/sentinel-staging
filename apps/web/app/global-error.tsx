'use client'

import { useEffect } from 'react'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Root error boundary — catches errors that escape all nested error.tsx files.
 * Replaces the default Next.js "Application error" page.
 * Must include its own <html> and <body> since it replaces the root layout.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <html lang="en" className="dark">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0f172a', color: '#f1f5f9' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Application Error
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1rem' }}>
              An unexpected error occurred. Open the browser console for details.
            </p>

            {error.message && (
              <pre style={{
                fontSize: '0.75rem', textAlign: 'left',
                background: '#1e293b', padding: '0.75rem', borderRadius: '0.5rem',
                overflow: 'auto', maxHeight: '10rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                marginBottom: '1.5rem', color: '#fca5a5',
              }}>
                {error.message}
                {error.digest ? `\n\nDigest: ${error.digest}` : ''}
              </pre>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{
                  padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600,
                  background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer',
                }}
              >
                Try again
              </button>
              <a
                href="/"
                style={{
                  padding: '0.5rem 1rem', fontSize: '0.875rem',
                  border: '1px solid #334155', color: '#cbd5e1', borderRadius: '0.5rem', textDecoration: 'none',
                }}
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
