import type { User } from '@supabase/supabase-js'
import { isNetworkError } from '../lib/errors'
import { ownerCandidates, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Row } from '../lib/supabase'
import { toBoolean } from '../lib/text'
import { fetchAll } from './clientes'

export interface Resultados {
  table: string | null
  rows: Row[]
  /** Cómo se filtraron las filas del usuario. */
  filtro: 'usuario' | 'clientes' | 'ninguno'
}

const MAX_ROWS = 2000

/** Filas de la tabla de resultados que corresponden al usuario (por columna de usuario, o por sus clientes). */
export async function fetchResultados(
  ctx: SchemaContext,
  user: User,
  clienteKeys: Set<string>,
): Promise<Resultados> {
  const t = ctx.tables.resultados
  if (!t.table) return { table: null, rows: [], filtro: 'ninguno' }
  const table = t.table
  // Orden estable para paginar: por fecha (más reciente primero) y desempate por id si existe.
  const order = (q: ReturnType<ReturnType<typeof supabase.from>['select']>) => {
    const byDate = t.columns.fecha ? q.order(t.columns.fecha, { ascending: false }) : q
    const idCol = t.allColumns?.find((c) => ['id', 'id_resultado', 'resultado_id'].includes(c))
    return idCol ? byDate.order(idCol, { ascending: true }) : byDate
  }

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
