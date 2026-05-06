'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type AppRole } from '@sentinel/shared'

interface UserRoleState {
  role:    AppRole | null
  orgId:   string | null
  userId:  string | null
  loading: boolean
}

/**
 * Returns the authenticated user's role and org via the get_my_role() RPC.
 * Single round-trip. Re-fetches on auth state change (sign-in / sign-out).
 */
export function useRole(): UserRoleState {
  const [state, setState] = useState<UserRoleState>({
    role:    null,
    orgId:   null,
    userId:  null,
    loading: true,
  })

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function fetchRole() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        if (!cancelled) setState({ role: null, orgId: null, userId: null, loading: false })
        return
      }

      // Use parallel calls: current_user_role RPC + org_id from profiles
      const [roleRes, profileRes] = await Promise.all([
        supabase.rpc('current_user_role'),
        supabase.from('profiles').select('org_id').eq('id', user.id).single(),
      ])

      if (!cancelled) {
        setState({
          role:    (roleRes.data as AppRole | null) ?? null,
          orgId:   (profileRes.data as { org_id: string } | null)?.org_id ?? null,
          userId:  user.id,
          loading: false,
        })
      }
    }

    fetchRole()

    // Re-fetch on sign-in / sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      if (!cancelled) {
        setState(s => ({ ...s, loading: true }))
        fetchRole()
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return state
}

// ── Derived permission hooks ──────────────────────────────────
// These run the same useRole() call — React deduplicates via
// the shared state; they do NOT trigger extra fetches.

/** Can create and edit records (not viewer-only) */
export function useCanWrite() {
  const { role } = useRole()
  return ['admin', 'supervisor', 'inspector'].includes(role ?? '')
}

/** Can approve work orders and manage assignments */
export function useCanManage() {
  const { role } = useRole()
  return ['admin', 'supervisor'].includes(role ?? '')
}

export function useIsAdmin() {
  const { role } = useRole()
  return role === 'admin'
}

// ── Stateless permission helpers ──────────────────────────────
// Use these when you already have the role string (e.g. from
// server-side getSession()) and don't need a hook.

export function canManageUsers(role: AppRole | null): boolean {
  return role === 'admin'
}

export function canApproveWork(role: AppRole | null): boolean {
  return role === 'admin' || role === 'supervisor'
}

export function canCreateWorkOrders(role: AppRole | null): boolean {
  return role !== 'viewer' && role !== null
}

export function canEditInspections(role: AppRole | null): boolean {
  return role === 'admin' || role === 'supervisor' || role === 'inspector'
}

export function isReadOnly(role: AppRole | null): boolean {
  return role === 'viewer' || role === null
}
