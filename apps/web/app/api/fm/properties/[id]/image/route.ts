import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
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

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

// ── POST /api/fm/properties/[id]/image ────────────────────────────────────
// Upload or replace the cover image for a property.
// Body: multipart/form-data with field "file" (image).
// Stores in Supabase Storage "photos" bucket at:
//   fm/properties/{propertyId}/cover.{ext}
// Updates fm_properties.cover_image_url with the public URL.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmManager(session.capability, session.role)) return err('Forbidden', 403)

    // Parse multipart body
    let formData: FormData
    try { formData = await req.formData() }
    catch { return err('Invalid multipart body', 400) }

    const file = formData.get('file') as File | null
    if (!file) return err('No file provided', 400)
    if (!ALLOWED_MIME.includes(file.type)) {
      return err(`Unsupported file type: ${file.type}. Use JPEG, PNG, or WebP.`, 400)
    }
    if (file.size > MAX_BYTES) return err('File exceeds 10 MB limit', 400)

    // Determine extension
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg',
      'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
    }
    const ext  = extMap[file.type] ?? 'jpg'
    const path = `fm/properties/${params.id}/cover.${ext}`

    // Verify property belongs to this org before uploading
    const supabase = createClient()
    const { data: prop, error: propErr } = await supabase
      .from('fm_properties')
      .select('id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (propErr || !prop) return err('Property not found', 404)

    // Upload to storage using admin client (bypasses storage RLS)
    const admin = createAdminClient()
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadErr } = await admin.storage
      .from('photos')
      .upload(path, arrayBuffer, {
        contentType: file.type,
        upsert: true, // replace existing cover
      })

    if (uploadErr) return err(`Storage upload failed: ${uploadErr.message}`)

    // Get the public URL
    const { data: urlData } = admin.storage.from('photos').getPublicUrl(path)
    const coverUrl = urlData.publicUrl

    // Persist to fm_properties
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
// Remove the cover image — clears the URL and deletes the file from storage.

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmManager(session.capability, session.role)) return err('Forbidden', 403)

    const supabase = createClient()
    const admin    = createAdminClient()

    // Clear the URL in the DB
    const { error: patchErr } = await supabase
      .from('fm_properties')
      .update({ cover_image_url: null, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('org_id', session.orgId)

    if (patchErr) return err(patchErr.message)

    // Best-effort delete from storage (try all known extensions)
    const exts = ['jpg', 'png', 'webp', 'heic']
    await Promise.allSettled(
      exts.map((ext) =>
        admin.storage.from('photos').remove([`fm/properties/${params.id}/cover.${ext}`])
      )
    )

    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
