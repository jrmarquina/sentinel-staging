'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        padding: '0.45rem 1.1rem',
        background: '#0D1B2E',
        color: '#fff',
        border: 'none',
        borderRadius: 7,
        fontSize: '0.85rem',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      Print / Save PDF
    </button>
  )
}
