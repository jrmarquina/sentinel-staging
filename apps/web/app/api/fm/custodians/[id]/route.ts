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

// is_active toggles a custodian in/out of check-out dropdowns while keeping
// all their historical movement rows intact (per product decision).
const custodianUpdateSchema = z.object({
  full_name: z.string().min(1).optional(),
  custodian_type: z.enum(['TEACHER', 'MAINTENANCE', 'STAFF']).optional(),
  property_id: z.string().uuid().nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  external_ref: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(['admin', 'supervisor'])
    const body = await req.json()
    const validated = custodianUpdateSchema.safeParse(body)
    if (!validated.success) return err(validated.error.errors[0].message, 400)

    const supabase = createClient()

    // System STORAGE custodians are not user-editable.
    const { data: existing } = await supabase
      .from('fm_custodians')
      .select('id, custodian_type')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()
    if (!existing) return err('Custodian not found', 404)
    if ((existing as { custodian_type: string }).custodian_type === 'STORAGE') {
      return err('Storage custodians are system-managed and cannot be edited', 400)
    }

    const { data, error } = await supabase
      .from('fm_custodians')
      .update({ ...validated.data, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .select()
      .single()

    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

// Soft-delete. Blocked when the custodian currently holds any asset —
// reassign those first so history stays coherent.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(['admin', 'supervisor'])
    const supabase = createClient()

    const { data: existing } = await supabase
      .from('fm_custodians')
      .select('id, custodian_type')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()
    if (!existing) return err('Custodian not found', 404)
    if ((existing as { custodian_type: string }).custodian_type === 'STORAGE') {
      return err('Storage custodians are system-managed and cannot be deleted', 400)
    }

    const { count } = await supabase
      .from('fm_assets')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', session.orgId)
      .eq('current_custodian_id', params.id)
      .is('deleted_at', null)
    if ((count ?? 0) > 0) {
      return err('Custodian still holds assets — reassign them before deleting', 409)
    }

    const { error } = await supabase
      .from('fm_custodians')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', params.id)
      .eq('org_id', session.orgId)

    if (error) return err(error.message)
    return NextResponse.json({ ok: true })
  } catch (e) { return caught(e) }
}
