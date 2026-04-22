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

const schema = z.object({
  ids: z.array(z.string()).min(1),
})

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['admin'])
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return err('ids must be a non-empty array', 400)

    const supabase = createClient()
    const { error } = await supabase
      .from('fm_work_orders')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', parsed.data.ids)
      .eq('org_id', session.orgId)

    if (error) return err(error.message)
    return new NextResponse(null, { status: 204 })
  } catch (e) { return caught(e) }
}
