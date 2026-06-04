import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
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
  role: AppRole           // legacy app_role — still used by PW RLS
  email: string | undefined
  // Two-layer role fields (from migration 026).
  // Null for users whose user_roles row hasn't been migrated yet;
  // callers should fall back to `role` in that case.
  department: string | null   // 'pw' | 'fm' | 'both'
  capability: string | null   // 'org_admin' | 'fm_manager' | 'fm_viewer' | 'fm_contributor' | 'fm_worker'
  roleSlug: string | null     // e.g. 'facilities_manager', 'zone_manager'
  roleName: string | null     // display name e.g. 'Facilities Manager'
  roleColor: string | null    // hex colour for UI badge
}

// ── Profile cache (Fix 3) ────────────────────────────────────────────────────
//
// The session profile (role, capability, org info) is fetched via the service
// role client so it can be cached independently of the user's auth cookie.
// Cache TTL: 60 seconds per user. Invalidate immediately after a role change
// by calling revalidateTag(`session-${userId}`) from the admin action.
//
// Uses the admin client so the cached function has no dependency on the
// user's rotating access token — only the stable userId matters for caching.
//
type RawProfileRow = {
  org_id: string
  full_name: string | null
  avatar_url: string | null
  department: string | null
  organizations: { name: string; slug: string } | null
  user_roles: Array<{
    role: string
    org_role_definitions: {
      slug: string | null
      capability_level: string | null
      name: string | null
      color: string | null
    } | null
  }>
}

function buildProfileFromRow(userId: string, row: RawProfileRow, email?: string): SessionProfile {
  const ur  = row.user_roles?.[0]
  const ord = ur?.org_role_definitions ?? null
  const org = row.organizations
  return {
    userId,
    orgId:      row.org_id,
    orgName:    org?.name   ?? 'Sentinel',
    orgSlug:    org?.slug   ?? '',
    fullName:   row.full_name,
    avatarUrl:  row.avatar_url,
    role:       (ur?.role ?? 'viewer') as AppRole,
    email,
    department: row.department ?? null,
    capability: ord?.capability_level ?? null,
    roleSlug:   ord?.slug       ?? null,
    roleName:   ord?.name       ?? null,
    roleColor:  ord?.color      ?? null,
  }
}

// unstable_cache: runs at most once per 60 s per userId across all requests.
// The admin client (service role) needs no user cookie — safe to cache.
function fetchProfileCached(userId: string, email: string | undefined) {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          org_id,
          full_name,
          avatar_url,
          department,
          organizations!inner ( name, slug ),
          user_roles (
            role,
            org_role_definitions ( slug, capability_level, name, color )
          )
        `)
        .eq('id', userId)
        .is('deleted_at', null)
        .single()

      if (error || !data) return null
      return buildProfileFromRow(userId, data as unknown as RawProfileRow, email)
    },
    [`session-profile`, userId],
    { revalidate: 60, tags: [`session-${userId}`] },
  )()
}

/**
 * Server-side session resolver.
 *
 * Validates the user with GoTrue (auth.getUser), then fetches their profile
 * from a 60-second unstable_cache backed by the admin client — no per-request
 * round-trip to PostgREST after the first call within the TTL.
 *
 * Wrapped in React cache() so multiple Server Components in the same render
 * share a single resolution with zero extra network calls.
 *
 * To invalidate immediately after a role change:
 *   import { revalidateTag } from 'next/cache'
 *   revalidateTag(`session-${userId}`)
 *
 * Returns null when not authenticated.
 */
export const getSession = cache(async (): Promise<SessionProfile | null> => {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Attempt cached profile lookup (admin client, 60 s TTL)
  const cached = await fetchProfileCached(user.id, user.email)
  if (cached) return cached

  // Fallback: auth user exists but profile not yet provisioned.
  return {
    userId:     user.id,
    orgId:      '00000000-0000-0000-0000-000000000001',
    orgName:    'Sentinel',
    orgSlug:    'sentinel',
    fullName:   user.user_metadata?.full_name ?? null,
    avatarUrl:  null,
    role:       'viewer' as AppRole,
    email:      user.email,
    department: null,
    capability: null,
    roleSlug:   null,
    roleName:   null,
    roleColor:  null,
  }
})

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
