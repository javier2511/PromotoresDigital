import { describe, expect, it } from 'vitest'
import type { SchemaContext } from '../lib/schema-resolver'
import { columnaReseteado, fetchAll, isVisitedValue, visitadoValue, type Cliente } from './clientes'

/** Simula una consulta paginada de PostgREST con un límite de filas por respuesta. */
function fakeQuery(total: number, maxRows: number, withCount = true) {
  const calls: [number, number][] = []
  const build = () => ({
    range(from: number, to: number) {
      calls.push([from, to])
      const end = Math.min(to + 1, from + maxRows, total)
      const data = Array.from({ length: Math.max(0, end - from) }, (_, i) => ({ id: from + i }))
      return Promise.resolve({ data, error: null, count: withCount ? total : null })
    },
  })
  return { build, calls }
}

describe('fetchAll', () => {
  it('lee todo en una sola petición cuando cabe', async () => {
    const q = fakeQuery(250, 1000)
    expect((await fetchAll(q.build)).length).toBe(250)
    expect(q.calls.length).toBe(1)
  })
  it('sigue pidiendo aunque el proyecto limite las respuestas a menos de 1000 filas', async () => {
    const q = fakeQuery(1200, 500)
    const rows = await fetchAll(q.build)
    expect(rows.length).toBe(1200)
    expect(new Set(rows.map((r) => r.id)).size).toBe(1200)
    expect(q.calls.map(([from]) => from)).toEqual([0, 500, 1000])
  })
  it('sin total, se detiene con una página incompleta', async () => {
    const q = fakeQuery(1500, 1000, false)
    expect((await fetchAll(q.build)).length).toBe(1500)
  })
})

describe('visitado', () => {
  it('reconoce valores de visitado', () => {
    expect(isVisitedValue(true)).toBe(true)
    expect(isVisitedValue('Visitado')).toBe(true)
    expect(isVisitedValue('SI')).toBe(true)
    expect(isVisitedValue('pendiente')).toBe(false)
    expect(isVisitedValue(null)).toBe(false)
  })
  it('escribe el mismo formato que ya usan tus datos', () => {
    const c = (v: unknown) => ({ raw: { visitado: v } }) as unknown as Cliente
    expect(visitadoValue([c(false), c(true)], 'visitado', 'visitado')).toBe(true)
    expect(visitadoValue([c('Pendiente'), c('Visitado')], 'visitado', 'visitado')).toBe('Visitado')
    expect(visitadoValue([c('Pendiente')], 'visitado', 'visitado')).toBe('visitado')
    expect(visitadoValue([c(0)], 'visitado', 'visitado')).toBe(1)
    expect(visitadoValue([c(null)], 'visitado', 'visitado')).toBe(true)
  })
})

const ctx = (columns: Record<string, string>) => ({ tables: { clientes: { columns } } }) as unknown as SchemaContext

describe('columna reseteado', () => {
  it('usa la del mapeo si existe', () => {
    expect(columnaReseteado(ctx({ id: 'id_cliente', reseteado: 'reseteado' }), ['id_cliente', 'reseteado'])).toBe('reseteado')
  })
  it('si no, cualquiera que contenga "reset"', () => {
    expect(columnaReseteado(ctx({ id: 'id_cliente' }), ['id_cliente', 'nombre_cliente', 'Reseteo_Premia'])).toBe('Reseteo_Premia')
    expect(columnaReseteado(ctx({ id: 'id_cliente' }), ['id_cliente', 'nombre_cliente'])).toBeUndefined()
  })
})
