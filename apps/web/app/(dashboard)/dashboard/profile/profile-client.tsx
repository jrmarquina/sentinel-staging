'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { User, KeyRound, Eye, EyeOff, Check, Lock } from 'lucide-react'
import { updateProfile, changePassword } from './actions'

interface Props {
  userId:         string
  email:          string
  fullName:       string | null
  avatarUrl:      string | null
  role:           string
  passwordLocked: boolean
}

const ROLE_LABEL: Record<string, string> = {
  admin:      'Administrator',
  supervisor: 'Supervisor',
  inspector:  'Inspector',
  vendor:     'Vendor',
  viewer:     'Viewer',
}

function PasswordInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
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
          placeholder={placeholder ?? 'New password'}
          className="w-full px-3 py-2 pr-9 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
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
              <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${
                ['weak','fair','strong'].indexOf(strength) >= i ? strengthColor[strength] : 'bg-slate-200 dark:bg-slate-700'
              }`} />
            ))}
          </div>
          <span className="text-[10px] text-slate-400">{strengthLabel[strength]}</span>
        </div>
      )}
    </div>
  )
}

export function ProfileClient({ userId, email, fullName, avatarUrl, role, passwordLocked }: Props) {
  const router = useRouter()

  // Profile form state
  const [name,       setName]       = useState(fullName ?? '')
  const [avatar,     setAvatar]     = useState(avatarUrl ?? '')
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [profilePending, startProfile] = useTransition()

  // Password form state
  const [pwd,     setPwd]     = useState('')
  const [pwdMsg,  setPwdMsg]  = useState<{ ok: boolean; text: string } | null>(null)
  const [pwdPending, startPwd] = useTransition()

  function saveProfile() {
    if (!name.trim()) { setProfileMsg({ ok: false, text: 'Name is required.' }); return }
    setProfileMsg(null)
    startProfile(async () => {
      const res = await updateProfile({ full_name: name, avatar_url: avatar })
      if (res.error) {
        setProfileMsg({ ok: false, text: res.error })
      } else {
        setProfileMsg({ ok: true, text: 'Profile saved.' })
        router.refresh()
      }
    })
  }

  function savePassword() {
    if (pwd.length < 8) { setPwdMsg({ ok: false, text: 'Password must be at least 8 characters.' }); return }
    setPwdMsg(null)
    startPwd(async () => {
      const res = await changePassword({ password: pwd })
      if (res.error) {
        setPwdMsg({ ok: false, text: res.error })
      } else {
        setPwdMsg({ ok: true, text: 'Password updated.' })
        setPwd('')
      }
    })
  }

  // Avatar preview: use entered URL, fall back to initials
  const initials = (name || email)[0]?.toUpperCase() ?? 'U'

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">My Profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">Update your name, avatar, and password.</p>
      </div>

      {/* Identity card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex items-center gap-5">
        {avatar ? (
          <img src={avatar} alt="" className="w-16 h-16 rounded-full object-cover flex-shrink-0 border-2 border-slate-200 dark:border-slate-700" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 select-none">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-lg font-semibold text-slate-900 dark:text-white truncate">
            {name || <span className="text-slate-400 font-normal">No name set</span>}
          </p>
          <p className="text-sm text-slate-400 truncate">{email}</p>
          <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            {ROLE_LABEL[role] ?? role}
          </span>
        </div>
      </div>

      {/* Profile info form */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <User size={15} className="text-slate-400" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Profile Information</h2>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setProfileMsg(null) }}
            placeholder="Your full name"
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Avatar URL
          </label>
          <input
            type="url"
            value={avatar}
            onChange={e => { setAvatar(e.target.value); setProfileMsg(null) }}
            placeholder="https://example.com/photo.jpg"
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-[10px] text-slate-400">Paste a public image URL. Upload support coming soon.</p>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Email / Username
          </label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed"
          />
          <p className="text-[10px] text-slate-400">Contact an administrator to change your email.</p>
        </div>

        {profileMsg && (
          <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
            profileMsg.ok
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
          }`}>
            {profileMsg.ok && <Check size={12} />}
            {profileMsg.text}
          </div>
        )}

        <button
          onClick={saveProfile}
          disabled={profilePending}
          className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
        >
          {profilePending ? 'Saving…' : 'Save Profile'}
        </button>
      </div>

      {/* Password form */}
      {passwordLocked ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <KeyRound size={15} className="text-slate-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Change Password</h2>
          </div>
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <Lock size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              Your password is managed by your administrator and cannot be changed here. Contact your system administrator if you need a password reset.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound size={15} className="text-slate-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Change Password</h2>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              New Password
            </label>
            <PasswordInput
              value={pwd}
              onChange={v => { setPwd(v); setPwdMsg(null) }}
              placeholder="Minimum 8 characters"
            />
          </div>

          {pwdMsg && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
              pwdMsg.ok
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            }`}>
              {pwdMsg.ok && <Check size={12} />}
              {pwdMsg.text}
            </div>
          )}

          <button
            onClick={savePassword}
            disabled={pwdPending}
            className="px-4 py-2 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-lg transition-colors disabled:opacity-50"
          >
            {pwdPending ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      )}

    </div>
  )
}
