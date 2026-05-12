import { loginAction, forgotPasswordAction } from '@/lib/auth/actions'
import LoginForm from './login-form'
import Image from 'next/image'

export const metadata = {
  title: 'Sign In — SIMS',
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string }
}) {
  return (
    <div className="min-h-screen bg-[#0D1B2E] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / wordmark */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-3">
            <Image
              src="/logo-white.png"
              alt="Sentinel"
              width={200}
              height={52}
              priority
              className="h-12 w-auto"
            />
          </div>
          <p className="text-blue-300 text-sm mt-1">SIMS — Sentinel Infrastructure Management System</p>
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-white mb-1">Welcome back</h2>
          <p className="text-sm text-slate-400 mb-6">Sign in to your account to continue</p>

          {searchParams.error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {searchParams.error}
            </div>
          )}
          {searchParams.message && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
              {searchParams.message}
            </div>
          )}

          <LoginForm loginAction={loginAction} forgotPasswordAction={forgotPasswordAction} />
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          <a
            href="https://sentinelmgpr.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-400 transition-colors"
          >
            Sentinel Management Group
          </a>
        </p>
      </div>
    </div>
  )
}
