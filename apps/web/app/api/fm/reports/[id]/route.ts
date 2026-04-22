import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector', 'viewer'])
    const supabase = createClient()

    const { data, error } = await supabase
      .from('fm_reports')
      .select('*')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .single()

    if (error || !data) return err('Report not found', 404)

    // If report has a file_key, return a signed URL from Supabase Storage
    if (data.file_key) {
      const { data: signedUrl } = await supabase.storage
        .from('documents')
        .createSignedUrl(`reports/${data.file_key}`, 3600) // 1 hour

      return NextResponse.json({ ...data, signed_url: signedUrl?.signedUrl ?? null })
    }

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

    const { data: report } = await supabase
      .from('fm_reports')
      .select('file_key')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .single()

    if (!report) return err('Report not found', 404)

    // Delete file from storage if it exists
    if (report.file_key) {
      await supabase.storage.from('documents').remove([`reports/${report.file_key}`])
    }

    const { error } = await supabase
      .from('fm_reports')
      .delete()
      .eq('id', params.id)
      .eq('org_id', session.orgId)

    if (error) return err(error.message)
    return new NextResponse(null, { status: 204 })
  } catch (e) { return caught(e) }
}
