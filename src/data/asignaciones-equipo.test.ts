import { describe, expect, it } from 'vitest'
import { filasAsignaciones } from './asignaciones-equipo'

describe('asignaciones por promotor', () => {
  const conteos = [
    { promotor: 'A', total: 10, completadas: 8, pendientes: 2 },
    { promotor: 'B', total: 12, completadas: 2, pendientes: 10 },
    { promotor: 'C', total: 4, completadas: 2, pendientes: 2 },
    { promotor: 'Z', total: 1, completadas: 0, pendientes: 1 },
  ]
  const promotores = [
    { id: 'A', nombre: 'Ana', region: 'Norte' },
    { id: 'B', nombre: 'Beto', region: 'Sur' },
    { id: 'C', nombre: 'Carla', region: null },
  ]

  it('más pendientes primero (en empate, por nombre), con nombre, región y avance', () => {
    const filas = filasAsignaciones(conteos, promotores, 'pendientes')
    expect(filas.map((f) => [f.nombre, f.pendientes, f.region])).toEqual([
      ['Beto', 10, 'Sur'],
      ['Ana', 2, 'Norte'],
      ['Carla', 2, null],
      ['Z', 1, null], // sin fila en promotores: su id
    ])
    expect(filas[1].avance).toBeCloseTo(0.8)
  })

  it('por nombre', () => {
    expect(filasAsignaciones(conteos, promotores, 'nombre').map((f) => f.nombre)).toEqual(['Ana', 'Beto', 'Carla', 'Z'])
  })
})
