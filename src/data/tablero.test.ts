import { describe, expect, it } from 'vitest'
import type { Row } from '../lib/supabase'
import { rangoDe } from '../lib/periodos'
import {
  calcularIndicadores,
  columnasResultados,
  construirVisitas,
  instante,
  metrosDe,
  minutosDe,
  porBarra,
  porPromotor,
  tiemposEntreVisitas,
  type ColumnasTablero,
} from './tablero'

// Las pruebas corren con la zona horaria de México (vitest.config.ts), como los teléfonos de los promotores:
// fecha_fin se guarda en hora local, sin zona.

const columnas: ColumnasTablero = {
  r: {
    visita: 'id_visita',
    usuario: 'id_promotor',
    fecha: 'fecha_visita',
    indicador: 'digital_post_visita',
    id: 'id_resultado',
    actualizado: 'fecha_actualizacion',
  },
  v: { id: 'id_visita', usuario: 'id_promotor', inicio: 'hora_inicio', fin: 'fecha_fin', finHora: 'hora_fin', registro: 'fecha_visita' },
  distancia: ['distancia_checkin_m', 'distancia_checkin'],
}

const res = (id_resultado: number, id_visita: number | null, id_promotor: string, digital: boolean, extra: Row = {}): Row => ({
  id_resultado,
  id_visita,
  id_cliente: `C${id_resultado}`,
  id_promotor,
  fecha_visita: null,
  digital_post_visita: digital,
  fecha_actualizacion: '2026-10-22T00:00:00',
  ...extra,
})

const resultados: Row[] = [
  res(1, 1, 'A', true),
  // Visita 2 cargada dos veces: cuenta la fila más reciente (sin compra).
  res(2, 2, 'A', true, { fecha_actualizacion: '2026-10-20T00:00:00' }),
  res(3, 2, 'A', false, { fecha_actualizacion: '2026-10-22T00:00:00' }),
  res(4, 3, 'A', true),
  res(5, 4, 'B', false),
  res(6, 5, 'B', true),
  res(7, 6, 'A', false),
  // Sin id de visita: su día sale de resultados.fecha_visita (hora local).
  res(8, null, 'C', false, { fecha_visita: '2026-10-21T12:00:00' }),
]

const visitas: Row[] = [
  { id_visita: 1, id_promotor: 'A', hora_inicio: '2026-10-19T16:00:00+00:00', hora_fin: '2026-10-19T16:15:00+00:00', fecha_fin: '2026-10-19T10:15:00', distancia_checkin_m: 40 },
  { id_visita: 2, id_promotor: 'A', hora_inicio: '2026-10-19T10:35:00-06:00', hora_fin: '2026-10-19T10:55:00-06:00', distancia_checkin_m: 150 },
  // Sin hora_fin: la duración sale de fecha_fin (hora local); distancia de la otra columna.
  { id_visita: 3, id_promotor: 'A', hora_inicio: '2026-10-19T11:10:00-06:00', fecha_fin: '2026-10-19T11:40:00', distancia_checkin: 80 },
  // FlutterFlow: hora_inicio sin zona (desfasada) y sin fin: el día y la hora salen de fecha_visita.
  { id_visita: 4, id_promotor: 'B', hora_inicio: '2026-10-20T09:00:00+00:00', fecha_visita: '2026-10-20T15:00:26.41046+00:00', distancia_checkin_m: 16937 },
  // 19:30 en México ya es el 21 en UTC: cuenta el 20.
  { id_visita: 5, id_promotor: 'B', hora_inicio: '2026-10-21T01:30:00+00:00', hora_fin: '2026-10-21T01:40:00+00:00', distancia_checkin_m: 60 },
  // Quedó abierta 6 horas: no cuenta en el tiempo de visita.
  { id_visita: 6, id_promotor: 'A', hora_inicio: '2026-10-21T09:00:00-06:00', hora_fin: '2026-10-21T15:00:00-06:00' },
]

describe('instante', () => {
  it('lee fechas de Supabase con y sin zona horaria', () => {
    expect(instante('2026-10-14T18:31:26.41046+00:00')).toBe(Date.UTC(2026, 9, 14, 18, 31, 26, 410))
    expect(instante('2026-10-14 18:31:26+00')).toBe(Date.UTC(2026, 9, 14, 18, 31, 26))
    expect(instante('2026-10-14T12:31:26')).toBe(new Date(2026, 9, 14, 12, 31, 26).getTime())
    expect(instante('2026-10-14')).toBe(new Date(2026, 9, 14).getTime())
    for (const v of [null, '', 'null', 'abc', true, 15]) expect(instante(v)).toBeNull()
  })
})

