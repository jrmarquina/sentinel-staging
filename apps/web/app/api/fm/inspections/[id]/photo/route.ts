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

function canRunInspection(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager', 'fm_contributor'].includes(cap)
  return ['admin', 'supervisor', 'inspector'].includes(role)
}

const BUCKET = 'fm-uploads'

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
])

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png':  'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/gif': 'gif',
}

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

// ── POST /api/fm/inspections/[id]/photo ─────────────────────────────────────
//
// Uploads a photo for a specific inspection checklist item.
// Body: multipart/form-data with fields:
//   file      — the image file
//   item_key  — the checklist item key (to name the storage path clearly)
//
// Returns: { id, url, file_key, name }

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!canRunInspection(session.capability, session.role)) return err('Forbidden', 403)

    let formData: FormData
    try { formData = await req.formData() }
    catch { return err('Invalid multipart body', 400) }

    const file = formData.get('file') as File | null
    if (!file) return err('No file provided', 400)
    if (!ALLOWED_MIME.has(file.type)) return err(`Unsupported file type: ${file.type}`, 400)
    if (file.size > MAX_BYTES) return err('File exceeds 10 MB limit', 400)

    const supabase = createClient()

    // Verify inspection exists and belongs to org
    const { data: inspection, error: inspErr } = await supabase
      .from('fm_inspections')
      .select('id, property_id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .single()

    if (inspErr || !inspection) return err('Inspection not found', 404)

    const ext     = EXT_MAP[file.type] ?? 'jpg'
    const uuid    = crypto.randomUUID()
    const fileKey = `${session.orgId}/inspections/${params.id}/${uuid}.${ext}`

    const admin = storageAdmin()
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(fileKey, arrayBuffer, { contentType: file.type, upsert: false })

    if (uploadErr) {
      console.error('Storage upload error:', uploadErr)
      return err(`Upload failed: ${uploadErr.message}`)
    }

    // Insert into fm_attachments
    const { data: row, error: insertErr } = await supabase
      .from('fm_attachments')
      .insert({
        org_id:       session.orgId,
        property_id:  inspection.property_id,
        inspection_id: params.id,
        file_key:     fileKey,
        name:         file.name || `photo.${ext}`,
        type:         file.type,
      })
      .select('id, name, type, file_key, created_at')
      .single()

    if (insertErr) {
      await admin.storage.from(BUCKET).remove([fileKey])
      return err(insertErr.message)
    }

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(fileKey)

    return NextResponse.json({
      id:       row.id,
      url:      urlData.publicUrl,
      file_key: row.file_key,
      name:     row.name,
    }, { status: 201 })
  } catch (e) { return caught(e) }
}
