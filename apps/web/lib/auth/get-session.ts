import { createClient } from '@/lib/supabase/server'
import {
  normalizeFmRole as _normalizeFmRole,
  roleToFmLabel as _roleToFmLabel,
  type AppRole,
  type FmRole,
} from '@sentinel/shared'

// Re-export so callers can import everything from one place
export type { AppRole, FmRole }

export interface SessionProfile {
  userId: string
  orgId: string
  orgName: string
  orgSlug: string
  fullName: string | null
  avatarUrl: string | null
  role: AppRole
  email: string | undefined
}

/**
 * Server-side session resolver.
 *
 * Returns the authenticated user's full profile in one Supabase RPC call.
 * Use this in Server Components and API routes instead of calling
 * auth.getUser() + profiles + user_roles separately.
 *
 * Returns null when not authenticated.
 *
 * @example
 * ```ts
 * const session = await getSession()
 * if (!session) redirect('/login')
 * ```
 */
export async function getSession(): Promise<SessionProfile | null> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase.rpc('get_my_profile').single()

  // Happy path: profile row exists
  if (!error && data) {
    const row = data as {
      user_id: string
      org_id: string
      org_name: string
      org_slug: string
      full_name: string | null
      avatar_url: string | null
      role: string
    }

    return {
      userId:   row.user_id,
      orgId:    row.org_id,
      orgName:  row.org_name,
      orgSlug:  row.org_slug,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      role:     row.role as AppRole,
      email:    user.email,
    }
  }

  // Fallback: auth user exists but profile not yet provisioned.
  // Return a minimal session so the layout doesn't redirect to /login
  // in a loop. The user will see a viewer-level dashboard until an
  // admin assigns their profile (or the handle_new_user trigger catches up).
  return {
    userId:    user.id,
    orgId:     '00000000-0000-0000-0000-000000000001', // default org
    orgName:   'Sentinel',
    orgSlug:   'sentinel',
    fullName:  user.user_metadata?.full_name ?? null,
    avatarUrl: null,
    role:      'viewer' as AppRole,
    email:     user.email,
  }
}

/**
 * Like getSession() but throws a typed error response when the user
 * is unauthenticated or lacks the required role.
 *
 * Use this in Next.js API route handlers:
 *
 * @example
 * ```ts
 * export async function GET() {
 *   const session = await requireRole(['admin', 'supervisor'])
 *   // session is always defined here
 * }
 * ```
 */
export async function requireRole(
  allowedRoles: AppRole[]
): Promise<SessionProfile> {
  const session = await getSession()

  if (!session) {
    // Next.js 14 API routes: return Response directly
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!allowedRoles.includes(session.role)) {
    throw new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return session
}

/**
 * Maps a FM role string (legacy naming) to the platform app_role.
 * Safe to call with either FM or PW role names.
 * Delegates to @sentinel/shared for the actual mapping.
 */
export function normalizeFmRole(role: string): AppRole {
  return _normalizeFmRole(role)
}

/**
 * Maps a platform app_role to the FM display label.
 * Used in FM admin screens where the legacy names are shown.
 */
export function roleToFmLabel(role: AppRole): string {
  return _roleToFmLabel(role)
}
