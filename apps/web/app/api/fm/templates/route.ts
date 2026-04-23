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

const templateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  json_schema: z.unknown(),
})

export async function GET(_req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()

    const { data, error } = await supabase
      .from('fm_inspection_templates')
      .select('*')
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .order('name')

    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor'])
    const body = await req.json()
    const parsed = templateSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('fm_inspection_templates')
      .insert({ ...parsed.data, org_id: session.orgId })
      .select()
      .single()

    if (error) return err(error.message)
    return NextResponse.json(data, { status: 201 })
  } catch (e) { return caught(e) }
}
