import { describe, expect, it } from 'vitest'
import { rangoDe, rangoEntre } from '../lib/periodos'
import type { Row } from '../lib/supabase'
import { primerDiaResultados, resultadosDelPeriodo, resumirResultados } from './resultados'

describe('resumen de resultados', () => {
  it('cuenta clientes distintos y su registro más reciente', () => {
    // Llegan de la fecha más nueva a la más vieja.
    const rows = [
      { id_cliente: 'A', digital_post_visita: true },
      { id_cliente: 'B', digital_post_visita: false },
      { id_cliente: 'C', digital_post_visita: 'Sí' },
      { id_cliente: 'B', digital_post_visita: true }, // más viejo: no cuenta
      { id_cliente: 'D', digital_post_visita: null },
    ]
    expect(resumirResultados(rows, 'id_cliente', 'digital_post_visita')).toEqual({ visitados: 4, conIndicador: 2 })
  })
  it('sin columna de cliente cuenta filas; sin indicador no lo calcula', () => {
    expect(resumirResultados([{ x: 1 }, { x: 2 }], undefined, 'x')).toEqual({ visitados: 2, conIndicador: 2 })
    expect(resumirResultados([{ x: 1 }], 'id_cliente', undefined)).toEqual({ visitados: 1, conIndicador: null })
  })
})

describe('periodo de resultados', () => {
  // fecha_visita es timestamp sin zona: el día es el que trae escrito.
  const filas = [
    { id: 1, fecha_visita: '2026-10-20T18:30:00' },
    { id: 2, fecha_visita: '2026-10-14T09:00:00' },
    { id: 3, fecha_visita: '2026-10-13' },
    { id: 4, fecha_visita: null },
  ]
  const ids = (rows: Row[]) => rows.map((r) => r.id).join(',')

  it('Total: todas, también las que no tienen fecha', () => {
    expect(ids(resultadosDelPeriodo(filas, 'fecha_visita', rangoDe('total', '2026-10-20')))).toBe('1,2,3,4')
  })

  it('semana, mes y rango: solo las de esos días', () => {
    expect(ids(resultadosDelPeriodo(filas, 'fecha_visita', rangoDe('semana', '2026-10-14')))).toBe('2,3')
    expect(ids(resultadosDelPeriodo(filas, 'fecha_visita', rangoDe('mes', '2026-10-01')))).toBe('1,2,3')
    expect(ids(resultadosDelPeriodo(filas, 'fecha_visita', rangoEntre('2026-10-14', '2026-10-20')))).toBe('1,2')
    expect(ids(resultadosDelPeriodo(filas, 'fecha_visita', rangoEntre('2026-10-13', '2026-10-13')))).toBe('3')
  })

  it('sin columna de fecha no se filtra', () => {
    expect(ids(resultadosDelPeriodo(filas, undefined, rangoDe('semana', '2026-10-14')))).toBe('1,2,3,4')
  })

  it('primer día con resultados', () => {
    expect(primerDiaResultados(filas, 'fecha_visita')).toBe('2026-10-13')
    expect(primerDiaResultados([{ fecha_visita: null }], 'fecha_visita')).toBeNull()
  })
})