describe('construirVisitas', () => {
  const lista = construirVisitas(resultados, visitas, columnas)
  const v = (key: string) => lista.find((x) => x.key === key)!

  it('una por visita, con la fila de resultados más reciente', () => {
    expect(lista).toHaveLength(7)
    expect(v('2').conCompra).toBe(false)
    expect(v('1').conCompra).toBe(true)
  })

  it('duración: hora_fin, si no fecha_fin; las de más de 4 h no cuentan', () => {
    expect(v('1').duracion).toBe(15)
    expect(v('3').duracion).toBe(30)
    expect(v('4').duracion).toBeNull()
    expect(v('6').duracion).toBeNull()
  })

  it('día y hora locales', () => {
    expect([v('1').dia, v('1').hora]).toEqual(['2026-10-19', 10])
    expect([v('4').dia, v('4').hora]).toEqual(['2026-10-20', 9])
    expect([v('5').dia, v('5').hora]).toEqual(['2026-10-20', 19])
    expect(v('#7').dia).toBe('2026-10-21')
    expect(v('#7').promotor).toBe('C')
  })

  it('distancia del check-in', () => {
    expect(v('3').distancia).toBe(80)
    expect(v('6').distancia).toBeNull()
  })
})

describe('indicadores', () => {
  const lista = construirVisitas(resultados, visitas, columnas)
  const ind = calcularIndicadores(lista, 100)

  it('visitas, con compra y por figura (visitas / días / promotores)', () => {
    expect(ind.visitas).toBe(7)
    expect(ind.conCompra).toBe(3)
    expect(ind.dias).toBe(3)
    expect(ind.promotores).toBe(3)
    expect(ind.diarias).toBeCloseTo(7 / 3 / 3)
    expect(ind.diariasConCompra).toBeCloseTo(3 / 3 / 3)
  })

  it('tiempos promedio', () => {
    expect(ind.tiempoVisita).toEqual({ valor: (15 + 20 + 30 + 10) / 4, n: 4 })
    expect(ind.tiempoVisitaConCompra.valor).toBeCloseTo((15 + 30 + 10) / 3)
    // A el 19: 10:15 → 10:35 (20 min) y 10:55 → 11:10 (15 min). B el 20: la primera no tiene fin.
    expect(tiemposEntreVisitas(lista).sort((a, b) => a - b)).toEqual([15, 20])
    expect(ind.tiempoNuevaVisita).toEqual({ valor: 17.5, n: 2 })
  })

  it('geoeficiencia: distancia promedio y cuántos a menos del radio', () => {
    expect(ind.distancia).toEqual({ valor: (40 + 150 + 80 + 16937 + 60) / 5, n: 5 })
    expect(ind.dentroRadio).toBe(3)
  })

  it('sin visitas no divide entre cero', () => {
    const vacio = calcularIndicadores([])
    expect([vacio.visitas, vacio.diarias, vacio.tiempoVisita.valor, vacio.distancia.valor]).toEqual([0, null, null, null])
  })
})

describe('por promotor y por barra', () => {
  const lista = construirVisitas(resultados, visitas, columnas)

  it('solo los promotores con visitas, de más a menos visitas', () => {
    const filas = porPromotor(lista, [
      { id: 'A', nombre: 'Ana' },
      { id: 'B', nombre: 'Beto' },
      { id: 'D', nombre: 'Diana' },
    ])
    expect(filas.map((f) => [f.nombre, f.indicadores.visitas])).toEqual([
      ['Ana', 4],
      ['Beto', 2],
      ['C', 1],
    ])
    expect(filas[0].indicadores.diarias).toBe(2) // 4 visitas en 2 días
  })

  it('visitas por día de la semana (los días que no llegan quedan vacíos)', () => {
    const barras = porBarra(lista, rangoDe('semana', '2026-10-21'), { ahora: new Date(2026, 9, 21, 12) })
    expect(barras.map((b) => [b.clave, b.visitas, b.conCompra, b.futuro])).toEqual([
      ['2026-10-19', 3, 2, false],
      ['2026-10-20', 2, 1, false],
      ['2026-10-21', 2, 0, false],
      ['2026-10-22', 0, 0, true],
      ['2026-10-23', 0, 0, true],
      ['2026-10-24', 0, 0, true],
      ['2026-10-25', 0, 0, true],
    ])
  })

  it('visitas por hora de un día', () => {
    const delDia = lista.filter((x) => x.dia === '2026-10-20')
    const barras = porBarra(delDia, rangoDe('dia', '2026-10-20'), { ahora: new Date(2026, 9, 25, 12) })
    expect(barras[0].clave).toBe('8')
    expect(barras.at(-1)!.clave).toBe('19')
    expect(barras.find((b) => b.clave === '9')!.visitas).toBe(1)
    expect(barras.find((b) => b.clave === '19')!.conCompra).toBe(1)
  })
})

