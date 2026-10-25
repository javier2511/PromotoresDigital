import { describe, expect, it } from 'vitest'
import { escalaEje, formatoDecimal, formatoFechaHora, formatoMetros, formatoMinutos, porcentaje } from './formato'

describe('formatos del tablero', () => {
  it('minutos, metros y decimales', () => {
    expect(formatoMinutos(9.0123)).toBe('9.01')
    expect(formatoMinutos(17.6)).toBe('17.60')
    expect(formatoMinutos(null)).toBe('—')
    expect(formatoMetros(10.6)).toBe('11')
    expect(formatoMetros(1693.4)).toBe('1,693')
    expect(formatoFechaHora(new Date(2026, 9, 19, 19, 19, 27).getTime())).toMatch(/^19\/10\/2026 07:19:27 p\.\s?m\.$/)
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
