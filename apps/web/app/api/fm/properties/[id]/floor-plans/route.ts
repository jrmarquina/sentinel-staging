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
    const BUCKET = 'fm-uploads'

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
