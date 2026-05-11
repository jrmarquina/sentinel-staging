/**
 * Open Location Code (Plus Code) decoder — no external dependency.
 *
 * Supports:
 *   Full codes  — "J828VGGW+4W"          (separator at position 8)
 *   Short codes — "VGGW+4W Guaynabo"     (separator before position 8,
 *                                          reference location in the suffix)
 *   Short codes — "VGGW+4W"              (no suffix → Guaynabo used as reference)
 *
 * Algorithm verified against the Google OLC reference implementation.
 */

const ALPHABET = '23456789CFGHJMPQRVWX'
const BASE      = 20
const SEP       = '+'
const SEP_POS   = 8  // separator is always at position 8 in a full code

// Default reference: Guaynabo, Puerto Rico
const DEFAULT_REF_LAT = 18.3830
const DEFAULT_REF_LNG = -66.0858

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Encode (lat, lng) to the first `chars` OLC characters (no separator).
 * Used to build the prefix when recovering a short code.
 */
function encodeToPrecision(lat: number, lng: number, chars: number): string {
  let nLat = lat  + 90   // normalise: 0–180
  let nLng = lng  + 180  // normalise: 0–360
  let latBin = 180
  let lngBin = 360
  let out = ''

  for (let i = 0; i < chars; i++) {
    if (i % 2 === 0) {
      latBin /= BASE
      const idx = Math.min(Math.floor(nLat / latBin), BASE - 1)
      out  += ALPHABET[idx]
      nLat -= idx * latBin
    } else {
      lngBin /= BASE
      const idx = Math.min(Math.floor(nLng / lngBin), BASE - 1)
      out  += ALPHABET[idx]
      nLng -= idx * lngBin
    }
  }
  return out
}

/**
 * Decode a FULL plus code (separator must be at position 8).
 * Returns the center of the decoded cell.
 */
function decodeFull(code: string): { lat: number; lng: number } | null {
  const upper = code.toUpperCase().trim()
  if (upper[SEP_POS] !== SEP) return null

  // Strip separator and trailing zeros (padding)
  const digits = upper.replace(SEP, '').replace(/0+$/, '')
  if (digits.length < 2) return null

  let lat = -90, lng = -180
  let latBin = 180, lngBin = 360

  for (let i = 0; i < Math.min(digits.length, 10); i++) {
    const idx = ALPHABET.indexOf(digits[i])
    if (idx < 0) return null
    if (i % 2 === 0) { latBin /= BASE; lat += idx * latBin }
    else             { lngBin /= BASE; lng += idx * lngBin }
  }

  return { lat: lat + latBin / 2, lng: lng + lngBin / 2 }
}

/**
 * Recover a short code to a full code using a reference (lat, lng).
 * Handles boundary edge cases: if the naive recovery lands more than
 * half a resolution unit away from the reference, shift by one cell.
 */
function recoverNearest(
  shortCode: string,
  refLat: number,
  refLng: number,
): string | null {
  const sepIdx = shortCode.indexOf(SEP)
  if (sepIdx <= 0 || sepIdx >= SEP_POS) return null

  const paddingLen = SEP_POS - sepIdx               // chars to prepend
  const prefix     = encodeToPrecision(refLat, refLng, paddingLen)
  const candidate  = prefix + shortCode             // full code string

  if (candidate[SEP_POS] !== SEP) return null       // sanity check

  const decoded = decodeFull(candidate)
  if (!decoded) return null

  // Resolution at this padding level (degrees) — used for boundary check
  const resolution = Math.pow(BASE, 2 - paddingLen / 2)
  const half = resolution / 2

  let { lat, lng } = decoded
  if (Math.abs(refLat - lat) > half)
    lat += resolution * (refLat < lat ? -1 : 1)
  if (Math.abs(refLng - lng) > half)
    lng += resolution * (refLng < lng ? -1 : 1)

  // If we shifted, rebuild with adjusted prefix
  if (lat !== decoded.lat || lng !== decoded.lng) {
    const adjPrefix = encodeToPrecision(lat, lng, paddingLen)
    return adjPrefix + shortCode
  }

  return candidate
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Returns true if the string looks like a plus code (full or short). */
export function isPlusCodeLike(input: string): boolean {
  return /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,7}(\s+.+)?$/i
    .test(input.trim())
}

/**
 * Parse user input that may be:
 *   - A full plus code:  "J828VGGW+4W"
 *   - A short plus code: "VGGW+4W Guaynabo"  (geocodes the suffix via Nominatim)
 *   - A short plus code: "VGGW+4W"           (uses Guaynabo as default reference)
 *
 * Returns the center {lat, lng} on success, or null on failure.
 */
export async function parsePlusCode(
  input: string,
): Promise<{ lat: number; lng: number } | null> {
  const trimmed  = input.trim().toUpperCase()
  const spaceIdx = trimmed.indexOf(' ')
  const codePart = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx))
  const locPart  = spaceIdx === -1 ? '' : input.trim().slice(spaceIdx + 1).trim()

  const sepIdx = codePart.indexOf(SEP)
  if (sepIdx < 0) return null

  // ── Full code ────────────────────────────────────────────────────────────
  if (sepIdx === SEP_POS) return decodeFull(codePart)

  // ── Short code ───────────────────────────────────────────────────────────
  if (sepIdx > 0 && sepIdx < SEP_POS) {
    let refLat = DEFAULT_REF_LAT
    let refLng = DEFAULT_REF_LNG

    // Try to geocode the location suffix (e.g. "Guaynabo")
    if (locPart) {
      try {
        const url =
          `https://nominatim.openstreetmap.org/search` +
          `?q=${encodeURIComponent(locPart)}&format=json&limit=1`
        const res  = await fetch(url, { headers: { 'User-Agent': 'SentinelMPW/1.0' } })
        const data = await res.json() as Array<{ lat: string; lon: string }>
        if (data.length > 0) {
          refLat = parseFloat(data[0].lat)
          refLng = parseFloat(data[0].lon)
        }
      } catch {
        // keep default reference
      }
    }

    const fullCode = recoverNearest(codePart, refLat, refLng)
    if (!fullCode) return null
    return decodeFull(fullCode)
  }

  return null
}
