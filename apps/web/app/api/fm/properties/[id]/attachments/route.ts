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

const ALLOWED_MIME = new Set([
  // Images
  'image/jpeg','image/jpg','image/png','image/webp','image/heic','image/gif',
  // PDF
  'application/pdf',
  // Office
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Plain
  'text/plain','text/csv',
])

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png',  'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv':   'csv',
}

function safeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 80)
}

// ── GET /api/fm/properties/[id]/attachments ─────────────────────────────────
// List gallery attachments for a property.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('fm_attachments')
      .select('id, name, type, file_key, sort_order, created_at')
      .eq('org_id', session.orgId)
      .eq('property_id', params.id)
      .order('created_at', { ascending: false })

    if (error) return err(error.message)

    // Resolve public URLs from file_key (service-role for stable public URL helper).
    const admin = storageAdmin()
    const items = (data ?? []).map(row => {
      const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(row.file_key)
      return {
        id:         row.id,
        name:       row.name,
        type:       row.type,
        file_key:   row.file_key,
        url:        urlData.publicUrl,
        created_at: row.created_at,
      }
    })

    return NextResponse.json(items)
  } catch (e) { return caught(e) }
}

// ── POST /api/fm/properties/[id]/attachments ────────────────────────────────
// Upload a new gallery attachment for a property.
// Body: multipart/form-data, field "file".
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)

    let formData: FormData
    try { formData = await req.formData() }
    catch { return err('Invalid multipart body', 400) }

    const file = formData.get('file') as File | null
    if (!file) return err('No file provided', 400)
    if (!ALLOWED_MIME.has(file.type)) return err(`Unsupported type: ${file.type}`, 400)
    if (file.size > MAX_BYTES) return err('File exceeds 20 MB limit', 400)

    const supabase = createClient()

    // Verify property ownership
    const { data: prop, error: propErr } = await supabase
      .from('fm_properties')
      .select('id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()
    if (propErr || !prop) return err('Property not found', 404)

    const ext      = EXT_MAP[file.type] ?? 'bin'
    const uuid     = crypto.randomUUID()
    const cleanName = safeFilename(file.name || `attachment.${ext}`)
    const fileKey  = `${session.orgId}/properties/${params.id}/gallery/${uuid}.${ext}`

    // Upload via service-role — bypasses storage.objects RLS.
    const admin = storageAdmin()
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(fileKey, arrayBuffer, { contentType: file.type, upsert: false })
    if (uploadErr) {
      console.error('Storage upload error:', uploadErr)
      return err(`Upload failed: ${uploadErr.message}`)
    }

    const { data: row, error: insertErr } = await supabase
      .from('fm_attachments')
      .insert({
        org_id:      session.orgId,
        property_id: params.id,
        file_key:    fileKey,
        name:        cleanName,
        type:        file.type,
      })
      .select('id, name, type, file_key, created_at')
      .single()

    if (insertErr) {
      // Rollback upload if metadata insert failed
      await admin.storage.from(BUCKET).remove([fileKey])
      return err(insertErr.message)
    }

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(fileKey)

    return NextResponse.json({
      id:         row.id,
      name:       row.name,
      type:       row.type,
      file_key:   row.file_key,
      url:        urlData.publicUrl,
      created_at: row.created_at,
    })
  } catch (e) { return caught(e) }
}
