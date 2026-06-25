// GET /api/weather/live
// Public endpoint — no auth required.
// Reads from weather_cache (populated by edge function cron every 5 min).
// When cache is cold/stale, fetches live from NWS + Open-Meteo + NHC and
// updates the cache so subsequent requests are fast.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CACHE_STALE_MINUTES = 10
const PR_LAT = 18.4655
const PR_LNG = -66.1057
const PR_BBOX = { minLat: 17.8, maxLat: 18.6, minLng: -67.4, maxLng: -65.2 }

const CACHE_KEYS = ['alerts', 'conditions', 'forecast', 'storm', 'rainfall_stations'] as const

const CORS = {
  'Access-Control-Allow-Origin': 'https://sentinelmgpr.com',
}

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
  })
}

export async function GET() {
  try {
    const supabase = db()
    const now = new Date()
    const staleThreshold = new Date(now.getTime() - CACHE_STALE_MINUTES * 60 * 1000)

    // ── 1. Try cache ───────────────────────────────────────────────────────
    const { data: rows } = await supabase
      .from('weather_cache')
      .select('cache_key, payload, fetched_at')
      .in('cache_key', [...CACHE_KEYS])

    const byKey: Record<string, { payload: unknown; fetchedAt: Date }> = {}
    for (const row of rows ?? []) {
      byKey[row.cache_key] = { payload: row.payload, fetchedAt: new Date(row.fetched_at) }
    }

    const cacheComplete = ['alerts', 'conditions', 'forecast', 'storm'].every((k) => byKey[k])
    const cacheFresh = cacheComplete && byKey.alerts.fetchedAt > staleThreshold

    // ── 2. Refresh when cold ───────────────────────────────────────────────
    if (!cacheFresh) {
      const live = await fetchLive()
      await Promise.allSettled([
        upsert(supabase, 'alerts', live.alerts),
        upsert(supabase, 'conditions', live.conditions),
        upsert(supabase, 'forecast', live.forecast),
        upsert(supabase, 'storm', live.storm),
        upsert(supabase, 'rainfall_stations', live.rainfallStations),
      ])
      return NextResponse.json(buildPayload(live.alerts, live.conditions, live.forecast, live.storm, live.rainfallStations, now), {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120', ...CORS },
      })
    }

    // ── 3. Return cached data ──────────────────────────────────────────────
    const alerts = asArray(byKey.alerts.payload) as AlertItem[]
    const conditions = byKey.conditions.payload as Conditions
    const forecast = asArray(byKey.forecast.payload) as ForecastDay[]
    const storm = (byKey.storm.payload ?? null) as StormData | null
    const rainfallStations = asArray(byKey.rainfall_stations?.payload) as RainfallStation[]
    const latestFetch = byKey.alerts.fetchedAt

    return NextResponse.json(buildPayload(alerts, conditions, forecast, storm, rainfallStations, latestFetch), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120', ...CORS },
    })
  } catch (err) {
    // Last resort: return live data without saving to cache
    try {
      const live = await fetchLive()
      return NextResponse.json(buildPayload(live.alerts, live.conditions, live.forecast, live.storm, live.rainfallStations, new Date()), {
        headers: { 'Cache-Control': 'no-store', ...CORS },
      })
    } catch {
      return NextResponse.json(
        { ...buildFallback(), error: err instanceof Error ? err.message : 'fetch_failed' },
        { status: 200, headers: { 'Cache-Control': 'no-store', ...CORS } }
      )
    }
  }
}

// ── Live fetch ─────────────────────────────────────────────────────────────

async function fetchLive() {
  const [alerts, weatherData, storm, rainfallStations] = await Promise.allSettled([
    fetchAlerts(),
    fetchWeather(),
    fetchStorm(),
    fetchRainfallStations(),
  ])

  return {
    alerts: alerts.status === 'fulfilled' ? alerts.value : [],
    conditions: weatherData.status === 'fulfilled' ? weatherData.value.conditions : fallbackConditions(),
    forecast: weatherData.status === 'fulfilled' ? weatherData.value.forecast : fallbackForecast(),
    storm: storm.status === 'fulfilled' ? storm.value : null,
    rainfallStations: rainfallStations.status === 'fulfilled' ? rainfallStations.value : [],
  }
}

