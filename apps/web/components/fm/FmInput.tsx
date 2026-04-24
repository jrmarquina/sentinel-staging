'use client'

import { cn } from '@/lib/utils'

interface FmInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

interface FmSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  children: React.ReactNode
}

interface FmTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

function FieldWrapper({ label, error, hint, required, children }: {
  label?: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {label && (
        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'flex', gap: '0.2rem' }}>
          {label}
          {required && <span style={{ color: 'var(--red)' }}>*</span>}
        </label>
      )}
      {children}
      {error && <p style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{error}</p>}
      {hint && !error && <p style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{hint}</p>}
    </div>
  )
}

export function FmInput({ label, error, hint, className, ...props }: FmInputProps) {
  return (
    <FieldWrapper label={label} error={error} hint={hint} required={props.required}>
      <input
        {...props}
        className={cn('fm-input', error && '!border-[var(--red)]', className)}
      />
    </FieldWrapper>
  )
}

export function FmSelect({ label, error, hint, children, className, ...props }: FmSelectProps) {
  return (
    <FieldWrapper label={label} error={error} hint={hint} required={props.required}>
      <select
        {...props}
        className={cn('fm-input', error && '!border-[var(--red)]', className)}
        style={{
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.75rem center',
          paddingRight: '2.5rem',
        }}
      >
        {children}
      </select>
    </FieldWrapper>
  )
}

export function FmTextarea({ label, error, hint, className, ...props }: FmTextareaProps) {
  return (
    <FieldWrapper label={label} error={error} hint={hint} required={props.required}>
      <textarea
        {...props}
        className={cn('fm-input resize-none', error && '!border-[var(--red)]', className)}
        rows={props.rows ?? 3}
      />
    </FieldWrapper>
  )
}
