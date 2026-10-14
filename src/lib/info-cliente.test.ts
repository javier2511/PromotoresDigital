import { describe, expect, it } from 'vitest'
import { claveColumna, resolverInfoCliente } from './info-cliente'

const columnasFlutterFlow = [
  'id',
  'nombre',
  'promotor_id',
  'Saldo_aprox_en_Puntos',
  'status_autogestion',
  'inscrito_premia',
  'cuponera',
  'Status_cuponera',
  'canal',
  'canjes_ultimos_3_meses',
  'promos_ultimos_3_meses',
  'loteria_ultimos_3_meses',
  'retos_ultimos_3_meses',
  'segmento',
  'ruta',
]

describe('info del cliente', () => {
  it('normaliza nombres de columnas', () => {
    expect(claveColumna('Status_Cuponera')).toBe('statuscuponera')
    expect(claveColumna('Lotería últimos 3 meses')).toBe('loteriaultimos3meses')
  })

  it('encuentra las columnas de FlutterFlow y deja fuera las demás', () => {
    const r = resolverInfoCliente(columnasFlutterFlow, ['id', 'nombre', 'promotor_id'])
    const map = Object.fromEntries(r.map((c) => [c.etiqueta, c.columna]))
    expect(map).toEqual({
      'Saldo aprox. en puntos': 'Saldo_aprox_en_Puntos',
      'Status autogestión': 'status_autogestion',
      'Inscrito en Premia': 'inscrito_premia',
      Cuponera: 'cuponera',
      'Status cuponera': 'Status_cuponera',
      Canal: 'canal',
      Canjes: 'canjes_ultimos_3_meses',
      Promos: 'promos_ultimos_3_meses',
      Lotería: 'loteria_ultimos_3_meses',
      Retos: 'retos_ultimos_3_meses',
    })
  })

  it('el dato más específico gana aunque el genérico no tenga nombre exacto', () => {
    const r = resolverInfoCliente(['tiene_cuponera', 'estatus_cuponera'])
    const map = Object.fromEntries(r.map((c) => [c.etiqueta, c.columna]))
    expect(map['Status cuponera']).toBe('estatus_cuponera')
    expect(map.Cuponera).toBe('tiene_cuponera')
  })

  it('no confunde "promotor" con promos ni usa columnas excluidas', () => {
    const r = resolverInfoCliente(['promotor_id', 'canal'], ['canal'])
    expect(r.every((c) => c.columna === null)).toBe(true)
  })
})
