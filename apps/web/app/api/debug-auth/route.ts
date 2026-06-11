import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Temporary diagnostic endpoint — DELETE after debugging login issue
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const supabase = createServerClient(url, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  })

  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@sentinelmgpr.com',
    password: 'admin123456!',
  })

  return NextResponse.json({
    url,
    keyPrefix: key?.slice(0, 40),
    success: !!data?.user,
    user: data?.user?.email ?? null,
    errorMessage: error?.message ?? null,
    errorStatus: error?.status ?? null,
    errorName: error?.name ?? null,
  })
}
