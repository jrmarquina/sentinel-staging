import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const PatchSchema = z.object({
  start_at: z.string().datetime(),
  end_at:   z.string().datetime().nullable().optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  // Only admins and supervisors may reschedule
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role, org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!roleRow || !['admin', 'supervisor'].includes(roleRow.role)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const body = await req.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { start_at, end_at } = parsed.data

  // Verify the event belongs to this org before updating
  const { data: existing } = await supabase
    .from('calendar_events')
    .select('id, org_id')
    .eq('id', params.id)
    .eq('org_id', roleRow.org_id)
    .is('deleted_at', null)
    .single()

  if (!existing) return new NextResponse('Not found', { status: 404 })

  const { error } = await supabase
    .from('calendar_events')
    .update({ start_at, end_at: end_at ?? null, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
