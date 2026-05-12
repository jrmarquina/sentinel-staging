'use client'

import { useState, useTransition } from 'react'
import { Users, Shield, ChevronDown, UserPlus, X, Mail, KeyRound, Eye, EyeOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useFmT } from '@/lib/locale'

// ── Types ──────────────────────────────────────────────────────────────────

type RoleDef = {
  id:               string
  name:             string
  slug:             string
  capability_level: string
  description:      string | null
  color:            string | null
}

type Member = {
  user_id:         string
  full_name:       string
  avatar_url:      string | null
  email:           string | null
  role:            string
  capability:      string
  role_definition: { id: string; name: string; slug: string; capability_level: string } | null
  joined_at:       string
  is_me:           boolean
}

// ── Capability styling ─────────────────────────────────────────────────────

const CAPABILITY_META: Record<string, { label: string; color: string }> = {
  // Org-wide
  org_admin:      { label: 'Administrator',        color: 'bg-violet-500/20 text-violet-300 border border-violet-500/30' },
  // FM capabilities
  fm_manager:     { label: 'FM Manager',           color: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
  fm_viewer:      { label: 'FM Viewer',            color: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' },
  fm_contributor: { label: 'FM Inspector',         color: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
  fm_worker:      { label: 'FM Maintenance',       color: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' },
  // PW capabilities
  pw_manager:     { label: 'PW Manager',           color: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' },
  pw_viewer:      { label: 'PW Viewer',            color: 'bg-sky-500/20 text-sky-300 border border-sky-500/30' },
  pw_worker:      { label: 'PW Field Worker',      color: 'bg-orange-500/20 text-orange-300 border border-orange-500/30' },
}

function capabilityMeta(cap: string) {
  return CAPABILITY_META[cap] ?? { label: cap, color: 'bg-slate-500/20 text-slate-300 border border-slate-500/30' }
}

// ── Avatar ─────────────────────────────────────────────────────────────────

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) return <img src={url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-1 ring-white/10" />
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-9 h-9 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-200 text-xs font-bold flex-shrink-0 select-none">
      {initials}
    </div>
  )
}

// ── Role dropdown ──────────────────────────────────────────────────────────

function CapabilityDropdown({
  member,
  roleDefs,
  onChanged,
}: {
  member:   Member
  roleDefs: RoleDef[]
  onChanged: (userId: string, capability: string, roleDefId: string | null) => void
}) {
  const t = useFmT()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const displayName = member.role_definition?.name ?? capabilityMeta(member.capability).label
  const { color } = capabilityMeta(member.capability)

  if (member.is_me) {
    return (
      <span className={cn('text-xs px-2.5 py-1 rounded-full font-semibold', color)}>
        {displayName}
        <span className="ml-1 opacity-60">{t('team.fm.you')}</span>
      </span>
    )
  }

  async function changeRole(roleDef: RoleDef) {
    setOpen(false)
    if (roleDef.id === member.role_definition?.id) return
    startTransition(async () => {
      await fetch('/api/fm/team', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          user_id:            member.user_id,
          capability:         roleDef.capability_level,
          role_definition_id: roleDef.id,
        }),
      })
      onChanged(member.user_id, roleDef.capability_level, roleDef.id)
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={cn(
          'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold transition-opacity',
          color,
          pending && 'opacity-40'
        )}
      >
        {displayName}
        <ChevronDown size={10} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-[#0d1b2e] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden py-1">
          {roleDefs.map((rd) => {
            const meta = capabilityMeta(rd.capability_level)
            const isActive = rd.id === member.role_definition?.id
            return (
              <button
                key={rd.id}
                onClick={() => changeRole(rd)}
                className={cn(
                  'w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-white/5 transition-colors',
                  isActive && 'bg-white/5'
                )}
              >
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0', meta.color)}>
                  {meta.label}
                </span>
                <span className={cn('text-xs', isActive ? 'text-white font-semibold' : 'text-slate-300')}>
                  {rd.name}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Add member modal ───────────────────────────────────────────────────────

function AddMemberModal({
  roleDefs,
  onClose,
  onSuccess,
}: {
  roleDefs:  RoleDef[]
  onClose:   () => void
  onSuccess: () => void
}) {
  const t = useFmT()
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [roleDefId, setRoleDefId] = useState(roleDefs[0]?.id ?? '')
  const [error, setError]         = useState('')
  const [pending, startTransition] = useTransition()

  const selectedDef = roleDefs.find((r) => r.id === roleDefId)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!selectedDef) { setError('Select a role'); return }

    startTransition(async () => {
      const res = await fetch('/api/fm/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:      email.trim(),
          full_name:  name.trim(),
          role:       'viewer', // PW app_role default — FM access via capability
          capability: selectedDef.capability_level,
          role_definition_id: selectedDef.id,
        }),
      })
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: t('error.generic') }))
        setError(msg ?? t('error.generic'))
        return
      }
      onSuccess()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0d1b2e] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-sm font-bold text-white">{t('team.fm.modal.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">{t('team.fm.form.name')}</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="María Pérez"
              className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">{t('team.fm.form.email')}</label>
            <div className="relative">
              <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="maria@example.com"
                className="w-full pl-8 pr-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Initial password</label>
            <div className="relative">
              <KeyRound size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type={showPwd ? 'text' : 'password'} required minLength={6}
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full pl-8 pr-9 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">{t('team.fm.form.role')}</label>
            <select
              value={roleDefId}
              onChange={(e) => setRoleDefId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {roleDefs.map((rd) => (
                <option key={rd.id} value={rd.id} className="bg-[#0d1b2e]">
                  {rd.name}
                </option>
              ))}
            </select>
            {selectedDef?.description && (
              <p className="mt-1 text-xs text-slate-500">{selectedDef.description}</p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-white/10 rounded-lg hover:bg-white/5 transition-colors text-slate-300">
              {t('cancel')}
            </button>
            <button type="submit" disabled={pending}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
              {pending ? t('team.fm.form.adding') : t('team.fm.form.addBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  members:       Member[]
  roleDefs:      RoleDef[]
  isManager:     boolean
  currentUserId: string
}

export function FmTeamClient({ members: initialMembers, roleDefs, isManager, currentUserId }: Props) {
  const router = useRouter()
  const t = useFmT()
  const [members, setMembers]     = useState(initialMembers)
  const [showInvite, setShowInvite] = useState(false)

  function handleCapabilityChanged(userId: string, capability: string, roleDefId: string | null) {
    setMembers((prev) => prev.map((m) => {
      if (m.user_id !== userId) return m
      const newRoleDef = roleDefId ? roleDefs.find((r) => r.id === roleDefId) ?? null : null
      return {
        ...m,
        capability,
        role_definition: newRoleDef
          ? { id: newRoleDef.id, name: newRoleDef.name, slug: newRoleDef.slug, capability_level: newRoleDef.capability_level }
          : m.role_definition,
      }
    }))
    router.refresh()
  }

  // Group by capability tier for display
  const admins        = members.filter((m) => m.capability === 'org_admin')
  const fmManagers    = members.filter((m) => m.capability === 'fm_manager')
  const fmViewers     = members.filter((m) => m.capability === 'fm_viewer')
  const fmContribs    = members.filter((m) => m.capability === 'fm_contributor')
  const fmWorkers     = members.filter((m) => m.capability === 'fm_worker')
  const pwManagers    = members.filter((m) => m.capability === 'pw_manager')
  const pwViewers     = members.filter((m) => m.capability === 'pw_viewer')
  const pwWorkers     = members.filter((m) => m.capability === 'pw_worker')

  const groups: { label: string; items: Member[] }[] = [
    { label: 'Administrators',   items: admins },
    { label: 'FM Managers',      items: fmManagers },
    { label: 'FM Viewers',       items: fmViewers },
    { label: 'FM Inspectors',    items: fmContribs },
    { label: 'FM Maintenance',   items: fmWorkers },
    { label: 'PW Managers',      items: pwManagers },
    { label: 'PW Viewers',       items: pwViewers },
    { label: 'PW Field Workers', items: pwWorkers },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <Users size={18} className="text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">{t('team.fm.title')}</h1>
          <p className="text-sm text-slate-400">
            {members.length} {members.length !== 1 ? 'members' : 'member'} · Head Start Facility Management
          </p>
        </div>
        {isManager && (
          <div className="flex items-center gap-2 ml-auto">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-white/5 px-3 py-1.5 rounded-lg">
              <Shield size={12} />
              Changes are immediate
            </div>
            <button
              onClick={() => setShowInvite(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <UserPlus size={14} />
              {t('team.fm.addBtn')}
            </button>
          </div>
        )}
      </div>

      {/* Member groups */}
      {members.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-xl px-5 py-12 text-center">
          <Users size={28} className="text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            {t('team.fm.empty')}{' '}
            {isManager && (
              <button onClick={() => setShowInvite(true)} className="text-blue-400 hover:underline">
                {t('team.fm.addBtn')} →
              </button>
            )}
          </p>
        </div>
      ) : (
        groups.map(({ label, items }) => (
          <div key={label} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="px-5 py-2.5 border-b border-white/5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
            </div>
            <ul className="divide-y divide-white/5">
              {items.map((member) => (
                <li key={member.user_id} className="flex items-center gap-4 px-5 py-3.5">
                  <Avatar name={member.full_name} url={member.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {member.full_name}
                      {member.is_me && <span className="ml-2 text-xs font-normal text-slate-500">{t('team.fm.you')}</span>}
                    </p>
                    {member.email && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{member.email}</p>
                    )}
                    <p className="text-xs text-slate-600 mt-0.5">
                      Since {new Date(member.joined_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  {isManager ? (
                    <CapabilityDropdown
                      member={member}
                      roleDefs={roleDefs}
                      onChanged={handleCapabilityChanged}
                    />
                  ) : (
                    <span className={cn(
                      'text-xs px-2.5 py-1 rounded-full font-semibold',
                      capabilityMeta(member.capability).color
                    )}>
                      {member.role_definition?.name ?? capabilityMeta(member.capability).label}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {/* Role reference */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-2.5 border-b border-white/5">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">SIMS Access Levels</p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {[
            { cap: 'org_admin',      desc: 'God mode — full access to all modules, settings, and team management' },
            { cap: 'fm_manager',     desc: 'Full Facilities access: work orders, inspections, properties, team' },
            { cap: 'fm_viewer',      desc: 'Read-only Facilities access — no create, edit, or delete' },
            { cap: 'fm_contributor', desc: 'Run inspections, complete checklists, submit FM work orders' },
            { cap: 'fm_worker',      desc: 'View and update FM work orders assigned to them only' },
            { cap: 'pw_manager',     desc: 'Full Public Works access: work orders, map, contracts, incidents' },
            { cap: 'pw_viewer',      desc: 'Read-only Public Works access — no create, edit, or delete' },
            { cap: 'pw_worker',      desc: 'View and update PW work orders assigned to them only' },
          ].map(({ cap, desc }) => {
            const { label, color } = capabilityMeta(cap)
            return (
              <div key={cap} className="flex items-start gap-2.5">
                <span className={cn('mt-0.5 text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0', color)}>
                  {label}
                </span>
                <span className="text-slate-400 leading-relaxed">{desc}</span>
              </div>
            )
          })}
        </div>
      </div>

      {showInvite && (
        <AddMemberModal
          roleDefs={roleDefs}
          onClose={() => setShowInvite(false)}
          onSuccess={() => { setShowInvite(false); router.refresh() }}
        />
      )}
    </div>
  )
}
