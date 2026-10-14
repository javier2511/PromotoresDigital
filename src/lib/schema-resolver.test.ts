import { describe, expect, it } from 'vitest'
import { ownerValueFor, pickColumns, type OwnerFilter, type Perfil } from './schema-resolver'

const user = { id: 'auth-uuid', email: 'ana@empresa.com' }
const perfil: Perfil = { id: 7, nombre: 'Ana' }
const owner = (o: Partial<OwnerFilter>): OwnerFilter => ({
  column: 'usuario_id',
  value: 7,
  op: 'eq',
  via: 'perfil',
  matched: true,
  ...o,
})

describe('pickColumns', () => {
  it('usa el primer candidato que existe, sin repetir columnas entre datos', () => {
    const fields = {
      pregunta: ['siguiente_pregunta_id', 'pregunta_id'],
      dependeDe: ['pregunta_padre_id', 'pregunta_id'],
    }
    // Formato "salto": pregunta_id es el origen y siguiente_pregunta_id el destino.
    expect(pickColumns(fields, ['id', 'pregunta_id', 'siguiente_pregunta_id', 'respuesta'])).toEqual({
      pregunta: 'siguiente_pregunta_id',
      dependeDe: 'pregunta_id',
    })
    // Formato "depende de": pregunta_id es el destino.
    expect(pickColumns(fields, ['id', 'pregunta_id', 'pregunta_padre_id', 'valor'])).toEqual({
      pregunta: 'pregunta_id',
      dependeDe: 'pregunta_padre_id',
    })
  })
  it('no distingue mayúsculas y devuelve el nombre real', () => {
    expect(pickColumns({ nombre: ['nombre'] }, ['Nombre'])).toEqual({ nombre: 'Nombre' })
  })
})

describe('ownerValueFor', () => {
  it('usa el correo en columnas de correo', () => {
    expect(ownerValueFor('email_promotor', { owner: null, perfil: null }, user)).toBe('ana@empresa.com')
  })
  it('usa el uuid de Auth en columnas tipo user_id aunque los clientes se ligaran por id de perfil', () => {
    const ctx = { owner: owner({}), perfil }
    expect(ownerValueFor('user_id', ctx, user)).toBe('auth-uuid')
    expect(ownerValueFor('auth_id', ctx, user)).toBe('auth-uuid')
    expect(ownerValueFor('usuario_id', ctx, user)).toBe(7) // misma columna que en clientes
    expect(ownerValueFor('promotor_id', ctx, user)).toBe(7)
  })
  it('respeta el formato con el que se encontraron los clientes', () => {
    const ctx = { owner: owner({ column: 'usuario', via: 'email', value: 'ana@empresa.com', op: 'ilike' }), perfil: null }
    expect(ownerValueFor('usuario', ctx, user)).toBe('ana@empresa.com')
    expect(ownerValueFor('usuario_id', ctx, user)).toBe('auth-uuid')
  })
  it('ignora un filtro de dueño con error', () => {
    const ctx = { owner: owner({ error: 'no coincide', matched: false }), perfil }
    expect(ownerValueFor('usuario_id', ctx, user)).toBe('auth-uuid')
  })
})
