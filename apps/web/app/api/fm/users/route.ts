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

// Only org_admin can create users for any department
function canManageUsers(cap: string | null, role: string): boolean {
  if (cap) return cap === 'org_admin'
  return role === 'admin'
}

const VALID_CAPABILITIES = [
  'org_admin', 'fm_manager', 'fm_viewer', 'fm_contributor', 'fm_worker',
  'pw_manager', 'pw_viewer', 'pw_worker',
] as const

const userCreateSchema = z.object({
  email:              z.string().email(),
  full_name:          z.string().min(1).max(200),
  // Role assignment
  role_definition_id: z.string().uuid('Invalid role definition'),
  department_id:      z.string().uuid('Invalid department'),
  // Password — if provided, set directly. If omitted, send invite email.
  password:           z.string().min(8).optional(),
  password_locked:    z.boolean().default(false),
})

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!canManageUsers(session.capability, session.role)) return err('Forbidden', 403)

    const supabase = createClient()

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id, full_name, avatar_url, created_at, password_locked,
        user_roles(
          role, department_id,
          role_definition:org_role_definitions(id, name, slug, capability_level)
        )
      `)
      .eq('org_id', session.orgId)
      .order('created_at', { ascending: false })

    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

/**
 * POST /api/fm/users — Create a new user in the organisation.
 *
 * - If `password` is provided: creates the account with that password directly.
 *   The user can log in immediately without any email flow.
 * - If `password` is omitted: sends a Supabase invite email so the user sets
 *   their own password.
 * - If `password_locked` is true: the password_locked flag is set on the
 *   profile; the Settings page will not allow the user to change it.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!canManageUsers(session.capability, session.role)) return err('Forbidden', 403)

    const body = await req.json()
    const parsed = userCreateSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const { email, full_name, role_definition_id, department_id, password, password_locked } = parsed.data
    const orgId = session.orgId

    // Resolve capability from the role definition
    const supabase = createClient()
    const { data: roleDef } = await supabase
      .from('org_role_definitions')
      .select('capability_level, slug')
      .eq('id', role_definition_id)
      .eq('org_id', orgId)
      .single()

    if (!roleDef) return err('Role definition not found', 404)

    // Map capability_level to legacy app_role for the role column
    const legacyRole = capabilityToLegacyRole(roleDef.capability_level)

    const admin = createAdminClient()

    // Create or look up the auth user
    let userId: string

    if (password) {
      // Direct password assignment — user can log in immediately
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, org_id: orgId },
      })
      if (createErr) {
        // If already exists, update their password
        if (createErr.message?.includes('already')) {
          const existing = await admin.auth.admin.listUsers()
          const found = existing.data?.users.find((u) => u.email === email)
          if (!found) return err(createErr.message, 400)
          await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true })
          userId = found.id
        } else {
          return err(createErr.message, 400)
        }
      } else {
        userId = created.user.id
      }
    } else {
      // Invite flow — Supabase sends email for user to set password
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name, org_id: orgId },
      })
      if (inviteErr) return err(inviteErr.message, 400)
      userId = invited.user.id
    }

    // Upsert profile (handle_new_user trigger may have already created it)
    await supabase.from('profiles').upsert({
      id:              userId,
      org_id:          orgId,
      full_name,
      password_locked,
    }, { onConflict: 'id' })

    // Upsert user_roles
    await supabase.from('user_roles').upsert({
      user_id:            userId,
      org_id:             orgId,
      role:               legacyRole,
      department_id,
      role_definition_id,
    }, { onConflict: 'org_id,user_id' })

    return NextResponse.json({ success: true, user_id: userId }, { status: 201 })
  } catch (e) { return caught(e) }
}

/**
 * PATCH /api/fm/users — Update an existing user (role, name, password_locked).
 * Also supports admin password reset.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!canManageUsers(session.capability, session.role)) return err('Forbidden', 403)

    const patchSchema = z.object({
      user_id:            z.string().uuid(),
      full_name:          z.string().min(1).max(200).optional(),
      role_definition_id: z.string().uuid().optional(),
      department_id:      z.string().uuid().optional(),
      password:           z.string().min(8).optional(),
      password_locked:    z.boolean().optional(),
    })

    const body = await req.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const { user_id, full_name, role_definition_id, department_id, password, password_locked } = parsed.data
    const supabase = createClient()
    const admin = createAdminClient()

    // Profile update
    const profileUpdate: Record<string, unknown> = {}
    if (full_name !== undefined)       profileUpdate.full_name       = full_name
    if (password_locked !== undefined) profileUpdate.password_locked = password_locked
    if (Object.keys(profileUpdate).length > 0) {
      await supabase.from('profiles').update(profileUpdate).eq('id', user_id).eq('org_id', session.orgId)
    }

    // Role update
    if (role_definition_id && department_id) {
      const { data: roleDef } = await supabase
        .from('org_role_definitions')
        .select('capability_level')
        .eq('id', role_definition_id)
        .single()
      if (roleDef) {
        await supabase.from('user_roles').upsert({
          user_id,
          org_id:             session.orgId,
          role:               capabilityToLegacyRole(roleDef.capability_level),
          department_id,
          role_definition_id,
        }, { onConflict: 'org_id,user_id' })
      }
    }

    // Admin password reset
    if (password) {
      await admin.auth.admin.updateUserById(user_id, { password })
    }

    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function capabilityToLegacyRole(cap: string): string {
  if (cap === 'org_admin')                             return 'admin'
  if (cap === 'fm_manager' || cap === 'pw_manager')   return 'supervisor'
  if (cap === 'fm_contributor')                        return 'inspector'
  if (cap === 'fm_worker' || cap === 'pw_worker')      return 'vendor'
  return 'viewer' // fm_viewer, pw_viewer
}
