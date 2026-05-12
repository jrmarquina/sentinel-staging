import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'
import { z } from 'zod'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

// FM capability helpers
function isFmManager(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager'].includes(cap)
  return ['admin', 'supervisor'].includes(role)
}

function getFmAccessLevel(cap: string | null, role: string): string | null {
  if (cap) {
    if (['org_admin', 'fm_manager'].includes(cap)) return 'manager'
    if (cap === 'fm_viewer')  return 'viewer'
    if (cap === 'fm_contributor') return 'fm_contributor'
    if (cap === 'fm_worker')      return 'fm_worker'
    return null
  }
  if (['admin', 'supervisor'].includes(role)) return 'manager'
  if (role === 'viewer')    return 'viewer'
  if (role === 'inspector') return 'fm_contributor'
  if (role === 'vendor')    return 'fm_worker'
  return null
}

const VALID_CAPABILITIES = [
  'org_admin', 'fm_manager', 'fm_viewer', 'fm_contributor', 'fm_worker',
  'pw_manager', 'pw_viewer', 'pw_worker',
] as const

const patchSchema = z.object({
  user_id:            z.string().uuid(),
  capability:         z.enum(VALID_CAPABILITIES),
  role_definition_id: z.string().uuid().nullable().optional(),
})

// ── GET /api/fm/team ──────────────────────────────────────────────────────
// Returns all users in the org who have an FM capability set.
// Includes profile data (full_name, avatar_url) and role definition name.

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)

    const accessLevel = getFmAccessLevel(session.capability, session.role)
    if (!accessLevel) return err('Forbidden', 403)

    const supabase = createClient()

    // Get all user_roles rows with a capability set for this org
    const { data: roles, error: rolesErr } = await supabase
      .from('user_roles')
      .select(`
        user_id,
        role,
        capability,
        created_at,
        role_definition:org_role_definitions(id, name, slug, capability_level),
        department:org_departments(id, name, slug)
      `)
      .eq('org_id', session.orgId)
      .not('capability', 'is', null)
      .order('created_at', { ascending: true })

    if (rolesErr) return err(rolesErr.message)

    // Get profiles for full_name + avatar
    const userIds = (roles ?? []).map((r: { user_id: string }) => r.user_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds)
      .is('deleted_at', null)

    const profileMap = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => [p.id, p])
    )

    // Get emails via admin API (only managers can see emails)
    let emailMap = new Map<string, string>()
    if (isFmManager(session.capability, session.role)) {
      try {
        const admin = createAdminClient()
        const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 })
        emailMap = new Map(
          (authData?.users ?? []).map((u) => [u.id, u.email ?? ''])
        )
      } catch { /* non-fatal */ }
    }

    // Assemble response
    type RoleRow = {
      user_id: string
      role: string
      capability: string
      created_at: string
      role_definition: { id: string; name: string; slug: string; capability_level: string } | null
      department: { id: string; name: string; slug: string } | null
    }

    const members = ((roles as unknown as RoleRow[]) ?? []).map((r) => {
      const profile = profileMap.get(r.user_id)
      return {
        user_id:              r.user_id,
        full_name:            profile?.full_name ?? 'Unknown',
        avatar_url:           profile?.avatar_url ?? null,
        email:                emailMap.get(r.user_id) ?? null,
        role:                 r.role,
        capability:           r.capability,
        role_definition:      r.role_definition,
        department:           r.department,
        joined_at:            r.created_at,
        is_me:                r.user_id === session.userId,
      }
    })

    return NextResponse.json(members)
  } catch (e) { return caught(e) }
}

// ── PATCH /api/fm/team ────────────────────────────────────────────────────
// Update a team member's FM capability and role definition.
// Only FM managers can do this.

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmManager(session.capability, session.role)) return err('Forbidden', 403)

    let body: unknown
    try { body = await req.json() }
    catch { return err('Invalid JSON body', 400) }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const { user_id, capability, role_definition_id } = parsed.data

    // Prevent self-demotion (can't remove your own manager access)
    if (user_id === session.userId && !['org_admin', 'fm_manager'].includes(capability)) {
      return err('Cannot remove your own manager access', 422)
    }

    const supabase = createClient()

    const update: Record<string, unknown> = {
      capability,
      updated_at: new Date().toISOString(),
    }
    if (role_definition_id !== undefined) {
      update.role_definition_id = role_definition_id
    }

    const { error } = await supabase
      .from('user_roles')
      .update(update)
      .eq('user_id', user_id)
      .eq('org_id', session.orgId)

    if (error) return err(error.message)
    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
