'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit2, KeyRound, Trash2, X, Eye, EyeOff, Shield, ChevronDown, History, HardDrive, AlertTriangle, CheckCircle2, Loader2, Maximize2 } from 'lucide-react'
import { format, parseISO, isToday, isYesterday, formatDistanceToNow } from 'date-fns'
import type { BackupFile } from '@/app/api/admin/backups/route'
import { SystemHealthOverlay } from '@/components/settings/SystemHealthOverlay'
import { createUser, updateUser, resetUserPassword, deleteUser } from './actions'
import { DevThemeCustomiser } from '@/components/settings/DevThemeCustomiser'

// ── Constants ──────────────────────────────────────────────────────────────

const ROLES = ['admin', 'supervisor', 'inspector', 'vendor', 'viewer'] as const
type AppRole = typeof ROLES[number]

const ROLE_LABEL: Record<AppRole, string> = {
  admin:      'Administrator',
  supervisor: 'Supervisor',
  inspector:  'Inspector',
  vendor:     'Vendor',
  viewer:     'Viewer',
}

const ROLE_DESC: Record<AppRole, string> = {
  admin:      'God mode — unrestricted access to all records, settings, team, and modules',
  supervisor: 'Manage work orders and inspections, assign tasks, edit all operational records',
  inspector:  'Run inspections, complete checklists, update assigned work orders',
  vendor:     'View and update assigned work orders only — no other access',
  viewer:     'Read-only access to all records — no create, edit, or delete',
}

const ROLE_COLOR: Record<AppRole, string> = {
  admin:      'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  supervisor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  inspector:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  vendor:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  viewer:     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Member {
  id:         string
  full_name:  string
  email:      string
  role:       string
  avatar_url: string | null
  created_at: string
  is_me:      boolean
}

export interface AuditEntry {
  id:         string
  user_id:    string | null
  user_name:  string
  action:     string
  table_name: string
  record_id:  string
  old_data:   Record<string, unknown> | null
  new_data:   Record<string, unknown> | null
  created_at: string
}

