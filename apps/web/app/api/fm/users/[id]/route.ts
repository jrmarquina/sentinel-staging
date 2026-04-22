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

const userUpdateSchema = z.object({
  full_name: z.string().min(1).optional(),
  role: z.enum(['admin', 'supervisor', 'inspector', 'vendor', 'viewer']).optional(),
  avatar_url: z.string().nullable().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
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
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .single()

    if (error || !data) return err('User not found', 404)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(['admin'])
    const body = await req.json()
    const parsed = userUpdateSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const supabase = createClient()

    // Update profile
    const profileUpdate: Record<string, unknown> = {}
    if (parsed.data.full_name !== undefined) profileUpdate.full_name = parsed.data.full_name
    if (parsed.data.avatar_url !== undefined) profileUpdate.avatar_url = parsed.data.avatar_url

    if (Object.keys(profileUpdate).length > 0) {
      await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', params.id)
        .eq('org_id', session.orgId)
    }

    // Update role if provided
    if (parsed.data.role) {
      await supabase
        .from('user_roles')
        .upsert({ user_id: params.id, org_id: session.orgId, role: parsed.data.role })
    }

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id, full_name, avatar_url, created_at,
        organizations!inner(id, name, slug),
        user_roles(role)
      `)
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .single()

    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(['admin'])
    const supabase = createClient()

    // Prevent self-deletion
    const { data: sessionProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', session.userId)
      .single()

    if (sessionProfile?.id === params.id) {
      return err('You cannot delete your own account', 400)
    }

    // Verify target belongs to same org
    const { data: target } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .single()

    if (!target) return err('User not found', 404)

    // Delete via Supabase Auth admin (cascades to profile via trigger)
    const { error } = await supabase.auth.admin.deleteUser(params.id)
    if (error) return err(error.message)

    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
