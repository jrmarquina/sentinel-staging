import { cache } from 'react'
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
  role: AppRole           // legacy app_role — still used by PW RLS
  email: string | undefined
  department: string | null   // 'pw' | 'fm' | 'both'
  capability: string | null   // 'org_admin' | 'fm_manager' | 'fm_viewer' | 'fm_contributor' | 'fm_worker'
  roleSlug: string | null
  roleName: string | null
  roleColor: string | null
}

/**
 * Server-side session resolver.
 *
 * Wrapped in React cache() so multiple Server Components in the same render
 * tree share a single resolution — zero extra RPC calls per page.
 *
 * Returns null when not authenticated.
 */
export const getSession = cache(async (): Promise<SessionProfile | null> => {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase.rpc('get_my_profile').single()

  if (!error && data) {
    const row = data as {
      user_id: string
      org_id: string
      org_name: string
      org_slug: string
      full_name: string | null
      avatar_url: string | null
      role: string
      department: string | null
      capability: string | null
      role_slug: string | null
      role_name: string | null
      role_color: string | null
    }

    return {
      userId:     row.user_id,
      orgId:      row.org_id,
      orgName:    row.org_name,
      orgSlug:    row.org_slug,
      fullName:   row.full_name,
      avatarUrl:  row.avatar_url,
      role:       row.role as AppRole,
      email:      user.email,
      department: row.department ?? null,
      capability: row.capability ?? null,
      roleSlug:   row.role_slug ?? null,
      roleName:   row.role_name ?? null,
      roleColor:  row.role_color ?? null,
    }
  }

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
 * Like getSession() but throws when the user is unauthenticated or
 * lacks the required role. Use in API route handlers.
 */
export async function requireRole(
  allowedRoles: AppRole[]
): Promise<SessionProfile> {
  const session = await getSession()

  if (!session) {
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

export function normalizeFmRole(role: string): AppRole {
  return _normalizeFmRole(role)
}

export function roleToFmLabel(role: AppRole): string {
  return _roleToFmLabel(role)
}