async function fetchAlerts(): Promise<AlertItem[]> {
  const res = await fetch(
    'https://api.weather.gov/alerts/active?area=PR&status=actual&message_type=alert,update',
    { headers: { 'User-Agent': 'SentinelPR/1.0 (jrmarquina@gmail.com)', Accept: 'application/geo+json' }, signal: AbortSignal.timeout(8000) }
  )
  const json = await res.json()
  return (json.features ?? []).map((f: Record<string, unknown>) => {
    const p = f.properties as Record<string, unknown>
    const severity = String(p.severity ?? '').toUpperCase()
    let level = 'INFO'
    if (['EXTREME', 'SEVERE'].includes(severity)) level = 'WARNING'
    else if (severity === 'MODERATE') level = 'WATCH'
    else if (severity === 'MINOR') level = 'ADVISORY'
    return {
      id: String(p.id ?? f.id ?? ''),
      level,
      source: String(p.senderName ?? 'NWS'),
      title: String(p.event ?? ''),
      area: String(p.areaDesc ?? ''),
      issued: formatAST(String(p.sent ?? '')),
      expires: String(p.expires ?? ''),
      detail: parseNWSDetail(String(p.description ?? '')),
      isTropical: /tropical|hurricane|storm surge/i.test(String(p.event ?? '')),
    } as AlertItem
  })
}

async function fetchWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${PR_LAT}&longitude=${PR_LNG}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,` +
    `precipitation,weather_code,surface_pressure,visibility` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,` +
    `wind_speed_10m_max,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch` +
    `&forecast_days=7&timezone=America%2FPuerto_Rico`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  const json = await res.json()
  const c = json.current ?? {}
  const d = json.daily ?? {}
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    conditions: {
      temp: Math.round(c.temperature_2m ?? 0),
      humidity: Math.round(c.relative_humidity_2m ?? 0),
      windMph: Math.round(c.wind_speed_10m ?? 0),
      gustMph: Math.round(c.wind_gusts_10m ?? 0),
      rainIn: Number((c.precipitation ?? 0).toFixed(2)),
      pressureInHg: Number(((c.surface_pressure ?? 1013) * 0.02953).toFixed(2)),
      visibilityMi: Math.round((c.visibility ?? 10000) / 1609),
      description: wmoDescription(c.weather_code ?? 0),
      city: 'San Juan',
    } as Conditions,
    forecast: (d.time ?? []).map((dateStr: string, i: number) => {
      const dt = new Date(dateStr + 'T12:00:00-04:00')
      return {
        day: DAYS[dt.getDay()],
        date: `${dt.getMonth() + 1}/${dt.getDate()}`,
        hi: Math.round((d.temperature_2m_max ?? [])[i] ?? 0),
        lo: Math.round((d.temperature_2m_min ?? [])[i] ?? 0),
        pop: Math.round((d.precipitation_probability_max ?? [])[i] ?? 0),
        wind: Math.round((d.wind_speed_10m_max ?? [])[i] ?? 0),
        cond: wmoDescription((d.weather_code ?? [])[i] ?? 0),
      } as ForecastDay
    }),
  }
}

async function fetchRainfallStations(): Promise<RainfallStation[]> {
  const [cocoRes, usgsRes] = await Promise.allSettled([
    fetch(
      'https://data.cocorahs.org/cocorahs/export/exportreports.aspx?ReportType=Daily&dtf=1&Format=JSON&State=PR',
      { signal: AbortSignal.timeout(10000) }
    ),
    fetch(
      'https://waterservices.usgs.gov/nwis/iv/?stateCd=PR&parameterCd=00045&format=json&siteType=AT&period=PT24H',
      { headers: { 'User-Agent': 'SentinelPR/1.0 (jrmarquina@gmail.com)' }, signal: AbortSignal.timeout(15000) }
    ),
  ])

  const stations: RainfallStation[] = []

  if (cocoRes.status === 'fulfilled' && cocoRes.value.ok) {
    try {
      const d = await cocoRes.value.json()
      for (const r of d?.data?.reports ?? []) {
        if (r.totalpcpn < 0) continue // N/A or trace
        stations.push({
          id: String(r.st_num),
          source: 'cocorahs',
          name: String(r.st_name),
          lat: Number(r.lat),
          lng: Number(r.lng),
          totalIn: Number(Number(r.totalpcpn).toFixed(2)),
          time: `${r.obs_date} ${r.obs_time}`,
        })
      }
    } catch { /* silently skip bad data */ }
  }

  if (usgsRes.status === 'fulfilled' && usgsRes.value.ok) {
    try {
      const d = await usgsRes.value.json()
      for (const ts of d?.value?.timeSeries ?? []) {
        const si = ts.sourceInfo as Record<string, unknown>
        const geo = (si?.geoLocation as Record<string, unknown>)?.geogLocation as Record<string, unknown>
        const lat = Number(geo?.latitude)
        const lng = Number(geo?.longitude)
        if (!lat || !lng) continue
        const vals: Array<{ value: string; dateTime: string }> = ts.values?.[0]?.value ?? []
        const totalIn = vals.reduce((acc, v) => {
          const n = parseFloat(v.value)
          return acc + (isNaN(n) || n < 0 ? 0 : n)
        }, 0)
        const lastTime = vals[vals.length - 1]?.dateTime ?? ''
        const siteCode = (si?.siteCode as Array<{ value: string }>)?.[0]?.value ?? ''
        stations.push({
          id: `usgs-${siteCode || lat}`,
          source: 'usgs',
          name: String(si.siteName ?? 'USGS Station'),
          lat,
          lng,
          totalIn: Number(totalIn.toFixed(2)),
          time: lastTime,
        })
      }
    } catch { /* silently skip bad data */ }
  }

  return stations
}

