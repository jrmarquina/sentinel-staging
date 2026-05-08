import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

function isFmManager(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'org_manager'].includes(cap)
  return ['admin', 'supervisor'].includes(role)
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'])
const MAX_BYTES    = 10 * 1024 * 1024 // 10 MB

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
}

const BUCKET = 'fm-uploads'

// ── POST /api/fm/properties/[id]/image ────────────────────────────────────
// Upload or replace the cover image for a property.
// Body: multipart/form-data, field "file" (image ≤ 10 MB).
// Stores at: {orgId}/properties/{propertyId}/cover.{ext}
// Updates fm_properties.cover_image_url with the public URL.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmManager(session.capability, session.role)) return err('Forbidden', 403)

    let formData: FormData
    try { formData = await req.formData() }
    catch { return err('Invalid multipart body', 400) }

    const file = formData.get('file') as File | null
    if (!file) return err('No file provided', 400)
    if (!ALLOWED_MIME.has(file.type)) return err(`Unsupported type: ${file.type}`, 400)
    if (file.size > MAX_BYTES) return err('File exceeds 10 MB limit', 400)

    const ext  = EXT_MAP[file.type] ?? 'jpg'
    const path = `${session.orgId}/properties/${params.id}/cover.${ext}`

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

    // Upload via the user session — RLS allows writes to their own org folder.
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, { contentType: file.type, upsert: true })

    if (uploadErr) {
      console.error('Storage upload error:', uploadErr)
      return err(`Upload failed: ${uploadErr.message}`)
    }

    // Public bucket → embeddable URL. Add a cache-busting timestamp so the
    // browser refreshes the <img> after a re-upload (same path, new bytes).
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const coverUrl = `${urlData.publicUrl}?t=${Date.now()}`

    const { error: patchErr } = await supabase
      .from('fm_properties')
      .update({ cover_image_url: coverUrl, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('org_id', session.orgId)
    if (patchErr) return err(patchErr.message)

    return NextResponse.json({ cover_image_url: coverUrl })
  } catch (e) { return caught(e) }
}

// ── DELETE /api/fm/properties/[id]/image ─────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmManager(session.capability, session.role)) return err('Forbidden', 403)

    const supabase = createClient()

    const { error: patchErr } = await supabase
      .from('fm_properties')
      .update({ cover_image_url: null, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('org_id', session.orgId)
    if (patchErr) return err(patchErr.message)

    // Best-effort: remove all known extension variants
    await Promise.allSettled(
      ['jpg', 'png', 'webp', 'heic'].map((ext) =>
        supabase.storage.from(BUCKET)
          .remove([`${session.orgId}/properties/${params.id}/cover.${ext}`])
      )
    )

    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
