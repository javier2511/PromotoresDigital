import type { User } from '@supabase/supabase-js'
import { isNetworkError } from '../lib/errors'
import { ownerCandidates, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Row } from '../lib/supabase'
import { toBoolean } from '../lib/text'
import { idsDe, porGrupos, type Alcance } from './alcance'
import { fetchAll } from './clientes'

export interface Resultados {
  table: string | null
  rows: Row[]
  /** Cómo se filtraron las filas del usuario. */
  filtro: 'usuario' | 'clientes' | 'ninguno'
  /** Había más de MAX_RESULTADOS: solo llegan las más recientes. */
  limitado?: boolean
}

export const MAX_RESULTADOS = 2000
const MAX_ROWS = MAX_RESULTADOS

type Consulta = ReturnType<ReturnType<typeof supabase.from>['select']>

/** Orden estable para paginar: por fecha (más reciente primero) y desempate por id si existe. */
function ordenar(t: SchemaContext['tables']['resultados'], q: Consulta) {
  const byDate = t.columns.fecha ? q.order(t.columns.fecha, { ascending: false }) : q
  const idCol = t.allColumns?.find((c) => ['id', 'id_resultado', 'resultado_id'].includes(c))
  return idCol ? byDate.order(idCol, { ascending: true }) : byDate
}

/** Filas de la tabla de resultados que corresponden al usuario (por columna de usuario, o por sus clientes). */
export async function fetchResultados(
  ctx: SchemaContext,
  user: User,
  clienteKeys: Set<string>,
): Promise<Resultados> {
  const t = ctx.tables.resultados
  if (!t.table) return { table: null, rows: [], filtro: 'ninguno' }
  const table = t.table
  const order = (q: Consulta) => ordenar(t, q)

  const userCol = t.columns.usuario
  if (userCol) {
    for (const c of ownerCandidates(userCol, user, ctx.perfil)) {
      const rows = await fetchAll(() => {
        const q = order(supabase.from(table).select('*', { count: 'exact' }))
        return c.op === 'eq' ? q.eq(userCol, c.value) : q.ilike(userCol, String(c.value))
      }).catch((error: unknown) => {
        if (isNetworkError(error)) throw error
        return null // p. ej. la columna es numérica y se comparó con un uuid: se prueba la siguiente forma
      })
      if (rows && rows.length > 0) return { table, rows: rows.slice(0, MAX_ROWS), filtro: 'usuario' }
    }
    return { table, rows: [], filtro: 'usuario' }
  }

  const rows = await fetchAll(() => order(supabase.from(table).select('*', { count: 'exact' })))
  const clienteCol = t.columns.cliente
  if (clienteCol) {
    const mine = rows.filter((r) => clienteKeys.has(String(r[clienteCol])))
    return { table, rows: mine.slice(0, MAX_ROWS), filtro: 'clientes' }
  }
  // Sin columna de usuario ni de cliente: se muestra lo que las políticas RLS permitan ver.
  return { table, rows: rows.slice(0, MAX_ROWS), filtro: 'ninguno' }
}

/**
 * Resultados del equipo: de todos los promotores (admin) o de los de su región (líder), los más recientes primero.
 * Un líder solo pide las filas de sus promotores; la base también lo limita (supabase/14 y 15).
 */
export async function fetchResultadosEquipo(ctx: SchemaContext, alcance: Alcance): Promise<Resultados> {
  const t = ctx.tables.resultados
  if (!t.table) return { table: null, rows: [], filtro: 'ninguno' }
  const table = t.table
  const userCol = t.columns.usuario
  const ids = idsDe(alcance)
  if (ids && !userCol) return { table, rows: [], filtro: 'usuario' }
  const rows = await porGrupos(ids, (grupo) =>
    fetchAll(() => {
      const q = ordenar(t, supabase.from(table).select('*', { count: 'exact' }))
      return grupo ? q.in(userCol!, grupo) : q
    }),
  )
  // Si se pidieron por grupos de promotores, se ordenan juntos (estable: respeta el orden de la base en empates).
  const fecha = t.columns.fecha
  if (fecha && ids) {
    rows.sort((a, b) => String(b[fecha] ?? '').localeCompare(String(a[fecha] ?? '')))
  }
  return { table, rows: rows.slice(0, MAX_ROWS), filtro: ids ? 'usuario' : 'ninguno', limitado: rows.length > MAX_ROWS }
}

export interface Resumen {
  visitados: number
  /** Clientes con el indicador en Sí (null si la tabla no tiene esa columna). */
  conIndicador: number | null
}

/**
 * Clientes distintos en los resultados y cuántos tienen el indicador (p. ej. digital_post_visita) en Sí.
 * Si un cliente aparece varias veces cuenta su registro más reciente (las filas llegan de la más nueva a la más vieja).
 */
export function resumirResultados(rows: Row[], cliente: string | undefined, indicador: string | undefined): Resumen {
  const porCliente = new Map<string, Row>()
  rows.forEach((row, i) => {
    const key = cliente && row[cliente] !== null && row[cliente] !== undefined ? String(row[cliente]) : `#${i}`
    if (!porCliente.has(key)) porCliente.set(key, row)
  })
  const ultimos = [...porCliente.values()]
  return {
    visitados: ultimos.length,
    conIndicador: indicador ? ultimos.filter((r) => toBoolean(r[indicador]) === true).length : null,
  }
}
