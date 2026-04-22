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

const attachmentSchema = z.object({
  file_key: z.string().min(1),
  name: z.string().optional().default('Asset Attachment'),
  type: z.string().optional().default('image'),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector'])
    const body = await req.json()
    const validated = attachmentSchema.safeParse(body)
    if (!validated.success) return err(validated.error.errors[0].message, 400)

    const supabase = createClient()

    // Verify asset belongs to org
    const { data: asset } = await supabase
      .from('fm_assets')
      .select('id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .single()

    if (!asset) return err('Asset not found', 404)

    const { data, error } = await supabase
      .from('fm_attachments')
      .insert({
        file_key: validated.data.file_key,
        name: validated.data.name,
        type: validated.data.type,
        asset_id: params.id,
        org_id: session.orgId,
      })
      .select()
      .single()

    if (error) return err(error.message)
    return NextResponse.json(data, { status: 201 })
  } catch (e) { return caught(e) }
}
