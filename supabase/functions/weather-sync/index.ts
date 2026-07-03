// Edge Function: weather-sync
// Runs every 5 minutes via Supabase cron
// Fetches NWS Alerts, Open-Meteo conditions/forecast, NHC storm data, and
// CoCoRaHS/USGS rainfall station reports.
// This is the SOLE writer to weather_cache (apps/web/app/api/weather/live/route.ts
// only reads it) — keep it that way so concurrent public requests can't race
// this cron and overwrite fresher data with stale data.
// Stores each as a JSON blob in weather_cache (upsert by cache_key)
//
// Register cron in Supabase dashboard:
//   Schedule: */5 * * * *
//   HTTP POST to: https://<project>.supabase.co/functions/v1/weather-sync
//   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PR_LAT = 18.4655
const PR_LNG = -66.1057

// NHC active storm cone: PR bounding box for intersection check
const PR_BBOX = { minLat: 17.8, maxLat: 18.6, minLng: -67.4, maxLng: -65.2 }

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const results: Record<string, string> = {}

  // ── 1. NWS Alerts for Puerto Rico ─────────────────────────────────────────
  try {
    const res = await fetch(
      'https://api.weather.gov/alerts/active?area=PR&status=actual&message_type=alert,update',
      { headers: { 'User-Agent': 'SentinelPR/1.0 (jrmarquina@gmail.com)', Accept: 'application/geo+json' } }
    )
    const json = await res.json()

    const alerts = (json.features ?? []).map((f: Record<string, unknown>) => {
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
        issued: new Date(String(p.sent ?? '')).toLocaleString('en-US', {
          timeZone: 'America/Puerto_Rico', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
        }) + ' AST',
        detail: String(p.description ?? '').split('\n\n')[0].replace(/\n/g, ' ').slice(0, 300),
        expires: String(p.expires ?? ''),
        isTropical: /tropical|hurricane|storm surge/i.test(String(p.event ?? '')),
      }
    })

    await upsert(supabase, 'alerts', alerts, 'https://api.weather.gov/alerts/active?area=PR')
    results.alerts = `ok (${alerts.length})`
  } catch (e) {
    results.alerts = `error: ${e}`
  }

  // ── 2. Current conditions + 7-day forecast via Open-Meteo ─────────────────
  try {
    const url = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${PR_LAT}&longitude=${PR_LNG}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,` +
      `precipitation,weather_code,surface_pressure,visibility` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,` +
      `wind_speed_10m_max,weather_code` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch` +
      `&forecast_days=7&timezone=America%2FPuerto_Rico`

    const res = await fetch(url)
    const json = await res.json()
    const c = json.current ?? {}
    const d = json.daily ?? {}

    const conditions = {
      temp: Math.round(c.temperature_2m ?? 0),
      humidity: Math.round(c.relative_humidity_2m ?? 0),
      windMph: Math.round(c.wind_speed_10m ?? 0),
      gustMph: Math.round(c.wind_gusts_10m ?? 0),
      rainIn: Number((c.precipitation ?? 0).toFixed(2)),
      pressureInHg: Number(((c.surface_pressure ?? 1013) * 0.02953).toFixed(2)),
      visibilityMi: Math.round((c.visibility ?? 10000) / 1609),
      description: wmoDescription(c.weather_code ?? 0),
      city: 'San Juan',
      fetchedAt: new Date().toISOString(),
    }

    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const forecast = (d.time ?? []).map((dateStr: string, i: number) => {
      const dt = new Date(dateStr + 'T12:00:00-04:00')
      return {
        day: DAYS[dt.getDay()],
        date: `${dt.getMonth() + 1}/${dt.getDate()}`,
        hi: Math.round((d.temperature_2m_max ?? [])[i] ?? 0),
        lo: Math.round((d.temperature_2m_min ?? [])[i] ?? 0),
        pop: Math.round((d.precipitation_probability_max ?? [])[i] ?? 0),
        wind: Math.round((d.wind_speed_10m_max ?? [])[i] ?? 0),
        cond: wmoDescription((d.weather_code ?? [])[i] ?? 0),
      }
    })

    await upsert(supabase, 'conditions', conditions, url)
    await upsert(supabase, 'forecast', forecast, url)
    results.conditions = 'ok'
    results.forecast = `ok (${forecast.length} days)`
  } catch (e) {
    results.conditions = `error: ${e}`
    results.forecast = `error: ${e}`
  }

  // ── 3. NHC active storms ───────────────────────────────────────────────────
  try {
    // NHC provides an active storms JSON endpoint
    const res = await fetch('https://www.nhc.noaa.gov/CurrentStorms.json', {
      headers: { 'User-Agent': 'SentinelPR/1.0 (jrmarquina@gmail.com)' },
    })
    const json = await res.json()
    const activeStorms: Record<string, unknown>[] = json.activeStorms ?? []

    // Find the first storm with a cone that intersects PR
    let stormData: Record<string, unknown> | null = null
    let coneCheckFailed = false

    for (const storm of activeStorms) {
      const basin = String(storm.basin ?? '')
      if (!['al', 'ep'].includes(basin.toLowerCase())) continue

      const id = String(storm.id ?? '')
      const advNum = String(storm.advisoryNumber ?? '1').replace(/\D/g, '').padStart(3, '0')

      // Fetch the advisory cone GeoJSON from NHC
      try {
        const coneUrl = `https://www.nhc.noaa.gov/storm_graphics/api/${id}_${advNum}adv_CONE.json`
        const coneRes = await fetch(coneUrl, {
          headers: { 'User-Agent': 'SentinelPR/1.0 (jrmarquina@gmail.com)' },
        })
        if (!coneRes.ok) { coneCheckFailed = true; continue }
        const coneJson = await coneRes.json()

        // Check if any cone coordinate touches PR bounding box
        const features: Record<string, unknown>[] = coneJson.features ?? []
        let affectsPR = false

        for (const feat of features) {
          const geom = feat.geometry as Record<string, unknown> | undefined
          if (!geom) continue
          const coords: number[][][] = geom.type === 'Polygon'
            ? (geom.coordinates as number[][][])
            : geom.type === 'MultiPolygon'
            ? (geom.coordinates as number[][][][]).flat()
            : []
          for (const ring of coords) {
            for (const [lng, lat] of ring) {
              if (lat >= PR_BBOX.minLat && lat <= PR_BBOX.maxLat &&
                  lng >= PR_BBOX.minLng && lng <= PR_BBOX.maxLng) {
                affectsPR = true
                break
              }
            }
            if (affectsPR) break
          }
          if (affectsPR) break
        }

        if (!affectsPR) continue

        stormData = {
          id,
          name: String(storm.name ?? ''),
          classification: String(storm.classification ?? 'TD'),
          advisory: storm.advisoryNumber,
          issued: String(storm.advisoryDate ?? ''),
          pressure: Number(storm.minimumPressure ?? 1000),
          windsSustained: Number(storm.maxSustainedWind ?? 35),
          movement: String(storm.movementDir ?? '') + ' at ' + String(storm.movementSpeed ?? '') + ' mph',
          nextAdvisory: String(storm.nextAdvisory ?? ''),
          coneGeoJson: coneJson,
          affectsPR: true,
          fetchedAt: new Date().toISOString(),
        }
        break
      } catch {
        coneCheckFailed = true
        continue
      }
    }

    if (stormData) {
      await upsert(supabase, 'storm', stormData, 'https://www.nhc.noaa.gov/CurrentStorms.json')
      results.storm = `ok — ${stormData.name} affects PR`
    } else if (coneCheckFailed) {
      // A candidate storm's cone check failed — don't overwrite the cache with a
      // false "no storm" result; leave the previous cached value in place and
      // surface the failure instead (a silent false negative here is dangerous
      // on a hurricane-tracking dashboard).
      results.storm = 'error: cone check failed for one or more candidate storms — cache not updated'
    } else {
      await upsert(supabase, 'storm', null, 'https://www.nhc.noaa.gov/CurrentStorms.json')
      results.storm = 'ok — no active storm affecting PR'
    }
  } catch (e) {
    results.storm = `error: ${e}`
  }

  // ── 4. Rainfall station reports (CoCoRaHS + USGS) ──────────────────────────
  try {
    const stations = await fetchRainfallStations()
    await upsert(supabase, 'rainfall_stations', stations, 'https://data.cocorahs.org + https://waterservices.usgs.gov')
    results.rainfall_stations = `ok (${stations.length})`
  } catch (e) {
    results.rainfall_stations = `error: ${e}`
  }

  return new Response(JSON.stringify({ ok: true, results, ts: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

interface RainfallStation {
  id: string; source: 'cocorahs' | 'usgs'; name: string
  lat: number; lng: number; totalIn: number; time: string
}

// NOTE: mirrors fetchRainfallStations() in apps/web/app/api/weather/live/route.ts
// (Deno edge function vs Node API route — kept in sync manually). Update both if
// the CoCoRaHS/USGS response shape changes.
async function fetchRainfallStations(): Promise<RainfallStation[]> {
  // CoCoRaHS daily reports are keyed to the PR local date — must use AST, not server tz
  const prDate = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Puerto_Rico', month: '2-digit', day: '2-digit', year: 'numeric',
  }) // → "06/25/2026"

  const [cocoRes, usgsRes] = await Promise.allSettled([
    fetch(
      `https://data.cocorahs.org/cocorahs/export/exportreports.aspx?ReportType=Daily&dtf=1&Format=JSON&State=PR&ReportDateType=reportdate&Date=${encodeURIComponent(prDate)}&TimesInGMT=false`,
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

async function upsert(
  supabase: ReturnType<typeof createClient>,
  key: string,
  payload: unknown,
  sourceUrl: string
) {
  const { error } = await supabase
    .from('weather_cache')
    .upsert({ cache_key: key, payload, source_url: sourceUrl, fetched_at: new Date().toISOString() },
             { onConflict: 'cache_key' })
  if (error) throw new Error(`upsert ${key}: ${error.message}`)
}

function wmoDescription(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Partly Cloudy'
  if (code <= 9) return 'Fog'
  if (code <= 12) return 'Drizzle'
  if (code <= 19) return 'Rain'
  if (code <= 29) return 'Thunderstorm'
  if (code <= 39) return 'Blowing Snow'
  if (code <= 49) return 'Fog'
  if (code <= 59) return 'Drizzle'
  if (code <= 69) return 'Rain'
  if (code <= 79) return 'Snow'
  if (code <= 84) return 'Rain Showers'
  if (code <= 94) return 'Thunderstorm'
  if (code <= 99) return 'Heavy Thunderstorm'
  return 'Unknown'
}
