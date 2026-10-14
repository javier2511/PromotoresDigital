import { describe, expect, it } from 'vitest'
import { formatValue, humanize, initials, normalize, toBoolean } from './text'

describe('text', () => {
  it('normaliza acentos, mayúsculas y espacios', () => {
    expect(normalize('  Sí  Señor ')).toBe('si senor')
    expect(normalize(null)).toBe('')
  })
  it('interpreta booleanos en español', () => {
    expect(toBoolean('Sí')).toBe(true)
    expect(toBoolean('NO')).toBe(false)
    expect(toBoolean('quizá')).toBeNull()
    expect(toBoolean(1)).toBe(true)
  })
  it('genera iniciales ignorando artículos', () => {
    expect(initials('Abarrotes Doña Mary')).toBe('AD')
    expect(initials('Tienda La Esperanza')).toBe('TE')
    expect(initials('Vinos y Licores Tito')).toBe('VL')
    expect(initials('OXXO')).toBe('OX')
    expect(initials('')).toBe('?')
  })
  it('humaniza nombres de columnas', () => {
    expect(humanize('nombre_comercial')).toBe('Nombre comercial')
    expect(humanize('canalVenta')).toBe('Canal venta')
    expect(humanize('telefono')).toBe('Teléfono')
    expect(humanize('numero_cliente')).toBe('Número cliente')
    expect(humanize('rfc')).toBe('RFC')
  })
  it('formatea valores', () => {
    expect(formatValue(true)).toBe('Sí')
    expect(formatValue(null)).toBe('—')
    expect(formatValue(1234.5)).toBe('1,234.5')
    expect(formatValue('2026-10-14')).toMatch(/14 oct 2026/)
  })
})
