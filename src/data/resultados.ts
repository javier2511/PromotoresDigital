import type { User } from '@supabase/supabase-js'
import { isNetworkError } from '../lib/errors'
import { isoLocal, type Rango } from '../lib/periodos'
import { ownerCandidates, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Row } from '../lib/supabase'
import { toBoolean } from '../lib/text'
import { idsDe, porGrupos, type Alcance } from './alcance'
import { fetchAll } from './clientes'
import { instante } from './tablero'

export interface Resultados {
  table: string | null
  rows: Row[]
  /** Cómo se filtraron las filas del usuario. */
  filtro: 'usuario' | 'clientes' | 'ninguno'
}

/** Tarjetas que se dibujan como máximo (los resúmenes cuentan todas las filas del periodo). */
export const MAX_RESULTADOS = 2000

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
      if (rows && rows.length > 0) return { table, rows, filtro: 'usuario' }
    }
    return { table, rows: [], filtro: 'usuario' }
  }

  const rows = await fetchAll(() => order(supabase.from(table).select('*', { count: 'exact' })))
  const clienteCol = t.columns.cliente
  if (clienteCol) {
    const mine = rows.filter((r) => clienteKeys.has(String(r[clienteCol])))
    return { table, rows: mine, filtro: 'clientes' }
  }
  // Sin columna de usuario ni de cliente: se muestra lo que las políticas RLS permitan ver.
  return { table, rows, filtro: 'ninguno' }
}

/**
 * Resultados del equipo: de todos los promotores (admin) o de los de su región (líder), los más recientes primero.
 * Llegan todas las filas (el periodo se filtra en la pantalla). Un líder solo pide las filas de sus promotores; la
 * base también lo limita (supabase/14 y 15).
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
  return { table, rows, filtro: ids ? 'usuario' : 'ninguno' }
}

/** Día local ("YYYY-MM-DD") de una fila según su columna de fecha (p. ej. fecha_visita); null si no tiene. */
export function diaResultado(row: Row, fecha: string | undefined): string | null {
  if (!fecha) return null
  const t = instante(row[fecha])
  return t === null ? null : isoLocal(new Date(t))
}

/** Filas del periodo: en Total, todas (también las que no tienen fecha); si no, las de los días del rango. */
export function resultadosDelPeriodo(rows: Row[], fecha: string | undefined, rango: Rango): Row[] {
  if (rango.periodo === 'total' || !fecha) return rows
  return rows.filter((r) => {
    const dia = diaResultado(r, fecha)
    return dia !== null && dia >= rango.desde && dia < rango.hasta
  })
}

/** Primer día con resultados (para "Desde el …" en Total y para empezar el Rango). */
export function primerDiaResultados(rows: Row[], fecha: string | undefined): string | null {
  let min: string | null = null
  for (const r of rows) {
    const dia = diaResultado(r, fecha)
    if (dia && (!min || dia < min)) min = dia
  }
  return min
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
