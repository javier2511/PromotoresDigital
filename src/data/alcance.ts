import { esAdmin, type SchemaContext } from '../lib/schema-resolver'
import { supabase } from '../lib/supabase'
import { esVacio, normalize } from '../lib/text'
import { fetchAll } from './clientes'

export interface PromotorEquipo {
  id: string
  nombre: string
  region: string | null
}

/** A quiénes ve el usuario en el Tablero y en Resultados: un admin, a todos; un líder, a los de su región. */
export type Alcance =
  | { tipo: 'todos'; promotores: PromotorEquipo[] }
  | { tipo: 'region'; region: string; promotores: PromotorEquipo[] }

/** Falta ejecutar supabase/14_lideres_por_region.sql (la función region_lider no existe). */
export class FaltaSqlRegiones extends Error {
  constructor() {
    super('Para ver a los promotores de tu región falta ejecutar supabase/14_lideres_por_region.sql en Supabase.')
  }
}

/** El líder no tiene región en la tabla de promotores (o no está activo). */
export class SinRegion extends Error {
  constructor() {
    super('Tu usuario no tiene región asignada. Pide a tu administrador que la llene en la tabla promotores.')
  }
}

/** Filas de promotores que el usuario puede ver (las políticas de Supabase deciden cuáles), con su región. */
export async function leerPromotores(ctx: SchemaContext): Promise<PromotorEquipo[]> {
  const t = ctx.tables.perfiles
  const c = t.columns
  if (!t.table || !c.id) return []
  const filas = await fetchAll(() => supabase.from(t.table!).select('*', { count: 'exact' }).order(c.id!, { ascending: true }))
  // La columna region pudo crearse después de detectar las tablas: también se busca en las filas.
  const colRegion = c.region ?? (filas.length && 'region' in filas[0] ? 'region' : undefined)
  return filas.map((row) => {
    const nombre = c.nombre && !esVacio(row[c.nombre]) ? String(row[c.nombre]).trim() : null
    const correo = c.email && !esVacio(row[c.email]) ? String(row[c.email]).trim() : null
    return {
      id: String(row[c.id!]),
      nombre: nombre ?? correo ?? String(row[c.id!]),
      region: colRegion && !esVacio(row[colRegion]) ? String(row[colRegion]).trim() : null,
    }
  })
}

export async function fetchAlcance(ctx: SchemaContext): Promise<Alcance> {
  // Para el admin los nombres son opcionales: si no se pueden leer, se muestra el id.
  if (esAdmin(ctx)) return { tipo: 'todos', promotores: await leerPromotores(ctx).catch(() => []) }
  const [{ data, error }, promotores] = await Promise.all([supabase.rpc('region_lider'), leerPromotores(ctx)])
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) throw new FaltaSqlRegiones()
    throw error
  }
  // La región la dice la base (la misma con la que decide qué filas ve); aquí solo se filtran los nombres.
  const region = typeof data === 'string' ? data.trim() : ''
  if (!region) throw new SinRegion()
  return {
    tipo: 'region',
    region: ctx.perfil?.region?.trim() || region,
    promotores: promotores.filter((p) => normalize(p.region) === normalize(region)),
  }
}

/** Ids de los promotores a los que se limitan las consultas (null: todos). */
export const idsDe = (alcance: Alcance): string[] | null =>
  alcance.tipo === 'todos' ? null : alcance.promotores.map((p) => p.id)

const GRUPO_IDS = 100

/** Lee por grupos de ids (para no exceder el largo de la URL) y junta las filas; con null, una sola vez y sin filtro. */
export async function porGrupos<T>(ids: string[] | null, leer: (grupo: string[] | null) => Promise<T[]>): Promise<T[]> {
  if (ids === null) return leer(null)
  const grupos: string[][] = []
  for (let i = 0; i < ids.length; i += GRUPO_IDS) grupos.push(ids.slice(i, i + GRUPO_IDS))
  return (await Promise.all(grupos.map((g) => leer(g)))).flat()
}
