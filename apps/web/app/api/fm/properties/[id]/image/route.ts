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

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

// ── POST /api/fm/properties/[id]/image ────────────────────────────────────
// Upload or replace the cover image for a property.
// Body: multipart/form-data with field "file" (image).
// Stores in Supabase Storage "photos" bucket at:
//   {orgId}/fm/properties/{propertyId}/cover.{ext}
//   (orgId prefix satisfies the "upload only to own org folder" RLS policy)
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
      return err(`Tipo de archivo no soportado: ${file.type}. Usa JPEG, PNG o WebP.`, 400)
    }
    if (file.size > MAX_BYTES) return err('El archivo supera el límite de 10 MB', 400)

    // Determine extension
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg',
      'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
    }
    const ext  = extMap[file.type] ?? 'jpg'

    // Path under orgId prefix so the existing storage RLS policy accepts it
    const storagePath = `${session.orgId}/fm/properties/${params.id}/cover.${ext}`

    // Verify property belongs to this org before uploading
    const supabase = createClient()
    const { data: prop, error: propErr } = await supabase
      .from('fm_properties')
      .select('id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (propErr || !prop) return err('Propiedad no encontrada', 404)

    // Upload using the session client — the orgId prefix satisfies RLS
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadErr } = await supabase.storage
      .from('photos')
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: true, // replace existing cover on re-upload
      })

    if (uploadErr) return err(`Error al subir la imagen: ${uploadErr.message}`)

    // Get the public URL
    const { data: urlData } = supabase.storage.from('photos').getPublicUrl(storagePath)
    const coverUrl = urlData.publicUrl

    // Persist URL to fm_properties
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
// Remove the cover image — clears the URL and best-effort removes the file.

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmManager(session.capability, session.role)) return err('Forbidden', 403)

    const supabase = createClient()

    // Clear the URL in the DB first
    const { error: patchErr } = await supabase
      .from('fm_properties')
      .update({ cover_image_url: null, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('org_id', session.orgId)

    if (patchErr) return err(patchErr.message)

    // Best-effort: remove all possible extension variants from storage
    const exts = ['jpg', 'png', 'webp', 'heic']
    await Promise.allSettled(
      exts.map((ext) =>
        supabase.storage
          .from('photos')
          .remove([`${session.orgId}/fm/properties/${params.id}/cover.${ext}`])
      )
    )

    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