describe('resultados_visitas con minutos y distancia ya calculados', () => {
  it('encuentra las columnas por nombre exacto o por palabras', () => {
    expect(
      columnasResultados([
        'id_resultado',
        'id_visita',
        'id_cliente',
        'nombre_cliente',
        'id_promotor',
        'fecha_visita',
        'digital_post_venta',
        'fecha_actualizacion',
        'tiempo_visita',
        'tiempo_nueva_visita',
        'distancia_checkin',
      ]),
    ).toMatchObject({
      visita: 'id_visita',
      usuario: 'id_promotor',
      fecha: 'fecha_visita',
      indicador: 'digital_post_venta',
      minutosVisita: 'tiempo_visita',
      minutosNuevaVisita: 'tiempo_nueva_visita',
      distancia: 'distancia_checkin',
    })
    expect(
      columnasResultados(['id_visita', 'id_promotor', 'fecha_visita', 'Compra Autogestionada', 'Minutos para nueva visita', 'Minutos de la visita', 'Distancia al check in km']),
    ).toMatchObject({
      indicador: 'Compra Autogestionada',
      minutosVisita: 'Minutos de la visita',
      minutosNuevaVisita: 'Minutos para nueva visita',
      distancia: 'Distancia al check in km',
    })
  })

  it('lee minutos (número, segundos u HH:MM:SS) y metros (o km)', () => {
    expect(minutosDe(12.5, 'tiempo_visita')).toBe(12.5)
    expect(minutosDe('12,5', 'tiempo_visita')).toBe(12.5)
    expect(minutosDe('00:15:30', 'tiempo_visita')).toBe(15.5)
    expect(minutosDe(90, 'tiempo_visita_seg')).toBe(1.5)
    expect(minutosDe(-3, 'tiempo_visita')).toBeNull()
    expect(minutosDe(null, 'tiempo_visita')).toBeNull()
    expect(metrosDe(35, 'distancia_checkin')).toBe(35)
    expect(metrosDe('1.2', 'distancia_km')).toBe(1200)
  })

  it('usa los valores de la tabla tal cual (sin calcular ni descartar) y las horas de visitas solo para el día', () => {
    const r = (id_visita: number, digital: boolean, tiempo: unknown, nueva: unknown, distancia: unknown, fecha = '2026-10-19T10:00:00'): Row => ({
      id_resultado: id_visita,
      id_visita,
      id_promotor: 'A',
      fecha_visita: fecha,
      digital_post_visita: digital,
      tiempo_visita: tiempo,
      tiempo_nueva_visita: nueva,
      distancia_checkin: distancia,
    })
    const filas = [
      r(1, true, 17, null, 45),
      r(2, false, 300, 18, 140),
      r(3, true, '00:12:30', 9, 75),
      // Sin fila en visitas: su día sale de fecha_visita.
      r(4, false, null, null, null, '2026-10-20T09:00:00'),
    ]
    // En visitas la visita 1 duró 15 min y la 2 dice otro día: mandan resultados_visitas (como en el reporte).
    const enVisitas: Row[] = [
      { id_visita: 1, hora_inicio: '2026-10-19T16:00:00+00:00', hora_fin: '2026-10-19T16:15:00+00:00', distancia_checkin_m: 999 },
      { id_visita: 2, hora_inicio: '2026-10-19T01:00:00+00:00', hora_fin: '2026-10-19T01:30:00+00:00' },
    ]
    const cols: ColumnasTablero = { ...columnas, r: columnasResultados(Object.keys(filas[0])) }
    const lista = construirVisitas(filas, enVisitas, cols)
    expect(lista.map((v) => [v.key, v.duracion, v.minutosNueva, v.distancia, v.dia])).toEqual([
      ['1', 17, null, 45, '2026-10-19'],
      ['2', 300, 18, 140, '2026-10-19'],
      ['3', 12.5, 9, 75, '2026-10-19'],
      ['4', null, null, null, '2026-10-20'],
    ])
    const ind = calcularIndicadores(lista, 100)
    expect(ind.tiempoVisita).toEqual({ valor: (17 + 300 + 12.5) / 3, n: 3 })
    expect(ind.tiempoVisitaConCompra).toEqual({ valor: (17 + 12.5) / 2, n: 2 })
    expect(ind.tiempoNuevaVisita).toEqual({ valor: (18 + 9) / 2, n: 2 })
    expect(ind.distancia).toEqual({ valor: (45 + 140 + 75) / 3, n: 3 })
    expect(ind.dentroRadio).toBe(2)
  })
})

describe('días elegidos', () => {
  it('la gráfica muestra solo los días elegidos', () => {
    const lista = construirVisitas(resultados, visitas, columnas)
    const barras = porBarra(lista, rangoDe('semana', '2026-10-21'), {
      ahora: new Date(2026, 9, 25, 12),
      soloDias: ['2026-10-21', '2026-10-19'],
    })
    expect(barras.map((b) => [b.clave, b.visitas])).toEqual([
      ['2026-10-19', 3],
      ['2026-10-21', 2],
    ])
  })
})
