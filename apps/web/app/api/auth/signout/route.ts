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
  // Build the redirect URL from the incoming request's host header so the user
  // always lands back on the same domain they came from (sims., staging., etc.).
  // nginx passes the original Host header, so this is always correct behind a proxy.
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const host  = request.headers.get('x-forwarded-host')
             ?? request.headers.get('host')
             ?? (process.env.NEXT_PUBLIC_APP_URL
                  ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
                  : 'localhost')
  const response = NextResponse.redirect(`${proto}://${host}/login`)

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
