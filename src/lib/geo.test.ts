import { describe, expect, it } from 'vitest'
import { distanceMeters, formatDistance, locationFromColumns, parseLocation } from './geo'

describe('distanceMeters', () => {
  it('calcula distancias reales', () => {
    // Zócalo CDMX → Ángel de la Independencia ≈ 3.6 km
    const d = distanceMeters({ lat: 19.4326, lng: -99.1332 }, { lat: 19.4270, lng: -99.1677 })
    expect(d).toBeGreaterThan(3500)
    expect(d).toBeLessThan(3800)
    expect(distanceMeters({ lat: 10, lng: 10 }, { lat: 10, lng: 10 })).toBe(0)
  })
  it('es precisa a escala de metros', () => {
    // 0.001° de latitud ≈ 111 m
    const d = distanceMeters({ lat: 19.0, lng: -99.0 }, { lat: 19.001, lng: -99.0 })
    expect(Math.round(d)).toBe(111)
  })
})

describe('formatDistance', () => {
  it('formatea metros y kilómetros', () => {
    expect(formatDistance(85.4)).toBe('85 m')
    expect(formatDistance(1234)).toBe('1.2 km')
    expect(formatDistance(15_678)).toBe('16 km')
    expect(formatDistance(null)).toBe('—')
  })
})

describe('parseLocation', () => {
  it('entiende varios formatos', () => {
    expect(parseLocation('19.4326,-99.1332')).toEqual({ lat: 19.4326, lng: -99.1332 })
    expect(parseLocation('LatLng(lat: 19.4326, lng: -99.1332)')).toEqual({ lat: 19.4326, lng: -99.1332 })
    expect(parseLocation({ lat: '19.4', lng: '-99.1' })).toEqual({ lat: 19.4, lng: -99.1 })
    expect(parseLocation({ latitude: 19.4, longitude: -99.1 })).toEqual({ lat: 19.4, lng: -99.1 })
    expect(parseLocation({ type: 'Point', coordinates: [-99.1, 19.4] })).toEqual({ lat: 19.4, lng: -99.1 })
    expect(parseLocation('{"lat":19.4,"lng":-99.1}')).toEqual({ lat: 19.4, lng: -99.1 })
  })
  it('entiende puntos PostGIS (EWKB)', () => {
    // SRID=4326;POINT(-99.1332 19.4326)
    const p = parseLocation('0101000020E6100000F1F44A5986C858C0E63FA4DFBE6E3340')
    expect(p?.lat).toBeCloseTo(19.4326, 6)
    expect(p?.lng).toBeCloseTo(-99.1332, 6)
  })
  it('descarta valores inválidos y corrige columnas invertidas', () => {
    expect(parseLocation('')).toBeNull()
    expect(parseLocation('0,0')).toBeNull()
    expect(parseLocation('hola')).toBeNull()
    expect(locationFromColumns('-99.1332', '19.4326')).toEqual({ lat: 19.4326, lng: -99.1332 })
    expect(locationFromColumns('19,4326', '-99,1332')).toEqual({ lat: 19.4326, lng: -99.1332 })
    expect(locationFromColumns(null, -99)).toBeNull()
  })
})
