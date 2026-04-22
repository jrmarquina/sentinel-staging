'use client'

import { useState, useTransition } from 'react'
import { Users, Shield, ChevronDown, UserPlus, X, Mail, KeyRound, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { createTeamMember } from './actions'

const ROLES = ['admin', 'supervisor', 'inspector', 'vendor', 'viewer'] as const
type AppRole = typeof ROLES[number]

const ROLE_LABEL: Record<AppRole, string> = {
  admin:      'Administrator',
  supervisor: 'Supervisor',
  inspector:  'Inspector',
  vendor:     'Vendor',
  viewer:     'Viewer',
}

const ROLE_COLOR: Record<AppRole, string> = {
  admin:      'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  supervisor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  inspector:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  vendor:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  viewer:     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

interface Member {
  user_id:    string
  role:       string
  joined_at:  string
  full_name:  string
  avatar_url: string | null
  is_me:      boolean
}

interface Props {
  team:        Member[]
  currentRole: string
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) return <img src={url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 select-none">
      {initials}
    </div>
  )
}

function RoleDropdown({ member, canEdit, onChanged }: {
  member: Member
  canEdit: boolean
  onChanged: (userId: string, newRole: AppRole) => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const supabase = createClient()
  const router = useRouter()

  async function changeRole(newRole: AppRole) {
    setOpen(false)
    if (newRole === member.role) return
    startTransition(async () => {
      await supabase
        .from('user_roles')
        .update({ role: newRole as string })
        .eq('user_id', member.user_id)
      onChanged(member.user_id, newRole)
      router.refresh()
    })
  }

  const role = member.role as AppRole

  if (!canEdit || member.is_me) {
    return (
      <span className={cn('text-xs px-2.5 py-1 rounded-full font-semibold', ROLE_COLOR[role] ?? ROLE_COLOR.viewer)}>
        {ROLE_LABEL[role] ?? role}
        {member.is_me && <span className="ml-1 opacity-60">(you)</span>}
      </span>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={cn(
          'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold transition-opacity',
          ROLE_COLOR[role] ?? ROLE_COLOR.viewer,
          pending && 'opacity-50'
        )}
      >
        {ROLE_LABEL[role] ?? role}
        <ChevronDown size={11} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden py-1">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => changeRole(r)}
              className={cn(
                'w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
                r === role ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-700 dark:text-slate-300'
              )}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AddMemberModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [role, setRole] = useState<AppRole>('viewer')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const res = await createTeamMember(email.trim(), password, name.trim(), role)
      if (res.error) { setError(res.error); return }
      onSuccess()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Add Team Member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Full name</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email address</label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
            <div className="relative">
              <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPwd ? 'text' : 'password'} required minLength={6}
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full pl-8 pr-9 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowPwd(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as AppRole)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300">Cancel</button>
            <button type="submit" disabled={pending} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
              {pending ? 'Creating…' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function TeamClient({ team: initialTeam, currentRole }: Props) {
  const router = useRouter()
  const [team, setTeam] = useState(initialTeam)
  const [showInvite, setShowInvite] = useState(false)
  const canEdit = currentRole === 'admin'

  function handleRoleChanged(userId: string, newRole: AppRole) {
    setTeam((prev) => prev.map((m) => m.user_id === userId ? { ...m, role: newRole } : m))
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-lg bg-blue-600/10 flex items-center justify-center flex-shrink-0">
          <Users size={18} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Team</h1>
          <p className="text-sm text-slate-500">{team.length} member{team.length !== 1 ? 's' : ''} · Guaynabo Public Works</p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {canEdit && (
            <>
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg">
                <Shield size={12} />
                Admin — role changes are live
              </div>
              <button
                onClick={() => setShowInvite(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <UserPlus size={14} />
                Invite
              </button>
            </>
          )}
        </div>
      </div>

      {/* Member list */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {team.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-400 text-sm">
            No team members yet.{canEdit && <> <button onClick={() => setShowInvite(true)} className="text-blue-600 hover:underline">Invite the first member →</button></>}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {team.map((member) => (
              <li key={member.user_id} className="flex items-center gap-4 px-5 py-3.5">
                <Avatar name={member.full_name} url={member.avatar_url} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {member.full_name}
                    {member.is_me && <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Joined {new Date(member.joined_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <RoleDropdown member={member} canEdit={canEdit} onChanged={handleRoleChanged} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Role reference */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Role Permissions</p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {[
            { role: 'admin',      desc: 'Full access — manage team, all records, settings' },
            { role: 'supervisor', desc: 'Create & edit all work records, assign work orders' },
            { role: 'inspector',  desc: 'Complete inspections, update assigned work orders' },
            { role: 'vendor',     desc: 'View assigned work orders and update status only' },
            { role: 'viewer',     desc: 'Read-only access to all records' },
          ].map(({ role, desc }) => (
            <div key={role} className="flex items-start gap-2.5">
              <span className={cn('mt-0.5 text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0', ROLE_COLOR[role as AppRole])}>
                {ROLE_LABEL[role as AppRole]}
              </span>
              <span className="text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {showInvite && (
        <AddMemberModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => { setShowInvite(false); router.refresh() }}
        />
      )}
    </div>
  )
}
