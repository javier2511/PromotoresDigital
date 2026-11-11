import { describe, expect, it } from 'vitest'
import { MENSAJE_CUENTA_INACTIVA } from './cuenta-inactiva'
import { friendlyError } from './errors'

describe('friendlyError', () => {
  it('usuario desactivado: cuenta bloqueada en Supabase o escritura rechazada por la base', () => {
    expect(friendlyError({ message: 'User is banned', code: 'user_banned', status: 400 })).toBe(MENSAJE_CUENTA_INACTIVA)
    expect(friendlyError({ message: 'Tu usuario está desactivado. Habla con tu administrador.', code: 'P0001' })).toBe(MENSAJE_CUENTA_INACTIVA)
  })

  it('contraseña incorrecta', () => {
    expect(friendlyError({ message: 'Invalid login credentials' })).toBe('Correo o contraseña incorrectos.')
  })
})
