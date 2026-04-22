import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'
import { z } from 'zod'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

const userCreateSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  role: z.enum(['admin', 'supervisor', 'inspector', 'vendor', 'viewer']),
  org_id: z.string().optional(),
})

export async function GET() {
  try {
    const session = await requireRole(['admin'])
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
 * POST /api/fm/users — Invite a new user to the organisation.
 *
 * Uses Supabase Auth admin to send an invite email.
 * The user sets their password via the magic link.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['admin'])
    const body = await req.json()
    const parsed = userCreateSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const supabase = createClient()
    const targetOrgId = parsed.data.org_id ?? session.orgId

    // Invite via Supabase Auth (sends magic-link email)
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
      parsed.data.email,
      {
        data: {
          full_name: parsed.data.full_name,
          org_id: targetOrgId,
          role: parsed.data.role,
        },
      }
    )

    if (inviteErr) return err(inviteErr.message, 400)

    return NextResponse.json({ success: true, user_id: inviteData.user.id }, { status: 201 })
  } catch (e) { return caught(e) }
}
