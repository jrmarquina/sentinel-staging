'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        background: '#3b82f6', color: '#fff', border: 'none',
        borderRadius: 6, padding: '0.45rem 1rem',
        fontSize: '0.875rem', fontWeight: 600,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
      }}
    >
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M6 9V2h12v7" /><rect x="6" y="14" width="12" height="8" rx="1" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      </svg>
      Print / Save PDF
    </button>
  )
}
