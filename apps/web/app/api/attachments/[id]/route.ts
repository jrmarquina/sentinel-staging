import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { Database } from '@sentinel/db'

type AttachmentRow = Database['public']['Tables']['attachments']['Row']

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data, error } = await supabase
    .from('attachments')
    .select('storage_path, file_type, file_name')
    .eq('id', params.id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return new NextResponse('Not found', { status: 404 })

  const att = data as Pick<AttachmentRow, 'storage_path' | 'file_type' | 'file_name'>

  const { data: signed } = await supabase.storage
    .from('attachments')
    .createSignedUrl(att.storage_path, 3600) // 1 hour

  if (!signed?.signedUrl) return new NextResponse('Could not generate URL', { status: 500 })

  // Redirect to the signed URL — client caches it
  return NextResponse.redirect(signed.signedUrl)
}
