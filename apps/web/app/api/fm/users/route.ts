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

// FM capability check — managers can manage users
function isFmManager(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager'].includes(cap)
  return ['admin', 'supervisor'].includes(role)
}

const VALID_CAPABILITIES = [
  'org_admin', 'fm_manager', 'fm_viewer', 'fm_contributor', 'fm_worker',
  'pw_manager', 'pw_viewer', 'pw_worker',
] as const

const userCreateSchema = z.object({
  email:              z.string().email(),
  full_name:          z.string().min(1),
  role:               z.enum(['admin', 'supervisor', 'inspector', 'vendor', 'viewer']).default('viewer'),
  org_id:             z.string().optional(),
  // FM-specific fields (optional — used when creating from the FM team page)
  capability:         z.enum(VALID_CAPABILITIES).optional(),
  role_definition_id: z.string().uuid().nullable().optional(),
})

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmManager(session.capability, session.role)) return err('Forbidden', 403)

    const supabase = createClient()

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id, full_name, avatar_url, created_at,
        organizations!inner(id, name, slug),
        user_roles(role)
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
 * Creates the auth user directly (admin API) and inserts the profile
 * + user_roles row. The invite email is handled by Supabase Auth.
 * Supports optional FM capability assignment in the same call.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmManager(session.capability, session.role)) return err('Forbidden', 403)

    const body = await req.json()
    const parsed = userCreateSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const admin = createAdminClient()
    const targetOrgId = parsed.data.org_id ?? session.orgId

    // Create user via admin API (bypasses invite flow — sets password directly)
    const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
      email:             parsed.data.email,
      password:          undefined, // will be set by user via email
      email_confirm:     true,
      user_metadata: {
        full_name: parsed.data.full_name,
        org_id:    targetOrgId,
      },
    })

    if (createErr) return err(createErr.message, 400)
    const userId = createdUser.user.id

    // Insert profile
    const supabase = createClient()
    await supabase.from('profiles').upsert({
      id:        userId,
      org_id:    targetOrgId,
      full_name: parsed.data.full_name,
    })

    // Insert / update user_roles
    const rolePayload: Record<string, unknown> = {
      user_id:    userId,
      org_id:     targetOrgId,
      role:       parsed.data.role,
    }
    if (parsed.data.capability) {
      rolePayload.capability         = parsed.data.capability
      rolePayload.role_definition_id = parsed.data.role_definition_id ?? null
    }

    await supabase.from('user_roles').upsert(rolePayload)

    // Send invite email so user can set their password
    await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
      data: { full_name: parsed.data.full_name, org_id: targetOrgId },
    }).catch(() => { /* non-fatal — user still created */ })

    return NextResponse.json({ success: true, user_id: userId }, { status: 201 })
  } catch (e) { return caught(e) }
}
