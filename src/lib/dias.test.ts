import { describe, expect, it } from 'vitest'
import { diaHoy, diasDe } from './dias'

describe('diasDe', () => {
  it('entiende nombres, abreviaturas, números y varios días', () => {
    expect(diasDe('Martes')).toEqual([2])
    expect(diasDe('MIÉRCOLES')).toEqual([3])
    expect(diasDe('miercoles')).toEqual([3])
    expect(diasDe('Sáb')).toEqual([6])
    expect(diasDe('5')).toEqual([5])
    expect(diasDe('0')).toEqual([7])
    expect(diasDe('Lunes, Jueves')).toEqual([1, 4])
    expect(diasDe('lunes y viernes')).toEqual([1, 5])
    expect(diasDe('L/J')).toEqual([1, 4])
    expect(diasDe(['Martes', 'Jueves'])).toEqual([2, 4])
  })
  it('ignora lo que no es un día', () => {
    expect(diasDe(null)).toEqual([])
    expect(diasDe('')).toEqual([])
    expect(diasDe('Quincenal')).toEqual([])
    expect(diasDe('M')).toEqual([]) // ¿martes o miércoles?
  })
  it('día de hoy', () => {
    expect(diaHoy(new Date(2026, 9, 14))).toBe(3) // miércoles
    expect(diaHoy(new Date(2026, 9, 18))).toBe(7) // domingo
  })
})
