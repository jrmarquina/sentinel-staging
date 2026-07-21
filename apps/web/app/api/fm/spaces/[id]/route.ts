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

const spaceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  space_type: z.enum(['CLASSROOM', 'OFFICE', 'STORAGE', 'COMMON', 'OUTDOOR', 'OTHER']).optional(),
  floor_id: z.string().uuid().nullable().optional(),
  code: z.string().nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(['admin', 'supervisor'])
    const body = await req.json()
    const validated = spaceUpdateSchema.safeParse(body)
    if (!validated.success) return err(validated.error.errors[0].message, 400)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('fm_spaces')
      .update({ ...validated.data, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .select()
      .single()

    if (error) return err(error.message)
    if (!data) return err('Space not found', 404)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

// Soft-delete. Blocked while any asset currently sits in the space.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(['admin', 'supervisor'])
    const supabase = createClient()

    const { count } = await supabase
      .from('fm_assets')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', session.orgId)
      .eq('current_space_id', params.id)
      .is('deleted_at', null)
    if ((count ?? 0) > 0) {
      return err('Space still contains assets — move them out before deleting', 409)
    }

    const { error } = await supabase
      .from('fm_spaces')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('org_id', session.orgId)

    if (error) return err(error.message)
    return NextResponse.json({ ok: true })
  } catch (e) { return caught(e) }
}
