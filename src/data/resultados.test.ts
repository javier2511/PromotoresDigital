import { describe, expect, it } from 'vitest'
import { resumirResultados } from './resultados'

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
