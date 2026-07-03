import { setPasswordAction } from '@/lib/auth/actions'
import ResetPasswordForm from './reset-password-form'

export const metadata = { title: 'Set Password — SIMS' }

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#0D1B2E] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Set your password</h1>
          <p className="text-slate-400 text-sm mt-1">Choose a strong password to secure your account</p>
        </div>
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8">
          <ResetPasswordForm setPasswordAction={setPasswordAction} />
        </div>
      </div>
    </div>
  )
}
