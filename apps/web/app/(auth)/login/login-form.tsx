'use client'

import { useState, useTransition } from 'react'

interface LoginFormProps {
  loginAction: (formData: FormData) => Promise<{ error?: string } | void>
  forgotPasswordAction: (formData: FormData) => Promise<{ error?: string; success?: boolean } | void>
}

export default function LoginForm({ loginAction, forgotPasswordAction }: LoginFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [forgotMode, setForgotMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await loginAction(formData)
      if (result?.error) setError(result.error)
    })
  }

  async function handleForgot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await forgotPasswordAction(formData)
      if (result?.error) setError(result.error)
      if (result?.success) setResetSent(true)
    })
  }

  if (resetSent) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-slate-300 text-sm">Check your email for a password reset link.</p>
        <button
          onClick={() => { setForgotMode(false); setResetSent(false) }}
          className="mt-4 text-blue-400 text-sm hover:text-blue-300"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  if (forgotMode) {
    return (
      <form onSubmit={handleForgot} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            placeholder="you@guaynabo.pr.gov"
          />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {isPending ? 'Sending…' : 'Send reset link'}
        </button>
        <button
          type="button"
          onClick={() => setForgotMode(false)}
          className="w-full text-sm text-slate-400 hover:text-slate-300"
        >
          Back to sign in
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          placeholder="you@guaynabo.pr.gov"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          placeholder="••••••••"
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setForgotMode(true)}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Forgot your password?
        </button>
      </div>
    </form>
  )
}