// ── Shared UI pieces ───────────────────────────────────────────────────────

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return <img src={url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
  }
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 select-none">
      {initials}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${ROLE_COLOR[role as AppRole] ?? ROLE_COLOR.viewer}`}>
      {ROLE_LABEL[role as AppRole] ?? role}
    </span>
  )
}

function PasswordInput({ value, onChange, placeholder }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  const strength = value.length === 0 ? null : value.length < 8 ? 'weak' : value.length < 12 ? 'fair' : 'strong'
  const strengthColor = { weak: 'bg-red-500', fair: 'bg-amber-500', strong: 'bg-emerald-500' }
  const strengthLabel = { weak: 'Too short', fair: 'Fair', strong: 'Strong' }

  return (
    <div>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'Password'}
          className="w-full px-3 py-2 pr-9 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          tabIndex={-1}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {strength && (
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex gap-0.5 flex-1">
            {['weak', 'fair', 'strong'].map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  ['weak', 'fair', 'strong'].indexOf(strength) >= i
                    ? strengthColor[strength]
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] text-slate-400">{strengthLabel[strength]}</span>
        </div>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  )
}

function RoleSelect({ value, onChange, disabled }: {
  value: AppRole; onChange: (v: AppRole) => void; disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as AppRole)}
      disabled={disabled}
      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
      ))}
    </select>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
      {msg}
    </p>
  )
}

function ModalActions({ onCancel, onConfirm, confirmLabel, confirmClass, pending }: {
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  confirmClass: string
  pending: boolean
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        onClick={onCancel}
        className="flex-1 px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300"
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={pending}
        className={`flex-1 px-4 py-2 text-sm text-white font-semibold rounded-lg transition-colors disabled:opacity-50 ${confirmClass}`}
      >
        {pending ? '…' : confirmLabel}
      </button>
    </div>
  )
}

// ── Audit log helpers ──────────────────────────────────────────────────────

const ACTION_COLOR: Record<string, string> = {
  INSERT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

const TABLE_LABEL: Record<string, string> = {
  work_orders:               'Work Order',
  projects:                  'Project',
  contracts:                 'Contract',
  pothole_reports:           'Pothole',
  inspections:               'Inspection',
  inspection_checklist_items:'Checklist Item',
  profiles:                  'Profile',
  user_roles:                'User Role',
  organizations:             'Organization',
  attachments:               'Attachment',
  contract_bids:             'Bid',
  locations:                 'Location',
}

function formatDayLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEEE, MMMM d, yyyy')
}

function diffSummary(old_data: Record<string, unknown> | null, new_data: Record<string, unknown> | null): string[] {
  if (!old_data || !new_data) return []
  const changes: string[] = []
  const keys = new Set([...Object.keys(old_data), ...Object.keys(new_data)])
  const skip = new Set(['updated_at', 'created_at', 'deleted_at'])
  for (const k of keys) {
    if (skip.has(k)) continue
    const ov = old_data[k]
    const nv = new_data[k]
    if (JSON.stringify(ov) !== JSON.stringify(nv)) {
      const label = k.replace(/_/g, ' ')
      const oldStr = ov == null ? '—' : String(ov).slice(0, 40)
      const newStr = nv == null ? '—' : String(nv).slice(0, 40)
      changes.push(`${label}: ${oldStr} → ${newStr}`)
    }
  }
  return changes
}

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false)
  const changes = diffSummary(entry.old_data, entry.new_data)
  const hasDetails = changes.length > 0 || entry.old_data || entry.new_data

  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <button
        onClick={() => hasDetails && setOpen((v) => !v)}
        className={`w-full flex items-start gap-3 px-5 py-3 text-left transition-colors ${hasDetails ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer' : 'cursor-default'}`}
      >
        <span className={`mt-0.5 flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${ACTION_COLOR[entry.action] ?? 'bg-slate-100 text-slate-600'}`}>
          {entry.action}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-700 dark:text-slate-300">
            <span className="font-semibold">{entry.user_name}</span>
            {' '}
            {entry.action === 'INSERT' ? 'created' : entry.action === 'DELETE' ? 'deleted' : 'updated'} a{' '}
            <span className="font-medium">{TABLE_LABEL[entry.table_name] ?? entry.table_name}</span>
          </p>
          {changes.length > 0 && !open && (
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">{changes[0]}{changes.length > 1 ? ` +${changes.length - 1} more` : ''}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-slate-400">{format(parseISO(entry.created_at), 'h:mm a')}</span>
          {hasDetails && <ChevronDown size={12} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-3 pt-0 ml-[52px]">
          {changes.length > 0 ? (
            <ul className="space-y-0.5">
              {changes.map((c, i) => (
                <li key={i} className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{c}</li>
              ))}
            </ul>
          ) : (
            <pre className="text-[10px] text-slate-400 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(entry.new_data ?? entry.old_data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function AuditLogSection({ entries }: { entries: AuditEntry[] }) {
  const [open, setOpen] = useState(false)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  // Group by day
  const byDay = entries.reduce<Record<string, AuditEntry[]>>((acc, e) => {
    const day = e.created_at.slice(0, 10)
    ;(acc[day] ??= []).push(e)
    return acc
  }, {})
  const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a))

  function toggleDay(day: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      next.has(day) ? next.delete(day) : next.add(day)
      return next
    })
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History size={15} className="text-slate-400" />
          <span className="text-sm font-bold text-slate-900 dark:text-white">Audit Log</span>
          <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{entries.length}</span>
        </div>
        <ChevronDown size={15} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          {days.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">No activity recorded yet.</p>
          ) : days.map((day) => (
            <div key={day}>
              {/* Day header */}
              <button
                onClick={() => toggleDay(day)}
                className="w-full flex items-center justify-between px-5 py-2 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {formatDayLabel(byDay[day][0].created_at)}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">{byDay[day].length} event{byDay[day].length !== 1 ? 's' : ''}</span>
                  <ChevronDown size={11} className={`text-slate-400 transition-transform ${expandedDays.has(day) ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {expandedDays.has(day) && (
                <div>
                  {byDay[day].map((entry) => (
                    <AuditEntryRow key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Backup status section ──────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function BackupStatusSection() {
  const [open,      setOpen]      = useState(false)
  const [overlay,   setOverlay]   = useState(false)
  const [files,     setFiles]     = useState<BackupFile[] | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!open || files !== null) return
    setLoading(true)
    fetch('/api/admin/backups')
      .then((r) => r.json())
      .then((d) => { setFiles(d.files ?? []); setError(d.error ?? null) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, files])

  const lastFile   = files?.[0] ?? null
  const lastDate   = lastFile ? parseISO(lastFile.date) : null
  const ageHours   = lastDate ? (Date.now() - lastDate.getTime()) / 3_600_000 : null
  const healthColor =
    ageHours === null  ? 'bg-slate-300 dark:bg-slate-600' :
    ageHours < 25      ? 'bg-emerald-500' :
    ageHours < 49      ? 'bg-amber-500' :
                         'bg-red-500'
  const healthLabel =
    ageHours === null  ? 'Unknown' :
    ageHours < 25      ? 'Healthy' :
    ageHours < 49      ? 'Delayed' :
                         'Overdue'

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center border-b border-transparent">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left"
        >
          <HardDrive size={15} className="text-slate-400" />
          <span className="text-sm font-bold text-slate-900 dark:text-white">Backups &amp; System Health</span>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${healthColor}`} title={healthLabel} />
          {lastDate && (
            <span className="text-xs text-slate-400">
              Last backup {formatDistanceToNow(lastDate, { addSuffix: true })}
            </span>
          )}
          <ChevronDown size={15} className={`text-slate-400 transition-transform ml-auto ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={() => setOverlay(true)}
          title="Open full-screen system health"
          className="px-4 py-4 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border-l border-slate-100 dark:border-slate-800 flex-shrink-0"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      {/* Full-screen overlay */}
      {overlay && <SystemHealthOverlay onClose={() => setOverlay(false)} />}

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800">

          {/* Health summary row */}
          <div className="flex items-center gap-4 px-5 py-3 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${
              healthColor === 'bg-emerald-500' ? 'text-emerald-600 dark:text-emerald-400' :
              healthColor === 'bg-amber-500'   ? 'text-amber-600 dark:text-amber-400' :
              healthColor === 'bg-red-500'     ? 'text-red-600 dark:text-red-400' :
                                                 'text-slate-500'
            }`}>
              {healthColor === 'bg-emerald-500' ? <CheckCircle2 size={13} /> :
               healthColor === 'bg-red-500'     ? <AlertTriangle size={13} /> :
                                                   <AlertTriangle size={13} />}
              {healthLabel}
            </div>
            {lastDate && (
              <span className="text-xs text-slate-400">
                Last successful backup: {format(lastDate, 'MMM d, yyyy')} at {format(lastDate, 'HH:mm')} UTC
              </span>
            )}
            {files !== null && (
              <span className="ml-auto text-[10px] text-slate-400">
                {files.filter(f => f.type === 'daily').length} daily · {files.filter(f => f.type === 'monthly').length} monthly
              </span>
            )}
          </div>

          {/* Loading / error */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 size={14} className="animate-spin" /> Loading backup list…
            </div>
          )}
          {error && !loading && (
            <div className="px-5 py-4 text-sm text-red-500">{error}</div>
          )}

          {/* Backup list */}
          {!loading && files !== null && files.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-400">No backups found in B2.</p>
          )}

          {!loading && files && files.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-2">Date &amp; Time</th>
                    <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-2">Environment</th>
                    <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-2">Type</th>
                    <th className="text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-2">Size</th>
                    <th className="text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-2 hidden md:table-cell">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                  {files.map((f) => {
                    const d = parseISO(f.date)
                    const dayLabel = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMM d, yyyy')
                    return (
                      <tr key={`${f.env}-${f.name}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-2.5">
                          <p className="font-medium text-slate-700 dark:text-slate-300">{dayLabel}</p>
                          <p className="text-[10px] text-slate-400">{format(d, 'HH:mm')} UTC</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            f.env === 'prod'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          }`}>
                            {f.env === 'prod' ? 'Production' : 'Staging'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            f.type === 'monthly'
                              ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                            {f.type === 'monthly' ? 'Monthly' : 'Daily'}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-right text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatBytes(f.size)}
                        </td>
                        <td className="px-5 py-2.5 text-right text-slate-400 hidden md:table-cell">
                          {formatDistanceToNow(d, { addSuffix: true })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function SettingsClient({ members: initialMembers, auditLog = [] }: { members: Member[]; auditLog?: AuditEntry[] }) {
  const router = useRouter()
  const [members, setMembers] = useState(initialMembers)
  const [modal, setModal] = useState<'create' | 'edit' | 'password' | 'delete' | null>(null)
  const [target, setTarget] = useState<Member | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  // Create form state
  const [cName,     setCName]     = useState('')
  const [cEmail,    setCEmail]    = useState('')
  const [cPassword, setCPassword] = useState('')
  const [cRole,     setCRole]     = useState<AppRole>('viewer')

  // Edit form state
  const [eName,  setEName]  = useState('')
  const [eEmail, setEEmail] = useState('')
  const [eRole,  setERole]  = useState<AppRole>('viewer')

  // Password reset state
  const [newPwd, setNewPwd] = useState('')

  // ── Modal openers ─────────────────────────────────────────────────────────

  function openCreate() {
    setCName(''); setCEmail(''); setCPassword(''); setCRole('viewer')
    setError(''); setModal('create')
  }

  function openEdit(m: Member) {
    setTarget(m); setEName(m.full_name); setEEmail(m.email); setERole(m.role as AppRole)
    setError(''); setModal('edit')
  }

  function openPassword(m: Member) {
    setTarget(m); setNewPwd(''); setError(''); setModal('password')
  }

  function openDelete(m: Member) {
    setTarget(m); setError(''); setModal('delete')
  }

  function closeModal() { setModal(null); setTarget(null); setError('') }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleCreate() {
    if (!cName.trim() || !cEmail.trim() || !cPassword.trim()) {
      setError('All fields are required.')
      return
    }
    if (cPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    startTransition(async () => {
      const res = await createUser({ email: cEmail, full_name: cName, password: cPassword, role: cRole })
      if (res.error) { setError(res.error); return }
      closeModal()
      router.refresh()
    })
  }

  function handleEdit() {
    if (!eName.trim())  { setError('Name is required.'); return }
    if (!eEmail.trim()) { setError('Email is required.'); return }
    if (!target) return
    startTransition(async () => {
      const res = await updateUser({ userId: target.id, full_name: eName, email: eEmail, role: eRole })
      if (res.error) { setError(res.error); return }
      setMembers((prev) => prev.map((m) => m.id === target.id ? { ...m, full_name: eName, email: eEmail, role: eRole } : m))
      closeModal()
    })
  }

  function handlePassword() {
    if (newPwd.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (!target) return
    startTransition(async () => {
      const res = await resetUserPassword({ userId: target.id, password: newPwd })
      if (res.error) { setError(res.error); return }
      closeModal()
    })
  }

  function handleDelete() {
    if (!target) return
    startTransition(async () => {
      const res = await deleteUser({ userId: target.id })
      if (res.error) { setError(res.error); return }
      setMembers((prev) => prev.filter((m) => m.id !== target.id))
      closeModal()
    })
  }

  // ── Role summary counts ───────────────────────────────────────────────────

  const roleCounts = ROLES.reduce<Record<string, number>>((acc, r) => {
    acc[r] = members.filter((m) => m.role === r).length
    return acc
  }, {} as Record<string, number>)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage user accounts, roles, and access for your organization.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg flex-shrink-0">
          <Shield size={12} />
          Admin only
        </div>
      </div>

      {/* System Health panel */}
      <BackupStatusSection />

      {/* Role summary tiles */}
      <div className="grid grid-cols-5 gap-2">
        {ROLES.map((r) => (
          <div
            key={r}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center"
          >
            <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">
              {roleCounts[r]}
            </p>
            <span className={`inline-block mt-2 text-[9px] px-2 py-0.5 rounded-full font-semibold ${ROLE_COLOR[r]}`}>
              {ROLE_LABEL[r]}
            </span>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">

        {/* Table header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">User Accounts</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {members.length} account{members.length !== 1 ? 's' : ''} · Guaynabo Public Works
            </p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Plus size={13} />
            Add User
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-2.5 w-[45%]">
                  User
                </th>
                <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-2.5">
                  Role
                </th>
                <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-2.5 hidden md:table-cell">
                  Joined
                </th>
                <th className="text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-2.5">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">

                  {/* User cell */}
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.full_name} url={m.avatar_url} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {m.full_name}
                          {m.is_me && (
                            <span className="ml-1.5 text-[10px] font-normal text-slate-400">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{m.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Role cell */}
                  <td className="px-3 py-3">
                    <RoleBadge role={m.role} />
                  </td>

                  {/* Joined cell */}
                  <td className="px-3 py-3 hidden md:table-cell">
                    <span className="text-xs text-slate-400">
                      {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </span>
                  </td>

                  {/* Actions cell */}
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={() => openEdit(m)}
                        title="Edit name or role"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => openPassword(m)}
                        title="Reset password"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                      >
                        <KeyRound size={13} />
                      </button>
                      {!m.is_me && (
                        <button
                          onClick={() => openDelete(m)}
                          title="Delete user"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {members.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-sm text-slate-400">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role hierarchy reference */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-slate-900 dark:text-white">Role Hierarchy</p>
        </div>
        <div className="p-5 space-y-3">
          {ROLES.map((role) => (
            <div key={role} className="flex items-start gap-3">
              <span className={`flex-shrink-0 mt-0.5 text-[10px] px-2 py-0.5 rounded-full font-semibold ${ROLE_COLOR[role]}`}>
                {ROLE_LABEL[role]}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {ROLE_DESC[role]}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Audit log */}
      <AuditLogSection entries={auditLog} />

      {/* Backups & system health — moved to top */}

      {/* Development view colour customisation — admin only */}
      <DevThemeCustomiser />

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {/* Create user */}
      {modal === 'create' && (
        <Modal title="Add New User" onClose={closeModal}>
          <Field label="Full Name">
            <TextInput value={cName} onChange={setCName} placeholder="e.g. Carlos Vélez" />
          </Field>
          <Field label="Email Address">
            <TextInput value={cEmail} onChange={setCEmail} placeholder="user@guaynabo.pr.gov" type="email" />
          </Field>
          <Field label="Temporary Password" hint="User can change this after first login.">
            <PasswordInput value={cPassword} onChange={setCPassword} placeholder="Minimum 8 characters" />
          </Field>
          <Field label="Role">
            <RoleSelect value={cRole} onChange={setCRole} />
            <p className="text-[10px] text-slate-400 mt-1">{ROLE_DESC[cRole]}</p>
          </Field>
          <ErrorMsg msg={error} />
          <ModalActions
            onCancel={closeModal}
            onConfirm={handleCreate}
            confirmLabel="Create User"
            confirmClass="bg-blue-600 hover:bg-blue-700"
            pending={pending}
          />
        </Modal>
      )}

      {/* Edit user */}
      {modal === 'edit' && target && (
        <Modal title="Edit User" onClose={closeModal}>
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
            <Avatar name={target.full_name} url={target.avatar_url} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{target.full_name}</p>
              <p className="text-xs text-slate-400 truncate">{target.email}</p>
            </div>
          </div>
          <Field label="Full Name">
            <TextInput value={eName} onChange={setEName} placeholder="Full name" />
          </Field>
          <Field label="Email / Username">
            <TextInput value={eEmail} onChange={setEEmail} placeholder="user@example.com" type="email" />
          </Field>
          <Field
            label="Role"
            hint={target.is_me ? 'You cannot change your own role.' : ROLE_DESC[eRole]}
          >
            <RoleSelect value={eRole} onChange={setERole} disabled={target.is_me} />
          </Field>
          <ErrorMsg msg={error} />
          <ModalActions
            onCancel={closeModal}
            onConfirm={handleEdit}
            confirmLabel="Save Changes"
            confirmClass="bg-blue-600 hover:bg-blue-700"
            pending={pending}
          />
        </Modal>
      )}

      {/* Reset password */}
      {modal === 'password' && target && (
        <Modal title="Reset Password" onClose={closeModal}>
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
            <Avatar name={target.full_name} url={target.avatar_url} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{target.full_name}</p>
              <p className="text-xs text-slate-400 truncate">{target.email}</p>
            </div>
          </div>
          <Field label="New Password" hint="The user can log in immediately with this password.">
            <PasswordInput value={newPwd} onChange={setNewPwd} placeholder="Minimum 8 characters" />
          </Field>
          <ErrorMsg msg={error} />
          <ModalActions
            onCancel={closeModal}
            onConfirm={handlePassword}
            confirmLabel="Reset Password"
            confirmClass="bg-amber-600 hover:bg-amber-700"
            pending={pending}
          />
        </Modal>
      )}

      {/* Delete user */}
      {modal === 'delete' && target && (
        <Modal title="Delete User" onClose={closeModal}>
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl">
            <Avatar name={target.full_name} url={target.avatar_url} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{target.full_name}</p>
              <p className="text-xs text-slate-400 truncate">{target.email}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            This will permanently remove this account and revoke all access.
            Work orders, inspections, and audit history linked to this user will be preserved.
          </p>
          <ErrorMsg msg={error} />
          <ModalActions
            onCancel={closeModal}
            onConfirm={handleDelete}
            confirmLabel="Delete User"
            confirmClass="bg-red-600 hover:bg-red-700"
            pending={pending}
          />
        </Modal>
      )}
    </div>
  )
}
