/**
 * Plus Code (Open Location Code) helper.
 *
 * Backed by the official Google open-location-code library so the
 * decode algorithm is byte-for-byte identical to what Google Maps uses.
 *
 * Supports:
 *   Full codes  — "J828VGGW+4W"         (separator at position 8)
 *   Short codes — "9VH8+XX Guaynabo"    (separator before position 8,
 *                                         reference location in the suffix)
 *   Short codes — "9VH8+XX"             (no suffix → Guaynabo used as reference)
 */

/* eslint-disable @typescript-eslint/no-require-imports */

// open-location-code exports { OpenLocationCode } where OpenLocationCode is a
// class with instance methods (isValid, decode, recoverNearest, …).
// We instantiate once at module load and reuse the instance.
interface OLCInstance {
  isValid(code: string): boolean
  isShort(code: string): boolean
  isFull(code: string): boolean
  encode(latitude: number, longitude: number, codeLength?: number): string
  decode(code: string): { latitudeCenter: number; longitudeCenter: number; codeLength: number }
  recoverNearest(shortCode: string, referenceLatitude: number, referenceLongitude: number): string
}

const { OpenLocationCode } = require('open-location-code') as { OpenLocationCode: new () => OLCInstance }
const olc: OLCInstance = new OpenLocationCode()

// Default reference: Guaynabo, Puerto Rico
const DEFAULT_REF_LAT = 18.3830
const DEFAULT_REF_LNG = -66.0858

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns true if the string looks like a full or short Plus Code.
 * Only the code portion is checked (everything before the first space).
 */
export function isPlusCodeLike(input: string): boolean {
  const codePart = input.trim().split(' ')[0]
  return olc.isValid(codePart)
}

/**
 * Parse user input that may be:
 *   - A full Plus Code:  "J828VGGW+4W"
 *   - A short Plus Code: "9VH8+XX Guaynabo"  (geocodes suffix via Nominatim)
 *   - A short Plus Code: "9VH8+XX"           (uses Guaynabo as default reference)
 *
 * Returns the center {lat, lng} of the decoded cell, or null on failure.
 */
export async function parsePlusCode(
  input: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const trimmed  = input.trim()
    const spaceIdx = trimmed.indexOf(' ')
    const codePart = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toUpperCase()
    const locPart  = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()

    if (!olc.isValid(codePart)) return null

    let fullCode: string

    if (olc.isShort(codePart)) {
      // Short code — recover using a reference location
      let refLat = DEFAULT_REF_LAT
      let refLng = DEFAULT_REF_LNG

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
          // Nominatim failed — fall back to default Guaynabo reference
        }
      }

      fullCode = olc.recoverNearest(codePart, refLat, refLng)
    } else {
      // Full code (or non-short valid code) — decode directly
      fullCode = codePart
    }

    const area = olc.decode(fullCode)
    return { lat: area.latitudeCenter, lng: area.longitudeCenter }
  } catch {
    return null
  }
}
