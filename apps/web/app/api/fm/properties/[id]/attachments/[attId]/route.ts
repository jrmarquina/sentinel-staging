import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'

function storageAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

const BUCKET = 'fm-uploads'

// DELETE /api/fm/properties/[id]/attachments/[attId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; attId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)

    const supabase = createClient()

    // Look up the row to grab its file_key, scoped to org + property.
    const { data: row, error: lookupErr } = await supabase
      .from('fm_attachments')
      .select('id, file_key')
      .eq('id', params.attId)
      .eq('org_id', session.orgId)
      .eq('property_id', params.id)
      .single()
    if (lookupErr || !row) return err('Attachment not found', 404)

    // Best-effort storage delete (service-role bypasses storage RLS)
    if (row.file_key) {
      const admin = storageAdmin()
      await admin.storage.from(BUCKET).remove([row.file_key])
    }

    const { error: deleteErr } = await supabase
      .from('fm_attachments')
      .delete()
      .eq('id', params.attId)
      .eq('org_id', session.orgId)
    if (deleteErr) return err(deleteErr.message)

    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
