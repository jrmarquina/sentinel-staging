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

const renameSchema = z.object({
  name: z.string().min(1),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector'])
    const body = await req.json()
    const validated = renameSchema.safeParse(body)
    if (!validated.success) return err('Name is required', 400)

    const supabase = createClient()

    const { data, error } = await supabase
      .from('fm_attachments')
      .update({ name: validated.data.name })
      .eq('id', params.attachmentId)
      .eq('asset_id', params.id)
      .eq('org_id', session.orgId)
      .select()
      .single()

    if (error) return err(error.message)
    if (!data) return err('Attachment not found', 404)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}
