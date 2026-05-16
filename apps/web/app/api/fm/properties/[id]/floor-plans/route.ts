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

function isFmManager(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager'].includes(cap)
  return ['admin', 'supervisor'].includes(role)
}

const BUCKET = 'fm-uploads'
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'])
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
}
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB — floor plans can be large

// ── GET /api/fm/properties/[id]/floor-plans ──────────────────────────────────
//
// Returns all floor plans for a property, with public URLs resolved.
// Response shape: Array<{ id, name, floor_name, floor_level, url }>

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)

    const supabase = createClient()

    // Verify property belongs to org
    const { data: prop } = await supabase
      .from('fm_properties')
      .select('id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (!prop) return err('Property not found', 404)

    // Fetch floors with their plans
    const { data: floors, error } = await supabase
      .from('fm_floors')
      .select(`
        id, name, level, is_default,
        fm_floor_plans(id, name, file_key)
      `)
      .eq('property_id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .order('level', { ascending: true })

    if (error) return err(error.message)

    const admin = storageAdmin()

    type FloorRow = {
      id: string
      name: string
      level: number
      is_default: boolean
      fm_floor_plans: Array<{ id: string; name: string; file_key: string }>
    }

    const result = (floors as unknown as FloorRow[] ?? []).flatMap((floor) =>
      (floor.fm_floor_plans ?? []).map((plan) => {
        const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(plan.file_key)
        return {
          id:          plan.id,
          name:        plan.name,
          floor_name:  floor.name,
          floor_level: floor.level,
          is_default:  floor.is_default,
          url:         urlData.publicUrl,
          file_key:    plan.file_key,
        }
      })
    )

    return NextResponse.json(result)
  } catch (e) { return caught(e) }
}

// ── POST /api/fm/properties/[id]/floor-plans ─────────────────────────────────
//
// Upload a floor plan image for a property floor.
// Body: multipart/form-data
//   file        — image file
//   floor_name  — display name for the floor (e.g. "Ground Floor", "Level 2")
//   floor_level — optional integer level number

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

    const file       = formData.get('file') as File | null
    const floorName  = (formData.get('floor_name') as string | null)?.trim()
    const levelRaw   = formData.get('floor_level') as string | null
    const floorLevel = levelRaw != null && levelRaw !== '' ? parseInt(levelRaw, 10) : null

    if (!file)           return err('No file provided', 400)
    if (!floorName)      return err('floor_name is required', 400)
    if (!ALLOWED_MIME.has(file.type)) return err(`Unsupported file type: ${file.type}`, 400)
    if (file.size > MAX_BYTES)        return err('File exceeds 20 MB limit', 400)

    const supabase = createClient()

    // Verify property belongs to org
    const { data: prop } = await supabase
      .from('fm_properties')
      .select('id')
      .eq('id', params.id)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (!prop) return err('Property not found', 404)

    // Find or create the floor for this name+property
    let floorId: string
    const { data: existingFloor } = await supabase
      .from('fm_floors')
      .select('id')
      .eq('property_id', params.id)
      .eq('org_id', session.orgId)
      .eq('name', floorName)
      .is('deleted_at', null)
      .maybeSingle()

    if (existingFloor) {
      floorId = existingFloor.id
    } else {
      const { data: newFloor, error: floorErr } = await supabase
        .from('fm_floors')
        .insert({
          property_id: params.id,
          org_id:      session.orgId,
          name:        floorName,
          level:       floorLevel,
          is_default:  false,
        })
        .select('id')
        .single()
      if (floorErr || !newFloor) return err(floorErr?.message ?? 'Failed to create floor')
      floorId = newFloor.id
    }

    // Upload image
    const ext     = EXT_MAP[file.type] ?? 'jpg'
    const planId  = crypto.randomUUID()
    const fileKey = `${session.orgId}/floor-plans/${params.id}/${planId}.${ext}`

    const admin = storageAdmin()
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(fileKey, arrayBuffer, { contentType: file.type, upsert: false })

    if (uploadErr) {
      console.error('Storage upload error:', uploadErr)
      return err(`Upload failed: ${uploadErr.message}`)
    }

    // Create floor plan record
    const { data: plan, error: planErr } = await supabase
      .from('fm_floor_plans')
      .insert({
        floor_id: floorId,
        org_id:   session.orgId,
        name:     file.name || `floor-plan.${ext}`,
        file_key: fileKey,
      })
      .select('id, name, file_key')
      .single()

    if (planErr || !plan) {
      await admin.storage.from(BUCKET).remove([fileKey])
      return err(planErr?.message ?? 'Failed to create floor plan record')
    }

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(fileKey)

    return NextResponse.json({
      id:          plan.id,
      name:        plan.name,
      floor_id:    floorId,
      floor_name:  floorName,
      floor_level: floorLevel,
      is_default:  false,
      url:         urlData.publicUrl,
      file_key:    fileKey,
    }, { status: 201 })
  } catch (e) { return caught(e) }
}

// ── DELETE /api/fm/properties/[id]/floor-plans?planId=X ─────────────────────
//
// Deletes a floor plan (storage file + DB record).
// If the owning floor has no remaining plans, the floor is also deleted.

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!isFmManager(session.capability, session.role)) return err('Forbidden', 403)

    const planId = new URL(req.url).searchParams.get('planId')
    if (!planId) return err('planId query param required', 400)

    const supabase = createClient()

    // Verify plan belongs to this property + org via the floor join
    const { data: plan } = await supabase
      .from('fm_floor_plans')
      .select('id, file_key, floor_id, fm_floors!inner(property_id, org_id)')
      .eq('id', planId)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .single()

    if (!plan) return err('Floor plan not found', 404)

    type PlanRow = {
      id: string
      file_key: string
      floor_id: string
      fm_floors: { property_id: string; org_id: string }
    }
    const p = plan as unknown as PlanRow
    if (p.fm_floors.property_id !== params.id) return err('Floor plan not found', 404)

    // Delete from storage
    const admin = storageAdmin()
    await admin.storage.from(BUCKET).remove([p.file_key])

    // Delete the floor plan record
    await supabase.from('fm_floor_plans').delete().eq('id', planId)

    // If floor now has no plans, soft-delete the floor
    const { count } = await supabase
      .from('fm_floor_plans')
      .select('id', { count: 'exact', head: true })
      .eq('floor_id', p.floor_id)
      .is('deleted_at', null)
      .then(r => ({ count: r.count ?? 0 }))

    if (count === 0) {
      await supabase
        .from('fm_floors')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', p.floor_id)
    }

    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
