import type { Cliente } from './clientes'
import { normalize } from '../lib/text'

export type OrdenClientes = 'cercania' | 'nombre'

/** ¿Coincide el cliente con lo buscado (nombre, número, dirección o teléfono)? `term` ya normalizado. */
export function coincideCliente(c: Pick<Cliente, 'nombre' | 'direccion' | 'codigo' | 'telefono'>, term: string): boolean {
  if (!term) return true
  return [c.nombre, c.direccion, c.codigo, c.telefono].some((v) => v && normalize(v).includes(term))
}

/** Por cercanía (los que no tienen ubicación al final, por nombre) o por nombre. No cambia la lista original. */
export function ordenarClientes<T extends Pick<Cliente, 'nombre'> & { distance: number | null }>(clientes: T[], orden: OrdenClientes): T[] {
  const porNombre = (a: T, b: T) => a.nombre.localeCompare(b.nombre, 'es')
  return [...clientes].sort((a, b) => {
    if (orden === 'nombre') return porNombre(a, b)
    if (a.distance === null && b.distance === null) return porNombre(a, b)
    if (a.distance === null) return 1
    if (b.distance === null) return -1
    return a.distance - b.distance
  })
}
