import { describe, expect, it } from 'vitest'
import { rankingConcurso, type VisitaConcurso } from './concurso'

const compra = (key: string, promotor: string | null): VisitaConcurso => ({
  key,
  promotor,
  cliente: null,
  nombreCliente: null,
  conCompra: true,
  actualizado: null,
  diaActualizacion: null,
  fechaVisita: null,
  diaVisita: null,
})

describe('rankingConcurso', () => {
  it('ordena por visitas con compra (en empate, por nombre); los empates comparten lugar (1, 1, 2)', () => {
    const filas = rankingConcurso(
      [compra('1', 'A'), compra('2', 'A'), compra('3', 'B'), compra('4', 'B'), compra('5', 'C'), compra('6', null), compra('7', 'D')],
      [
        { id: 'A', nombre: 'Ana', region: 'Norte' },
        { id: 'B', nombre: 'Beto', region: 'Sur' },
        { id: 'C', nombre: 'Cora', region: null },
      ],
    )
    expect(filas.map((f) => [f.lugar, f.nombre, f.conCompra, f.region])).toEqual([
      [1, 'Ana', 2, 'Norte'],
      [1, 'Beto', 2, 'Sur'],
      [2, 'Cora', 1, null],
      [2, 'D', 1, null], // sin nombre en promotores: su id
      [2, 'Sin promotor', 1, null],
    ])
  })

  it('sin compras, sin ranking', () => {
    expect(rankingConcurso([], [])).toEqual([])
  })
})
