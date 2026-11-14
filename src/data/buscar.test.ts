import { describe, expect, it } from 'vitest'
import { coincideCliente, ordenarClientes } from './buscar'

const c = (nombre: string, distance: number | null, extra: Partial<{ direccion: string; codigo: string; telefono: string }> = {}) => ({
  nombre,
  distance,
  direccion: extra.direccion ?? null,
  codigo: extra.codigo ?? null,
  telefono: extra.telefono ?? null,
})

describe('buscar clientes', () => {
  it('coincide por nombre (sin acentos ni mayúsculas), número, dirección o teléfono', () => {
    const tienda = c('Abarrotes La Güera', 20, { direccion: 'Av. Chapultepec 120', codigo: '120070912', telefono: '55 1234 5678' })
    expect(coincideCliente(tienda, 'guera')).toBe(true)
    expect(coincideCliente(tienda, '120070')).toBe(true)
    expect(coincideCliente(tienda, 'chapultepec')).toBe(true)
    expect(coincideCliente(tienda, '1234')).toBe(true)
    expect(coincideCliente(tienda, 'lupita')).toBe(false)
    expect(coincideCliente(tienda, '')).toBe(true)
  })

  it('ordena por cercanía (sin ubicación al final) o por nombre', () => {
    const lista = [c('Zapatería', 500), c('Abarrotes', null), c('Miscelánea', 50), c('Bodega', null)]
    expect(ordenarClientes(lista, 'cercania').map((x) => x.nombre)).toEqual(['Miscelánea', 'Zapatería', 'Abarrotes', 'Bodega'])
    expect(ordenarClientes(lista, 'nombre').map((x) => x.nombre)).toEqual(['Abarrotes', 'Bodega', 'Miscelánea', 'Zapatería'])
    expect(lista[0].nombre).toBe('Zapatería') // no cambia la original
  })
})
