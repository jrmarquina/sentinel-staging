import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
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

/**
 * Service-role storage client using @supabase/supabase-js directly.
 * createServerClient from @supabase/ssr does not properly forward the
 * service-role bearer token to the Storage service — use this instead
 * whenever you need to bypass storage RLS.
 */
function storageAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'])
const MAX_BYTES    = 10 * 1024 * 1024 // 10 MB

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
}

// ── POST /api/fm/properties/[id]/image ────────────────────────────────────
// Upload or replace the cover image for a property.
// Body: multipart/form-data, field "file" (image ≤ 10 MB).
// Stores at: fm/properties/{propertyId}/cover.{ext}
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
    const path = `fm/properties/${params.id}/cover.${ext}`

    // Verify property ownership before touching storage
    const supabase = createClient()
    const { data: prop, error: propErr } = await supabase
      .from('fm_properties')
      .select('id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (propErr || !prop) return err('Property not found', 404)

    // Upload via service-role client — bypasses storage RLS entirely
    const admin        = storageAdmin()
    const arrayBuffer  = await file.arrayBuffer()
    const { error: uploadErr } = await admin.storage
      .from('photos')
      .upload(path, arrayBuffer, { contentType: file.type, upsert: true })

    if (uploadErr) {
      console.error('Storage upload error:', uploadErr)
      return err(`Upload failed: ${uploadErr.message}`)
    }

    const { data: urlData } = admin.storage.from('photos').getPublicUrl(path)
    const coverUrl = urlData.publicUrl

    // Persist URL
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
    const admin = storageAdmin()
    await Promise.allSettled(
      ['jpg', 'png', 'webp', 'heic'].map((ext) =>
        admin.storage.from('photos').remove([`fm/properties/${params.id}/cover.${ext}`])
      )
    )

    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
