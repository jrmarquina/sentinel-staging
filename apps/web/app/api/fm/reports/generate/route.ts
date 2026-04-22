import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'
import { z } from 'zod'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

const generateSchema = z.object({
  inspection_id: z.string().optional(),
  type: z.enum(['INSPECTION', 'PORTFOLIO_COMPLIANCE']).default('INSPECTION'),
})

/**
 * POST /api/fm/reports/generate
 *
 * Creates a report record for a completed inspection.
 * PDF generation is deferred to a Supabase Edge Function or background job.
 * The report record is returned immediately with a PENDING status.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['admin', 'supervisor', 'inspector'])
    const body = await req.json()
    const parsed = generateSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const supabase = createClient()

    if (parsed.data.type === 'PORTFOLIO_COMPLIANCE') {
      // Portfolio-level compliance summary
      const { data: inspections } = await supabase
        .from('fm_inspections')
        .select(`
          id, status, score, completed_at,
          fm_properties(id, name, code)
        `)
        .eq('org_id', session.orgId)
        .eq('status', 'COMPLETED')
        .is('deleted_at', null)
        .order('completed_at', { ascending: false })

      const { data: report, error } = await supabase
        .from('fm_reports')
        .insert({
          name: `Portfolio Compliance Report ${new Date().toLocaleDateString()}`,
          type: 'PORTFOLIO_COMPLIANCE',
          status: 'PENDING',
          org_id: session.orgId,
          metadata: { inspection_count: inspections?.length ?? 0 },
        })
        .select()
        .single()

      if (error) return err(error.message)
      return NextResponse.json(report, { status: 201 })
    }

    // Single inspection report
    if (!parsed.data.inspection_id) return err('inspection_id is required', 400)

    const { data: inspection } = await supabase
      .from('fm_inspections')
      .select('id, status, property_id, fm_properties(name)')
      .eq('id', parsed.data.inspection_id)
      .eq('org_id', session.orgId)
      .single()

    if (!inspection) return err('Inspection not found', 404)
    if (inspection.status !== 'COMPLETED') {
      return err('Only completed inspections can be reported', 400)
    }

    const propertyName =
      (inspection.fm_properties as unknown as { name: string } | null)?.name ?? 'Property'

    const { data: report, error } = await supabase
      .from('fm_reports')
      .insert({
        name: `Inspection Report — ${propertyName} — ${new Date().toLocaleDateString()}`,
        type: 'INSPECTION',
        status: 'PENDING',
        inspection_id: parsed.data.inspection_id,
        property_id: inspection.property_id,
        org_id: session.orgId,
      })
      .select()
      .single()

    if (error) return err(error.message)
    return NextResponse.json(report, { status: 201 })
  } catch (e) { return caught(e) }
}
