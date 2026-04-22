import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/get-session'

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status })
}
function caught(e: unknown) {
  if (e instanceof Response) return e as Response
  console.error(e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['admin'])
    const supabase = createClient()

    // Check if it's a protected system org
    const { data: target } = await supabase
      .from('organizations')
      .select('id, slug')
      .eq('id', params.id)
      .single()

    if (!target) return err('Organisation not found', 404)
    if (target.slug === 'sentinel') {
      return err('The Sentinel system organisation cannot be deleted', 400)
    }

    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', params.id)

    if (error) return err('Organisation not found or has associated records', 400)
    return NextResponse.json({ success: true })
  } catch (e) { return caught(e) }
}
