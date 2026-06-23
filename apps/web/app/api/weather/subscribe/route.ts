// POST /api/weather/subscribe
// Captures an email lead from the public weather page.
// No auth required — rate-limited by IP, deduped by email.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BodySchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
})

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 422 })
  }

  const { email } = parsed.data

  // Hash the IP for dedup tracking (never store raw IP)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const ipHash = createHash('sha256').update(ip + process.env.SUPABASE_SERVICE_ROLE_KEY!).digest('hex')

  try {
    const db = supabase()
    const { error } = await db.from('weather_leads').insert({
      email,
      source: 'weather-page',
      ip_hash: ipHash,
    })

    if (error) {
      // Unique violation = already subscribed — treat as success
      if (error.code === '23505') {
        return NextResponse.json({ ok: true, already: true })
      }
      throw new Error(error.message)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[weather/subscribe]', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
