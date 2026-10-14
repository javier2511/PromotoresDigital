import { describe, expect, it } from 'vitest'
import { columnToDrop, isDataShapeError, localIso } from './visitas'

const err = (message: string, code = '22P02', details = '') => ({ message, code, details, hint: '', name: 'PostgrestError' })

describe('columnToDrop', () => {
  const present = ['cliente_id', 'user_id', 'fecha_inicio', 'latitud', 'longitud', 'distancia', 'estado']
  const order = ['estado', 'fecha_inicio', 'distancia', 'latitud', 'longitud']
  const essential = ['cliente_id', 'user_id']

  it('quita la columna que nombra el error', () => {
    expect(columnToDrop(err("Could not find the 'distancia' column of 'visitas' in the schema cache", 'PGRST204'), present, order, essential)).toBe('distancia')
    expect(columnToDrop(err('new row for relation "visitas" violates check constraint "visitas_estado_check"', '23514'), present, order, essential)).toBe('estado')
  })
  it('si el error no nombra columna, quita primero lo menos importante (la ubicación al final)', () => {
    expect(columnToDrop(err('invalid input value for enum estado_visita: "finalizada"'), present, order, essential)).toBe('estado')
    expect(columnToDrop(err('invalid input syntax for type uuid: "7"'), ['cliente_id', 'user_id', 'latitud'], order, essential)).toBe('latitud')
  })
  it('nunca quita columnas esenciales', () => {
    expect(columnToDrop(err('invalid input syntax for type uuid: "7"'), ['cliente_id', 'user_id'], order, essential)).toBeNull()
    expect(columnToDrop(err('column "user_id" of relation "visitas" does not exist', '42703'), ['cliente_id', 'user_id'], order, essential)).toBeNull()
  })
})

describe('isDataShapeError', () => {
  it('reintenta errores de tipo/columna, no los de permisos ni red', () => {
    expect(isDataShapeError(err('invalid input syntax for type uuid: "7"'))).toBe(true)
    expect(isDataShapeError(err('x', '23514'))).toBe(true)
    expect(isDataShapeError(err('new row violates row-level security policy', '42501'))).toBe(false)
    expect(isDataShapeError(err('TypeError: Failed to fetch', ''))).toBe(false)
    expect(isDataShapeError(err('null value in column "x" violates not-null constraint', '23502'))).toBe(false)
  })
})

describe('localIso', () => {
  it('incluye la zona horaria local', () => {
    expect(localIso(new Date(2026, 9, 14, 9, 5, 7))).toMatch(/^2026-10-14T09:05:07[+-]\d{2}:\d{2}$/)
  })
})
