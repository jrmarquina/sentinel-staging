import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'
import { z } from 'zod'

function err(msg: string, status = 500) { return NextResponse.json({ error: msg }, { status }) }
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

// Bulk-edit a set of assets. Custody/location are intentionally excluded —
// those flow through the movements ledger, not a blanket field update.
const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(5000),
  patch: z.object({
    name: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    mobility: z.enum(['FIXED', 'MOBILE']).optional(),
    status: z.enum(['IN_SERVICE', 'IN_STORAGE', 'IN_REPAIR', 'RETIRED']).optional(),
    condition: z.enum(['GOOD', 'FAIR', 'POOR']).optional(),
  }).refine((p) => Object.keys(p).length > 0, { message: 'No fields to update' }),
})

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor'])
    const body = await req.json()
    const validated = bulkSchema.safeParse(body)
    if (!validated.success) return err(validated.error.errors[0].message, 400)

    const supabase = createClient()
    const { ids, patch } = validated.data

    const { data, error } = await supabase
      .from('fm_assets')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .select('id')

    if (error) return err(error.message)
    return NextResponse.json({ ok: true, updated: (data ?? []).length })
  } catch (e) { return caught(e) }
}
