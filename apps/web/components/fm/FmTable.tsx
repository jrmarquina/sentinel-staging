'use client'

import { cn } from '@/lib/utils'

interface Column<T> {
  key: string
  label: string
  width?: string
  align?: 'left' | 'right' | 'center'
  render: (row: T, index: number) => React.ReactNode
}

interface FmTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  onRowClick?: (row: T) => void
  emptyMessage?: string
  className?: string
}

export function FmTable<T>({
  columns, data, keyExtractor, onRowClick,
  emptyMessage = 'No records found.',
  className,
}: FmTableProps<T>) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="fm-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ width: col.width, textAlign: col.align ?? 'left' }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)', fontSize: '0.875rem' }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={keyExtractor(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={{ cursor: onRowClick ? 'pointer' : 'default' }}
              >
                {columns.map((col) => (
                  <td key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                    {col.render(row, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function FmSectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
      <span className="fm-label">{children}</span>
      {action}
    </div>
  )
}
