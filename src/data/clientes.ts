import type { PostgrestError, User } from '@supabase/supabase-js'
import { VALORES_VISITADO } from '../config/schema'
import { locationFromColumns, parseLocation, type LatLng } from '../lib/geo'
import { likeExact, ownerValueFor, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Id, type Row } from '../lib/supabase'
import { normalize, toBoolean } from '../lib/text'

export interface Cliente {
  id: Id
  /** Id como texto (para rutas y llaves). */
  key: string
  nombre: string
  direccion: string | null
  telefono: string | null
  codigo: string | null
  location: LatLng | null
  visitado: boolean
  /** Fila completa, para mostrar todas las propiedades que cargaste. */
  raw: Row
}

export class SchemaError extends Error {}

const PAGE = 1000

interface RangeQuery {
  range(from: number, to: number): PromiseLike<{ data: unknown; error: PostgrestError | null }>
}

/** Lee todas las filas de una consulta, de 1000 en 1000 (límite por defecto de Supabase). */
export async function fetchAll(build: () => RangeQuery): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    const page = (data as Row[] | null) ?? []
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

interface Filterable<Q> {
  eq(column: string, value: unknown): Q
  ilike(column: string, pattern: string): Q
}

/** Filtra por usuario: correos sin importar mayúsculas, ids por igualdad. */
export function whereUser<Q extends Filterable<Q>>(query: Q, column: string, value: string | number): Q {
  return typeof value === 'string' && value.includes('@')
    ? query.ilike(column, likeExact(value))
    : query.eq(column, value)
}

export function isVisitedValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (toBoolean(value) === true) return true
  return VALORES_VISITADO.includes(normalize(value))
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s ? s : null
}

function toCliente(row: Row, ctx: SchemaContext, visitedIds: Set<string> | null): Cliente {
  const c = ctx.tables.clientes.columns
  const id = row[c.id!] as Id
  const key = String(id)
  let location: LatLng | null = null
  if (c.latitud && c.longitud) location = locationFromColumns(row[c.latitud], row[c.longitud])
  if (!location && c.ubicacion) location = parseLocation(row[c.ubicacion])
  const visitado = c.visitado ? isVisitedValue(row[c.visitado]) : (visitedIds?.has(key) ?? false)
  return {
    id,
    key,
    nombre: text(c.nombre ? row[c.nombre] : null) ?? `Cliente ${key}`,
    direccion: text(c.direccion ? row[c.direccion] : null),
    telefono: text(c.telefono ? row[c.telefono] : null),
    codigo: text(c.codigo ? row[c.codigo] : null),
    location,
    visitado,
    raw: row,
  }
}

/** Ids de clientes con alguna visita registrada (solo si la tabla de clientes no tiene columna "visitado"). */
async function fetchVisitedIds(ctx: SchemaContext, user: User): Promise<Set<string>> {
  const v = ctx.tables.visitas
  if (!v.table || !v.columns.cliente) return new Set()
  const clienteCol = v.columns.cliente
  const usuarioCol = v.columns.usuario
  const rows = await fetchAll(() => {
    const q = supabase.from(v.table!).select(clienteCol)
    return usuarioCol ? whereUser(q, usuarioCol, ownerValueFor(usuarioCol, ctx, user)) : q
  })
  return new Set(rows.map((r) => String(r[clienteCol])))
}

export async function fetchClientes(ctx: SchemaContext, user: User): Promise<Cliente[]> {
  const t = ctx.tables.clientes
  if (!t.table) throw new SchemaError('No se encontró la tabla de clientes en Supabase.')
  if (!t.columns.id) throw new SchemaError(`La tabla "${t.table}" no tiene una columna de id reconocible.`)
  const owner = ctx.owner
  const [rows, visitedIds] = await Promise.all([
    fetchAll(() => {
      const q = supabase.from(t.table!).select('*').order(t.columns.id!, { ascending: true })
      if (!owner) return q
      return owner.op === 'eq' ? q.eq(owner.column, owner.value) : q.ilike(owner.column, String(owner.value))
    }),
    t.columns.visitado ? Promise.resolve(null) : fetchVisitedIds(ctx, user),
  ])
  return rows.map((row) => toCliente(row, ctx, visitedIds))
}

/** Valor a escribir en la columna "visitado", imitando lo que ya hay en tus datos. */
export function visitadoValue(clientes: Cliente[], column: string, fallbackText: string): unknown {
  const values = clientes.map((c) => c.raw[column]).filter((v) => v !== null && v !== undefined && v !== '')
  if (values.some((v) => typeof v === 'boolean')) return true
  if (values.some((v) => typeof v === 'number')) return 1
  const example = values.find((v) => typeof v === 'string' && isVisitedValue(v))
  if (example !== undefined) return example
  if (values.some((v) => typeof v === 'string')) return fallbackText
  return true // Sin ejemplos: true sirve tanto en columnas booleanas como de texto.
}
