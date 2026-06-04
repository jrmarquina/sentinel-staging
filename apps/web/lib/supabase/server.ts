import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Database generic is omitted here — use explicit type assertions on query results.
// Import types from @sentinel/db directly when you need row types.
// This avoids inference failures in Supabase v2.100+ with hand-written schemas.

export function createClient() {
  const cookieStore = cookies()

  // Server-side calls use the internal URL (localhost) to bypass Cloudflare
  // and hit Kong directly — drops per-call latency from ~600ms to ~90ms.
  // SUPABASE_INTERNAL_URL is never exposed to the browser.
  const supabaseUrl =
    process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!

  return createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — cookies will be set by middleware
          }
        },
      },
    }
  )
}

/** Service-role client — ONLY use server-side, never expose to browser */
export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: (_: { name: string; value: string; options?: CookieOptions }[]) => {},
      },
    }
  )
}
