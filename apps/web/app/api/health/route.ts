import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const start = Date.now()

  try {
    const supabase = createClient()

    // DB ping — anon user sees 0 rows due to RLS, but a successful empty
    // response confirms PostgREST and the database are reachable.
    const { error: dbError } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)

    const dbOk = !dbError

    // Storage ping — list buckets
    const { error: storageError } = await supabase.storage.listBuckets()
    const storageOk = !storageError

    const elapsed = Date.now() - start

    if (!dbOk) {
      return NextResponse.json(
        { status: 'degraded', db: 'error', storage: storageOk ? 'ok' : 'error', elapsed },
        { status: 503 }
      )
    }

    return NextResponse.json({
      status: 'ok',
      db: 'ok',
      storage: storageOk ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '0.1.0',
      elapsed,
    })
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 503 }
    )
  }
}
