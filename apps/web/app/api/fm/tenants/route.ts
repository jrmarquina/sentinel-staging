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

const tenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(2).toLowerCase(),
})

/**
 * GET /api/fm/tenants — List all organisations (admin only).
 * In the Sentinel platform, "tenants" map to "organisations" (multi-tenant).
 */
export async function GET() {
  try {
    await requireRole(['admin'])
    const supabase = createClient()

    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, slug, created_at')
      .order('name')

    if (error) return err(error.message)
    return NextResponse.json(data)
  } catch (e) { return caught(e) }
}

/**
 * POST /api/fm/tenants — Create a new organisation (admin only).
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole(['admin'])
    const body = await req.json()
    const parsed = tenantSchema.safeParse(body)
    if (!parsed.success) return err(parsed.error.errors[0].message, 400)

    const supabase = createClient()

    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', parsed.data.slug)
      .single()

    if (existing) return err(`Organisation slug '${parsed.data.slug}' is already in use`, 400)

    const { data, error } = await supabase
      .from('organizations')
      .insert(parsed.data)
      .select()
      .single()

    if (error) return err(error.message)
    return NextResponse.json(data, { status: 201 })
  } catch (e) { return caught(e) }
}
