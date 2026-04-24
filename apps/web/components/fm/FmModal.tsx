'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FmModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  maxWidth?: string
}

export function FmModal({ open, onClose, title, subtitle, children, maxWidth = 'max-w-lg' }: FmModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    if (open) setTimeout(() => panelRef.current?.focus(), 50)
  }, [open])

  if (!open) return null

  return (
    <div className="fm-modal-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn('fm-modal-panel outline-none', maxWidth)}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--fg)', lineHeight: 1.3 }}>
              {title}
            </h2>
            {subtitle && (
              <p style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              flexShrink: 0,
              padding: '0.4rem',
              background: 'var(--card-b)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--red)'
              e.currentTarget.style.borderColor = 'var(--red)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--muted)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}

export function FmModalDivider() {
  return <div style={{ height: '1px', background: 'var(--border)', margin: '1.25rem 0' }} />
}

export function FmModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      justifyContent: 'flex-end',
      paddingTop: '1.5rem',
      borderTop: '1px solid var(--border)',
      marginTop: '1.5rem',
    }}>
      {children}
    </div>
  )
}