async function fetchStorm(): Promise<StormData | null> {
  const res = await fetch('https://www.nhc.noaa.gov/CurrentStorms.json', {
    headers: { 'User-Agent': 'SentinelPR/1.0 (jrmarquina@gmail.com)' },
    signal: AbortSignal.timeout(8000),
  })
  const json = await res.json()
  for (const storm of json.activeStorms ?? []) {
    const basin = String(storm.basin ?? '').toLowerCase()
    if (!['al', 'ep'].includes(basin)) continue
    const id = String(storm.id ?? '')
    const advNum = String(storm.advisoryNumber ?? '1').replace(/\D/g, '').padStart(3, '0')
    try {
      const coneRes = await fetch(`https://www.nhc.noaa.gov/storm_graphics/api/${id}_${advNum}adv_CONE.json`, {
        headers: { 'User-Agent': 'SentinelPR/1.0 (jrmarquina@gmail.com)' },
        signal: AbortSignal.timeout(8000),
      })
      if (!coneRes.ok) continue
      const coneJson = await coneRes.json()
      let affectsPR = false
      for (const feat of coneJson.features ?? []) {
        const geom = feat.geometry as Record<string, unknown> | undefined
        if (!geom) continue
        const coords: number[][][] = geom.type === 'Polygon'
          ? (geom.coordinates as number[][][])
          : geom.type === 'MultiPolygon'
          ? (geom.coordinates as number[][][][]).flat()
          : []
        outer: for (const ring of coords) {
          for (const [lng, lat] of ring) {
            if (lat >= PR_BBOX.minLat && lat <= PR_BBOX.maxLat &&
                lng >= PR_BBOX.minLng && lng <= PR_BBOX.maxLng) {
              affectsPR = true; break outer
            }
          }
        }
        if (affectsPR) break
      }
      if (!affectsPR) continue
      return {
        id, name: String(storm.name ?? ''),
        classification: String(storm.classification ?? 'TD'),
        advisory: storm.advisoryNumber,
        issued: String(storm.advisoryDate ?? ''),
        pressure: Number(storm.minimumPressure ?? 1000),
        windsSustained: Number(storm.maxSustainedWind ?? 35),
        movement: `${storm.movementDir ?? ''} at ${storm.movementSpeed ?? ''} mph`,
        nextAdvisory: String(storm.nextAdvisory ?? ''),
        coneGeoJson: coneJson,
        affectsPR: true,
      }
    } catch { continue }
  }
  return null
}

// ── Payload builder ────────────────────────────────────────────────────────

function buildPayload(
  alerts: AlertItem[], conditions: Conditions, forecast: ForecastDay[],
  storm: StormData | null, rainfallStations: RainfallStation[], fetchedAt: Date
) {
  const now = new Date()
  const seasonStart = new Date(`${now.getFullYear()}-06-01T00:00:00-04:00`)
  const msUntil = seasonStart.getTime() - now.getTime()
  const hasTropicalAlert = alerts.some((a) => a.isTropical)
  const hasActiveStorm = storm !== null && storm.affectsPR === true
  const mode = hasActiveStorm ? 'storm' : hasTropicalAlert ? 'watch' : 'normal'
  return {
    mode,
    dataFresh: true,
    lastSync: fetchedAt.toLocaleString('en-US', {
      timeZone: 'America/Puerto_Rico', hour: 'numeric', minute: '2-digit', hour12: true,
    }) + ' AST',
    daysUntilSeason: Math.max(0, Math.floor(msUntil / 86400000)),
    seasonActive: msUntil <= 0,
    alerts: alerts.length ? alerts : fallbackAlerts(),
    conditions: conditions ?? fallbackConditions(),
    forecast: forecast.length ? forecast : fallbackForecast(),
    hurricane: storm,
    hasActiveStorm,
    rainfallStations,
    metrics: {
      activeAlerts: alerts.filter((a) => a.level === 'WARNING' || a.level === 'WATCH').length,
      totalAlerts: alerts.length,
    },
  }
}

