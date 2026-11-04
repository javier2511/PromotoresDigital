import { describe, expect, it } from 'vitest'
import { rankingConcurso, type VisitaConcurso } from './concurso'

const v = (key: string, promotor: string | null, conCompra: boolean): VisitaConcurso => ({
  key,
  promotor,
  cliente: null,
  nombreCliente: null,
  conCompra,
  actualizado: null,
  dia: null,
  fechaVisita: null,
})

describe('rankingConcurso', () => {
  it('ordena por visitas con compra; en empate, por porcentaje y nombre; los empates comparten lugar', () => {
    const filas = rankingConcurso(
      [
        v('1', 'A', true),
        v('2', 'A', true),
        v('3', 'A', false),
        v('4', 'B', true),
        v('5', 'B', true),
        v('6', 'C', true),
        v('7', 'C', false),
        v('8', 'C', false),
        v('9', 'D', false),
        v('10', null, true),
      ],
      [
        { id: 'A', nombre: 'Ana', region: 'Norte' },
        { id: 'B', nombre: 'Beto', region: 'Sur' },
        { id: 'C', nombre: 'Cora', region: null },
      ],
    )
    expect(filas.map((f) => [f.lugar, f.nombre, f.conCompra, f.visitas, f.region])).toEqual([
      [1, 'Beto', 2, 2, 'Sur'], // 100%
      [1, 'Ana', 2, 3, 'Norte'], // 67%: mismo lugar (mismas compras)
      [3, 'Sin promotor', 1, 1, null], // 100%
      [3, 'Cora', 1, 3, null], // 33%
      [5, 'D', 0, 1, null], // sin nombre en promotores: su id
    ])
  })

  it('sin visitas, sin ranking', () => {
    expect(rankingConcurso([], [])).toEqual([])
  })
})
