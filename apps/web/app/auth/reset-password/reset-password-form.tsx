'use client'

import { useState, useTransition } from 'react'

export default function ResetPasswordForm({
  setPasswordAction,
}: {
  setPasswordAction: (formData: FormData) => Promise<{ error?: string } | void>
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await setPasswordAction(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8}
          className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          placeholder="At least 8 characters" />
      </div>
      <div>
        <label htmlFor="confirm_password" className="block text-sm font-medium text-slate-300 mb-1.5">Confirm password</label>
        <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required minLength={8}
          className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          placeholder="••••••••" />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button type="submit" disabled={isPending}
        className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
        {isPending ? 'Saving…' : 'Set password'}
      </button>
    </form>
  )
}
