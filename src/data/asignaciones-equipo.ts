import { supabase } from '../lib/supabase'
import { normalize } from '../lib/text'
import type { PromotorEquipo } from './alcance'

/** Asignaciones de un promotor en el periodo (las canceladas no cuentan). */
export interface ConteoAsignaciones {
  promotor: string
  total: number
  completadas: number
  pendientes: number
}

/** Falta ejecutar supabase/19_asignaciones_equipo.sql (la función no existe). */
export class FaltaSqlAsignaciones extends Error {
  constructor() {
    super('Para ver las asignaciones de cada promotor falta ejecutar supabase/19_asignaciones_equipo.sql en Supabase.')
  }
}

/** Cuentas por promotor que hace la base (solo admins). `desde`/`hasta` null: sin límite (Total). */
export async function fetchAsignacionesEquipo(desde: string | null, hasta: string | null): Promise<ConteoAsignaciones[]> {
  const { data, error } = await supabase.rpc('pd_asignaciones_por_promotor', { p_desde: desde, p_hasta: hasta })
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) throw new FaltaSqlAsignaciones()
    throw error
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    promotor: String(r.id_promotor),
    total: Number(r.total) || 0,
    completadas: Number(r.completadas) || 0,
    pendientes: Number(r.pendientes) || 0,
  }))
}

export interface FilaAsignaciones extends ConteoAsignaciones {
  nombre: string
  region: string | null
  /** Completadas / asignadas (0 a 1). */
  avance: number
}

export type OrdenAsignaciones = 'pendientes' | 'nombre'

/** Une las cuentas con el nombre y la región de cada promotor y las ordena (más pendientes primero, o por nombre). */
export function filasAsignaciones(
  conteos: ConteoAsignaciones[],
  promotores: PromotorEquipo[],
  orden: OrdenAsignaciones,
): FilaAsignaciones[] {
  const info = new Map(promotores.map((p) => [p.id, p]))
  const filas = conteos.map((c) => ({
    ...c,
    nombre: info.get(c.promotor)?.nombre ?? c.promotor,
    region: info.get(c.promotor)?.region ?? null,
    avance: c.total ? c.completadas / c.total : 0,
  }))
  const porNombre = (a: FilaAsignaciones, b: FilaAsignaciones) => a.nombre.localeCompare(b.nombre, 'es')
  return filas.sort((a, b) => (orden === 'pendientes' ? b.pendientes - a.pendientes || porNombre(a, b) : porNombre(a, b)))
}

/** Clave de región para filtrar ('' = sin región), como en el Tablero. */
export const claveRegion = (region: string | null) => normalize(region)
