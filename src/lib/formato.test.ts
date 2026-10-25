import { describe, expect, it } from 'vitest'
import { escalaEje, formatoDecimal, formatoMetros, formatoMinutos, porcentaje } from './formato'

describe('formatos del tablero', () => {
  it('minutos, metros y decimales', () => {
    expect(formatoMinutos(12.4)).toBe('12 min')
    expect(formatoMinutos(65)).toBe('1 h 05 min')
    expect(formatoMinutos(0.3)).toBe('<1 min')
    expect(formatoMinutos(null)).toBe('—')
    expect(formatoMetros(35.4)).toBe('35 m')
    expect(formatoMetros(16937)).toBe('16.9 km')
    expect(formatoDecimal(10)).toBe('10.0')
    expect(formatoDecimal(null)).toBe('—')
    expect(porcentaje(1, 3)).toBe(33)
    expect(porcentaje(1, 0)).toBe(0)
  })

  it('eje con marcas limpias y enteras', () => {
    expect(escalaEje(3)).toEqual({ tope: 3, marcas: [0, 1, 2, 3] })
    expect(escalaEje(7)).toEqual({ tope: 10, marcas: [0, 5, 10] })
    expect(escalaEje(1)).toEqual({ tope: 1, marcas: [0, 1] })
    expect(escalaEje(0)).toEqual({ tope: 1, marcas: [0, 1] })
    expect(escalaEje(46)).toEqual({ tope: 60, marcas: [0, 20, 40, 60] })
  })
})
