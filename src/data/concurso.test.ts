import { describe, expect, it } from 'vitest'
import { rankingConcurso, type VisitaConcurso } from './concurso'

const v = (key: string, promotor: string | null, conCompra: boolean): VisitaConcurso => ({
  key,
  promotor,
  cliente: null,
  nombreCliente: null,
  conCompra,
  actualizado: null,
  diaActualizacion: null,
  fechaVisita: null,
  diaVisita: null,
})

describe('rankingConcurso', () => {
  it('ordena por visitas con compra; en empate, por porcentaje y nombre; los empates comparten lugar', () => {
    const visitas = [
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
    ]
    const filas = rankingConcurso(
      visitas,
      visitas.filter((x) => x.conCompra),
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

  it('las visitas cuentan todas (con o sin compra); las compras, las del periodo aunque la visita sea de antes', () => {
    // A hizo 3 visitas en el periodo (una con compra); además se actualizó la compra de una visita anterior.
    const visitas = [v('1', 'A', true), v('2', 'A', false), v('3', 'A', false), v('4', 'B', false)]
    const compras = [v('1', 'A', true), v('0', 'A', true)]
    expect(rankingConcurso(visitas, compras, []).map((f) => [f.lugar, f.id, f.conCompra, f.visitas])).toEqual([
      [1, 'A', 2, 3],
      [2, 'B', 0, 1],
    ])
  })

  it('sin visitas, sin ranking', () => {
    expect(rankingConcurso([], [], [])).toEqual([])
  })
})
