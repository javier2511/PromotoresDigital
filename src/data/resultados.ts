import type { User } from '@supabase/supabase-js'
import { ownerCandidates, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Row } from '../lib/supabase'
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
  const order = (q: ReturnType<ReturnType<typeof supabase.from>['select']>) =>
    t.columns.fecha ? q.order(t.columns.fecha, { ascending: false }) : q

  const userCol = t.columns.usuario
  if (userCol) {
    for (const c of ownerCandidates(userCol, user, ctx.perfil)) {
      const rows = await fetchAll(() => {
        const q = order(supabase.from(table).select('*'))
        return c.op === 'eq' ? q.eq(userCol, c.value) : q.ilike(userCol, String(c.value))
      }).catch(() => null)
      if (rows && rows.length > 0) return { table, rows: rows.slice(0, MAX_ROWS), filtro: 'usuario' }
    }
    return { table, rows: [], filtro: 'usuario' }
  }

  const rows = await fetchAll(() => order(supabase.from(table).select('*')))
  const clienteCol = t.columns.cliente
  if (clienteCol) {
    const mine = rows.filter((r) => clienteKeys.has(String(r[clienteCol])))
    return { table, rows: mine.slice(0, MAX_ROWS), filtro: 'clientes' }
  }
  // Sin columna de usuario ni de cliente: se muestra lo que las políticas RLS permitan ver.
  return { table, rows: rows.slice(0, MAX_ROWS), filtro: 'ninguno' }
}