async function upsert(supabase: ReturnType<typeof db>, key: string, payload: unknown) {
  await supabase.from('weather_cache').upsert(
    { cache_key: key, payload, fetched_at: new Date().toISOString() },
    { onConflict: 'cache_key' }
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatAST(sent: string): string {
  if (!sent) return '—'
  const d = new Date(sent)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    timeZone: 'America/Puerto_Rico', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }) + ' AST'
}

function parseNWSDetail(raw: string): string {
  if (!raw) return ''
  const STOP = /^(PRECAUTIONARY|DETAILED BULLETINS|&&|LAT\.\.\.LON|\$\$)/i
  const BULLET = /^\*\s+[A-Z][A-Z\s\/]*\.\.\.(.*)/
  const values: string[] = []
  let buf = ''
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (STOP.test(t)) break
    const m = t.match(BULLET)
    if (m) {
      if (buf) values.push(buf.replace(/\s+/g, ' ').trim())
      buf = m[1].trim()
    } else if (buf && t) {
      buf += ' ' + t
    }
  }
  if (buf) values.push(buf.replace(/\s+/g, ' ').trim())
  return values.filter(Boolean).join(' ').trim().slice(0, 400)
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function wmoDescription(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Partly Cloudy'
  if (code <= 49) return 'Fog'
  if (code <= 59) return 'Drizzle'
  if (code <= 69) return 'Rain'
  if (code <= 79) return 'Snow'
  if (code <= 84) return 'Rain Showers'
  if (code <= 94) return 'Thunderstorm'
  if (code <= 99) return 'Heavy Thunderstorm'
  return 'Partly Cloudy'
}

// ── Types ──────────────────────────────────────────────────────────────────

interface AlertItem {
  id: string; level: string; source: string; title: string
  area: string; issued: string; expires: string; detail: string; isTropical: boolean
}
interface Conditions {
  temp: number; humidity: number; windMph: number; gustMph: number
  rainIn: number; pressureInHg: number; visibilityMi: number; description: string; city: string
}
interface ForecastDay {
  day: string; date: string; hi: number; lo: number; pop: number; wind: number; cond: string
}
interface StormData {
  id: string; name: string; classification: string; advisory: string | number
  issued: string; pressure: number; windsSustained: number; movement: string
  nextAdvisory: string; coneGeoJson: unknown; affectsPR: boolean
}
interface RainfallStation {
  id: string; source: 'cocorahs' | 'usgs'; name: string
  lat: number; lng: number; totalIn: number; time: string
}

// ── Fallbacks ──────────────────────────────────────────────────────────────

function fallbackConditions(): Conditions {
  return { temp: 86, humidity: 79, windMph: 14, gustMph: 22, rainIn: 0, pressureInHg: 30.04, visibilityMi: 10, description: 'Partly Cloudy', city: 'San Juan' }
}
function fallbackForecast(): ForecastDay[] {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i)
    return { day: DAYS[d.getDay()], date: `${d.getMonth() + 1}/${d.getDate()}`, hi: 88 - i, lo: 76, pop: 30 + i * 5, wind: 14 + i, cond: i < 3 ? 'Partly Cloudy' : 'Scattered Showers' }
  })
}
function fallbackAlerts(): AlertItem[] {
  return [{ id: 'fallback-1', level: 'INFO', source: 'NWS', title: 'No Active Alerts', area: 'Puerto Rico', issued: '—', expires: '', detail: 'No active weather alerts at this time.', isTropical: false }]
}
function buildFallback() {
  const now = new Date()
  const seasonStart = new Date(`${now.getFullYear()}-06-01T00:00:00-04:00`)
  const daysUntilSeason = Math.max(0, Math.floor((seasonStart.getTime() - now.getTime()) / 86400000))
  return { mode: 'normal' as const, dataFresh: false, lastSync: '—', daysUntilSeason, seasonActive: daysUntilSeason <= 0, alerts: fallbackAlerts(), conditions: fallbackConditions(), forecast: fallbackForecast(), hurricane: null, hasActiveStorm: false, rainfallStations: [], metrics: { activeAlerts: 0, totalAlerts: 0 } }
}
