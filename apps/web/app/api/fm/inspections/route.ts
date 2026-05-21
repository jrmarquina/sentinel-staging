import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'
import { z } from 'zod'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

// FM capability helpers — mirrors WO route pattern
function isFmManager(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager'].includes(cap)
  return ['admin', 'supervisor'].includes(role)
}
function canRunInspection(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager', 'fm_contributor'].includes(cap)
  return ['admin', 'supervisor', 'inspector'].includes(role)
}
function canReadInspection(cap: string | null, role: string): boolean {
  if (cap) return ['org_admin', 'fm_manager', 'fm_viewer', 'fm_contributor'].includes(cap)
  return ['admin', 'supervisor', 'inspector', 'viewer'].includes(role)
}

const startInspectionSchema = z.object({
  template_id: z.string().min(1),
  property_id: z.string().min(1),
  asset_id: z.string().optional().transform(v => (v === '' ? undefined : v)),
  scheduled_for: z.string().optional(),
})

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!canReadInspection(session.capability, session.role)) return err('Forbidden', 403)
    const supabase = createClient()

    // Exclude FCA assessment inspections — they live in the Facility Assessment
    // menu only. FCA deficiency follow-ups (000...0002) do appear here.
    const FCA_ASSESSMENT_TEMPLATE = '20000000-0000-0000-0000-000000000001'

    const { data, error } = await supabase
      .from('fm_inspections')
      .select(`
        *,
        fm_properties!inner(name, code),
        fm_templates:template_id(name),
        inspector:inspector_id(full_name)
      `)
      .eq('org_id', session.orgId)
      .is('deleted_at', null)
      .neq('template_id', FCA_ASSESSMENT_TEMPLATE)
      .order('updated_at', { ascending: false })

    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return err('Unauthorized', 401)
    if (!canRunInspection(session.capability, session.role)) return err('Forbidden', 403)
    const body = await req.json()
    const parsed = startInspectionSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const supabase = createClient()
    const { template_id, property_id, asset_id, scheduled_for } = parsed.data

    // Verify template belongs to org
    const { data: template } = await supabase
      .from('fm_inspection_templates')
      .select('id, json_schema')
      .eq('id', template_id)
      .eq('org_id', session.orgId)
      .single()

    if (!template) return err('Invalid template ID', 400)

    // Create inspection
    const { data: inspection, error: insErr } = await supabase
      .from('fm_inspections')
      .insert({
        template_id,
        property_id,
        asset_id: asset_id ?? null,
        inspector_id: session.userId,
        status: 'DRAFT',
        started_at: new Date().toISOString(),
        scheduled_for: scheduled_for ?? null,
        org_id: session.orgId,
      })
      .select()
      .single()

    if (insErr) return err(insErr.message)

    // Pre-populate checklist items from template schema
    const schema = template.json_schema as { fields?: Array<{ id?: string; label: string }> } | null
    if (schema?.fields?.length) {
      const items = schema.fields.map((f) => ({
        inspection_id: inspection.id,
        key: f.id ?? f.label,
        label: f.label,
        org_id: session.orgId,
      }))
      await supabase.from('fm_checklist_item_responses').insert(items)
    }

    return NextResponse.json(inspection, { status: 201 })
  } catch (e) { return caught(e) }
}
