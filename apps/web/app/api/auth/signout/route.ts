import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

/**
 * GET /api/auth/signout
 *
 * Plain HTTP route — NOT a server action — so it is immune to
 * the "Failed to find Server Action" error that happens when the
 * browser has a cached JS bundle from an older deployment.
 *
 * Clears all Supabase auth cookies unconditionally, then redirects
 * to /login.  Works even when the session is broken or expired.
 */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url))

  // Best-effort GoTrue signOut — ignore errors (stale / invalid session)
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options ?? {})
            )
          },
        },
      }
    )
    await supabase.auth.signOut()
  } catch { /* ignore */ }

  // Force-clear every sb-* cookie regardless of signOut outcome
  request.cookies.getAll().forEach(({ name }) => {
    if (name.startsWith('sb-') || name.includes('supabase') || name.includes('auth-token')) {
      response.cookies.set(name, '', { maxAge: 0, path: '/' })
    }
  })

  return response
}
