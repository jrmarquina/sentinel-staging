// GET /api/weather/live
// Public endpoint — no auth required.
// Assembles window.SENTINEL_DATA shape from weather_cache rows.
// Falls back to a safe stub when cache is cold or Supabase is unreachable.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Cache response in Vercel/Next.js edge cache for 60 s to absorb traffic spikes
export const revalidate = 60

const CACHE_STALE_MINUTES = 30

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  try {
    const db = supabase()

    const { data: rows, error } = await db
      .from('weather_cache')
      .select('cache_key, payload, fetched_at')
      .in('cache_key', ['alerts', 'conditions', 'forecast', 'storm'])

    if (error) throw new Error(error.message)

    const byKey: Record<string, { payload: unknown; fetchedAt: string }> = {}
    for (const row of rows ?? []) {
      byKey[row.cache_key] = { payload: row.payload, fetchedAt: row.fetched_at }
    }

    const now = new Date()
    const staleThreshold = new Date(now.getTime() - CACHE_STALE_MINUTES * 60 * 1000)

    const alerts = asArray(byKey.alerts?.payload) as AlertItem[]
    const conditions = (byKey.conditions?.payload ?? fallbackConditions()) as Conditions
    const forecast = asArray(byKey.forecast?.payload) as ForecastDay[]
    const storm = (byKey.storm?.payload ?? null) as StormData | null

    // Determine display mode
    const hasTropicalAlert = alerts.some((a) => a.isTropical)
    const hasActiveStorm = storm !== null && storm.affectsPR === true
    const mode: 'normal' | 'watch' | 'storm' =
      hasActiveStorm ? 'storm' : hasTropicalAlert ? 'watch' : 'normal'

    // Season countdown
    const seasonStart = new Date(`${now.getFullYear()}-06-01T00:00:00-04:00`)
    const msUntil = seasonStart.getTime() - now.getTime()
    const daysUntilSeason = Math.max(0, Math.floor(msUntil / 86400000))

    // Last sync time
    const latestFetch = [byKey.alerts, byKey.conditions, byKey.forecast, byKey.storm]
      .filter(Boolean)
      .map((r) => new Date(r!.fetchedAt))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? now

    const dataFresh = latestFetch > staleThreshold

    const payload = {
      mode,
      dataFresh,
      lastSync: latestFetch.toLocaleString('en-US', {
        timeZone: 'America/Puerto_Rico',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }) + ' AST',
      daysUntilSeason,
      seasonActive: msUntil <= 0,
      alerts: alerts.length ? alerts : fallbackAlerts(),
      conditions,
      forecast: forecast.length ? forecast : fallbackForecast(),
      hurricane: storm ?? fallbackHurricane(),
      hasActiveStorm,
      metrics: {
        activeAlerts: alerts.filter((a) => a.level === 'WARNING' || a.level === 'WATCH').length,
        totalAlerts: alerts.length,
      },
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'Access-Control-Allow-Origin': 'https://sentinelmgpr.com',
      },
    })
  } catch (err) {
    // Return fallback stub — page still renders with mock data
    return NextResponse.json(
      { ...buildFallback(), error: err instanceof Error ? err.message : 'fetch_failed' },
      { status: 200, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': 'https://sentinelmgpr.com' } }
    )
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://sentinelmgpr.com',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  })
}

// ── Types ──────────────────────────────────────────────────────────────────

interface AlertItem {
  id: string
  level: string
  source: string
  title: string
  area: string
  issued: string
  detail: string
  isTropical: boolean
}

interface Conditions {
  temp: number
  humidity: number
  windMph: number
  gustMph: number
  rainIn: number
  pressureInHg: number
  visibilityMi: number
  description: string
  city: string
}

interface ForecastDay {
  day: string
  date: string
  hi: number
  lo: number
  pop: number
  wind: number
  cond: string
}

interface StormData {
  name: string
  classification: string
  advisory: string | number
  issued: string
  pressure: number
  windsSustained: number
  movement: string
  nextAdvisory: string
  coneGeoJson: unknown
  affectsPR: boolean
}

// ── Fallbacks (shown when cache is cold or Supabase unreachable) ───────────

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function fallbackConditions(): Conditions {
  return {
    temp: 86, humidity: 79, windMph: 14, gustMph: 22,
    rainIn: 0, pressureInHg: 30.04, visibilityMi: 10,
    description: 'Partly Cloudy', city: 'San Juan',
  }
}

function fallbackForecast(): ForecastDay[] {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return {
      day: DAYS[d.getDay()],
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      hi: 88 - i, lo: 76, pop: 30 + i * 5, wind: 14 + i,
      cond: i < 3 ? 'Partly Cloudy' : 'Scattered Showers',
    }
  })
}

function fallbackAlerts(): AlertItem[] {
  return [{
    id: 'fallback-1', level: 'INFO', source: 'NWS',
    title: 'No Active Alerts', area: 'Puerto Rico',
    issued: 'N/A', detail: 'No active weather alerts at this time.',
    isTropical: false,
  }]
}

function fallbackHurricane() {
  return null
}

function buildFallback() {
  const now = new Date()
  const seasonStart = new Date(`${now.getFullYear()}-06-01T00:00:00-04:00`)
  const daysUntilSeason = Math.max(0, Math.floor((seasonStart.getTime() - now.getTime()) / 86400000))
  return {
    mode: 'normal' as const,
    dataFresh: false,
    lastSync: '—',
    daysUntilSeason,
    seasonActive: daysUntilSeason <= 0,
    alerts: fallbackAlerts(),
    conditions: fallbackConditions(),
    forecast: fallbackForecast(),
    hurricane: null,
    hasActiveStorm: false,
    metrics: { activeAlerts: 0, totalAlerts: 0 },
  }
}
