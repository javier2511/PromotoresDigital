import { describe, expect, it } from 'vitest'
import { diasDelRango, etiquetaPeriodo, fechaLarga, moverPeriodo, partesPeriodo, rangoDe, semanaIso } from './periodos'

describe('rangoDe', () => {
  it('semana de lunes a domingo (el domingo pertenece a la semana que empezó el lunes)', () => {
    expect(rangoDe('semana', '2026-10-25')).toEqual({ periodo: 'semana', desde: '2026-10-19', hasta: '2026-10-26' })
    expect(rangoDe('semana', '2026-10-19')).toEqual({ periodo: 'semana', desde: '2026-10-19', hasta: '2026-10-26' })
    expect(rangoDe('semana', '2026-12-31')).toEqual({ periodo: 'semana', desde: '2026-12-28', hasta: '2027-01-04' })
  })

  it('día y mes', () => {
    expect(rangoDe('dia', '2026-10-31')).toEqual({ periodo: 'dia', desde: '2026-10-31', hasta: '2026-11-01' })
    expect(rangoDe('mes', '2026-10-25')).toEqual({ periodo: 'mes', desde: '2026-10-01', hasta: '2026-11-01' })
    expect(rangoDe('mes', '2026-12-05')).toEqual({ periodo: 'mes', desde: '2026-12-01', hasta: '2027-01-01' })
  })
})

describe('total', () => {
  it('abarca cualquier fecha y no se mueve', () => {
    const r = rangoDe('total', '2026-10-26')
    expect(r.periodo).toBe('total')
    expect('2020-01-01' >= r.desde && '2030-12-31' < r.hasta).toBe(true)
    expect(moverPeriodo('total', '2026-10-26', 1)).toBe('2026-10-26')
    expect(etiquetaPeriodo(r, '2026-10-26')).toBe('Todas las visitas')
  })
})

describe('moverPeriodo', () => {
  it('mueve días, semanas y meses (sin pasarse del último día del mes)', () => {
    expect(moverPeriodo('dia', '2026-11-01', -1)).toBe('2026-10-31')
    expect(moverPeriodo('semana', '2026-10-25', -1)).toBe('2026-10-18')
    expect(moverPeriodo('mes', '2026-03-31', 1)).toBe('2026-04-30')
    expect(moverPeriodo('mes', '2026-01-15', -1)).toBe('2025-12-15')
  })
})

describe('semanaIso y etiquetas', () => {
  it('número de semana ISO', () => {
    expect(semanaIso('2026-10-19')).toBe(43)
    expect(semanaIso('2026-10-25')).toBe(43)
    expect(semanaIso('2027-01-01')).toBe(53)
    expect(semanaIso('2026-01-01')).toBe(1)
  })

  it('texto del periodo', () => {
    const hoy = '2026-10-25'
    expect(etiquetaPeriodo(rangoDe('dia', hoy), hoy)).toBe('Hoy')
    expect(etiquetaPeriodo(rangoDe('dia', '2026-10-24'), hoy)).toBe('Ayer')
    expect(etiquetaPeriodo(rangoDe('dia', '2026-10-20'), hoy)).toBe('Mar 20 oct')
    expect(etiquetaPeriodo(rangoDe('semana', hoy), hoy)).toBe('Semana 43 · 19 – 25 oct')
    expect(etiquetaPeriodo(rangoDe('semana', '2026-10-28'), hoy)).toBe('Semana 44 · 26 oct – 1 nov')
    expect(etiquetaPeriodo(rangoDe('mes', hoy), hoy)).toBe('Octubre 2026')
    expect(etiquetaPeriodo(rangoDe('dia', '2025-12-31'), hoy)).toBe('Mié 31 dic 2025')
    expect(fechaLarga('2026-10-20', hoy)).toBe('martes 20 de octubre')
    expect(partesPeriodo(rangoDe('semana', hoy), hoy)).toEqual({ titulo: '19 – 25 oct', detalle: 'Semana 43' })
    expect(partesPeriodo(rangoDe('dia', hoy), hoy)).toEqual({ titulo: 'Dom 25 oct', detalle: 'Hoy' })
    expect(partesPeriodo(rangoDe('mes', hoy), hoy)).toEqual({ titulo: 'Octubre 2026', detalle: null })
  })

  it('días del rango', () => {
    expect(diasDelRango(rangoDe('mes', '2026-10-25'))).toHaveLength(31)
    expect(diasDelRango(rangoDe('semana', '2026-10-25'))).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ])
  })
})
