import type { Feature, Polygon } from 'geojson'

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_M = 6_371_008.8

const toRad = (deg: number) => (deg * Math.PI) / 180

/** Distancia en metros entre dos puntos (fórmula de Haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** "85 m", "1.2 km", "12 km". */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters / 1000)} km`
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  // Acepta coma decimal ("19,4326") cuando no hay punto.
  const n = Number(text.includes('.') ? text : text.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function valid(lat: number | null, lng: number | null): LatLng | null {
  if (lat === null || lng === null) return null
  // Columnas invertidas por error: latitud fuera de rango pero longitud sí cabe como latitud.
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lat, lng] = [lng, lat]
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

/** Punto PostGIS en formato EWKB hexadecimal (lo que devuelve PostgREST para columnas geometry/geography). */
function parseWkbPoint(hex: string): LatLng | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 42) return null
  const bytes = new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)))
  const view = new DataView(bytes.buffer)
  const little = bytes[0] === 1
  const type = view.getUint32(1, little)
  if ((type & 0xff) !== 1) return null // no es un Point
  let offset = 5
  if (type & 0x20000000) offset += 4 // trae SRID
  if (bytes.length < offset + 16) return null
  const x = view.getFloat64(offset, little)
  const y = view.getFloat64(offset + 8, little)
  return valid(y, x)
}

/**
 * Interpreta una ubicación guardada en una sola columna:
 * "19.43,-99.13", "LatLng(lat: 19.43, lng: -99.13)", {lat, lng}, {latitude, longitude},
 * GeoJSON {type: 'Point', coordinates: [lng, lat]} o PostGIS (EWKB hex).
 */
export function parseLocation(value: unknown): LatLng | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const text = value.trim()
    if (text.startsWith('{')) {
      try {
        return parseLocation(JSON.parse(text))
      } catch {
        return null
      }
    }
    const wkb = parseWkbPoint(text)
    if (wkb) return wkb
    const numbers = text.match(/-?\d+(?:\.\d+)?/g)
    if (!numbers || numbers.length < 2) return null
    return valid(Number(numbers[0]), Number(numbers[1]))
  }
  if (Array.isArray(value) && value.length >= 2) {
    return valid(toNumber(value[0]), toNumber(value[1]))
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    if (o.type === 'Point' && Array.isArray(o.coordinates)) {
      return valid(toNumber(o.coordinates[1]), toNumber(o.coordinates[0]))
    }
    const lat = o.lat ?? o.latitude ?? o.latitud
    const lng = o.lng ?? o.lon ?? o.long ?? o.longitude ?? o.longitud
    return valid(toNumber(lat), toNumber(lng))
  }
  return null
}

export function locationFromColumns(lat: unknown, lng: unknown): LatLng | null {
  return valid(toNumber(lat), toNumber(lng))
}

export function googleMapsDirectionsUrl(to: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`
}

export function wazeUrl(to: LatLng): string {
  return `https://waze.com/ul?ll=${to.lat},${to.lng}&navigate=yes`
}

/** Polígono (GeoJSON) que aproxima un círculo de `radius` metros. */
export function circlePolygon(center: LatLng, radius: number, steps = 64): Feature<Polygon> {
  const coords: [number, number][] = []
  const latRad = toRad(center.lat)
  const dLat = (radius / EARTH_RADIUS_M) * (180 / Math.PI)
  const dLng = dLat / Math.max(Math.cos(latRad), 1e-6)
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    coords.push([center.lng + dLng * Math.cos(t), center.lat + dLat * Math.sin(t)])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } }
}
