import type { PostgrestError, User } from '@supabase/supabase-js'
import { ESTATUS_ASIGNACION_COMPLETADA, ESTATUS_ASIGNACION_OCULTA, VALORES_VISITADO } from '../config/schema'
import { locationFromColumns, parseLocation, type LatLng } from '../lib/geo'
import { diasDe } from '../lib/dias'
import { recentlyFinished } from '../lib/draft'
import { columnasInternas, resolverInfoCliente } from '../lib/info-cliente'
import { likeExact, ownerValueFor, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Id, type Row } from '../lib/supabase'
import { esVacio, normalize, toBoolean } from '../lib/text'

/** Asignación del cliente al promotor (tabla asignaciones), si existe. */
export interface Asignacion {
  id: Id | null
  estatus: string | null
  fecha: string | null
}

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
  /** Columna "reseteado" (Sí/No; vacío = false). null si la tabla no tiene esa columna. */
  reseteado: boolean | null
  /** Saldo de puntos (el dato "destacado" de la ficha, p. ej. saldo_premia), para mostrarlo en la lista. */
  saldo: unknown
  /** Días de la semana en que toca visitarlo (1 = lunes … 7 = domingo), de la columna dia_visita. */
  dias: number[]
  /** Asignación pendiente (o la última completada) cuando los clientes se asignan por la tabla asignaciones. */
  asignacion: Asignacion | null
  /** Fila completa, para mostrar todas las propiedades que cargaste. */
  raw: Row
}

export class SchemaError extends Error {}

const PAGE = 1000

interface RangeQuery {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: unknown; error: PostgrestError | null; count?: number | null }>
}

/**
 * Lee todas las filas de una consulta por páginas. Usa el total (consultas con `count: 'exact'`) para
 * saber cuándo terminar aunque tu proyecto limite las filas por respuesta a menos de 1000.
 * La consulta debe tener un orden estable (`order` por una columna única) para no saltar ni repetir filas.
 */
export async function fetchAll(build: () => RangeQuery): Promise<Row[]> {
  const rows: Row[] = []
  let total: number | null = null
  for (let from = 0; ; ) {
    const { data, error, count } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    const page = (data as Row[] | null) ?? []
    if (typeof count === 'number') total = count
    rows.push(...page)
    from += page.length
    if (page.length === 0) return rows
    if (total !== null ? rows.length >= total : page.length < PAGE) return rows
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
  return esVacio(value) ? null : String(value).trim()
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
    // Número de cliente: la columna de código o, si no hay, la llave de negocio (p. ej. id_cliente = "120070912").
    codigo: text(c.codigo ? row[c.codigo] : null) ?? (c.id && !['id', 'uuid'].includes(c.id) ? key : null),
    location,
    visitado,
    reseteado: null,
    saldo: null,
    dias: c.diaVisita ? diasDe(row[c.diaVisita]) : [],
    asignacion: null,
    raw: row,
  }
}

/** Ids de clientes con alguna visita registrada (solo si la tabla de clientes no tiene columna "visitado"). */
async function fetchVisitedIds(ctx: SchemaContext, user: User): Promise<Set<string>> {
  const v = ctx.tables.visitas
  if (!v.table || !v.columns.cliente) return new Set()
  const clienteCol = v.columns.cliente
  const idCol = v.columns.id
  const usuarioCol = v.columns.usuario
  const rows = await fetchAll(() => {
    const q = supabase
      .from(v.table!)
      .select(idCol ? `${clienteCol},${idCol}` : clienteCol, { count: 'exact' })
      .order(idCol ?? clienteCol, { ascending: true })
    return usuarioCol ? whereUser(q, usuarioCol, ownerValueFor(usuarioCol, ctx, user)) : q
  })
  return new Set(rows.map((r) => String(r[clienteCol])))
}

interface AsignacionesPorCliente {
  /** Llave del cliente → asignación vigente y si ya está completada. */
  porCliente: Map<string, { asignacion: Asignacion; completada: boolean }>
}

const estatusEn = (lista: string[], valor: unknown) => lista.includes(normalize(valor))

/** Asignaciones del usuario agrupadas por cliente (las canceladas no cuentan). */
async function fetchAsignaciones(ctx: SchemaContext, user: User): Promise<AsignacionesPorCliente> {
  const a = ctx.tables.asignaciones
  const c = a.columns
  const rows = await fetchAll(() => {
    const q = supabase.from(a.table!).select('*', { count: 'exact' }).order(c.id ?? c.cliente!, { ascending: true })
    return whereUser(q, c.usuario!, ownerValueFor(c.usuario!, ctx, user))
  })
  const grupos = new Map<string, Row[]>()
  for (const row of rows) {
    if (c.estatus && estatusEn(ESTATUS_ASIGNACION_OCULTA, row[c.estatus])) continue
    const key = String(row[c.cliente!])
    grupos.set(key, [...(grupos.get(key) ?? []), row])
  }
  const fecha = (row: Row) => (c.fecha ? String(row[c.fecha] ?? '') : '')
  const porCliente = new Map<string, { asignacion: Asignacion; completada: boolean }>()
  for (const [key, lista] of grupos) {
    const completada = (row: Row) => Boolean(c.estatus && estatusEn(ESTATUS_ASIGNACION_COMPLETADA, row[c.estatus]))
    const ordenadas = [...lista].sort((x, y) => fecha(x).localeCompare(fecha(y)))
    // La pendiente más antigua; si todas están completadas, la más reciente.
    const vigente = ordenadas.find((row) => !completada(row)) ?? ordenadas[ordenadas.length - 1]
    porCliente.set(key, {
      asignacion: {
        id: c.id ? (vigente[c.id] as Id) : null,
        estatus: c.estatus ? ((vigente[c.estatus] as string | null) ?? null) : null,
        fecha: c.fecha ? ((vigente[c.fecha] as string | null) ?? null) : null,
      },
      completada: completada(vigente),
    })
  }
  return { porCliente }
}

/** Clientes por su llave, en grupos para no exceder el largo de la URL. */
async function fetchClientesPorLlave(ctx: SchemaContext, llaves: string[]): Promise<Row[]> {
  const t = ctx.tables.clientes
  const grupos: string[][] = []
  for (let i = 0; i < llaves.length; i += 100) grupos.push(llaves.slice(i, i + 100))
  const partes = await Promise.all(
    grupos.map((grupo) =>
      fetchAll(() =>
        supabase.from(t.table!).select('*', { count: 'exact' }).in(t.columns.id!, grupo).order(t.columns.id!, { ascending: true }),
      ),
    ),
  )
  return partes.flat()
}

/** Columna "reseteado": la del mapeo o, si no, cualquiera cuyo nombre contenga "reset" (reseteo, reset_app…). */
export function columnaReseteado(ctx: SchemaContext, columnas: string[]): string | undefined {
  const c = ctx.tables.clientes.columns
  if (c.reseteado) return c.reseteado
  const usadas = new Set(Object.values(c))
  return columnas.find((col) => !usadas.has(col) && /reset/i.test(col))
}

/**
 * Datos que dependen de las columnas reales de la tabla: el saldo (la misma columna que la ficha muestra como
 * dato destacado) y "reseteado" (Sí/No; vacío = false).
 */
function conExtras(clientes: Cliente[], ctx: SchemaContext): Cliente[] {
  if (clientes.length === 0) return clientes
  const columnas = [...new Set(clientes.flatMap((c) => Object.keys(c.raw)))]
  const colSaldo = resolverInfoCliente(columnas, columnasInternas(ctx)).find((c) => c.tipo === 'destacado')?.columna
  const colReseteado = columnaReseteado(ctx, columnas)
  if (!colSaldo && !colReseteado) return clientes
  return clientes.map((c) => ({
    ...c,
    saldo: colSaldo ? (c.raw[colSaldo] ?? null) : null,
    reseteado: colReseteado ? !esVacio(c.raw[colReseteado]) && toBoolean(c.raw[colReseteado]) === true : null,
  }))
}

export async function fetchClientes(ctx: SchemaContext, user: User): Promise<Cliente[]> {
  return conExtras(await fetchClientesSinSaldo(ctx, user), ctx)
}

async function fetchClientesSinSaldo(ctx: SchemaContext, user: User): Promise<Cliente[]> {
  const t = ctx.tables.clientes
  if (!t.table) throw new SchemaError('No se encontró la tabla de clientes en Supabase.')
  if (!t.columns.id) throw new SchemaError(`La tabla "${t.table}" no tiene una columna de id reconocible.`)
  // Visitas finalizadas en este teléfono cuyo "visitado" la base no dejó guardar (no se vuelven a ofrecer).
  const recientes = recentlyFinished(user.id)

  const a = ctx.tables.asignaciones
  if (a.table && a.columns.cliente && a.columns.usuario) {
    // Clientes asignados por la tabla de asignaciones: el estatus dice si ya se visitaron.
    const { porCliente } = await fetchAsignaciones(ctx, user)
    const rows = porCliente.size > 0 ? await fetchClientesPorLlave(ctx, [...porCliente.keys()]) : []
    return rows.map((row) => {
      const cliente = toCliente(row, ctx, null)
      const info = porCliente.get(cliente.key)
      return {
        ...cliente,
        asignacion: info?.asignacion ?? null,
        visitado: Boolean(info?.completada) || recientes.has(cliente.key),
      }
    })
  }

  const owner = ctx.owner
  if (owner?.error) {
    // Nunca se muestran clientes sin filtrar: serían los de todos los promotores.
    throw new SchemaError(
      `No se pudo identificar tus clientes: la columna "${owner.column}" de "${t.table}" no coincide con tu usuario (${owner.error}).`,
    )
  }
  const [rows, visitedIds] = await Promise.all([
    fetchAll(() => {
      const q = supabase.from(t.table!).select('*', { count: 'exact' }).order(t.columns.id!, { ascending: true })
      if (!owner) return q
      return owner.op === 'eq' ? q.eq(owner.column, owner.value) : q.ilike(owner.column, String(owner.value))
    }),
    t.columns.visitado ? Promise.resolve(null) : fetchVisitedIds(ctx, user),
  ])
  return rows.map((row) => {
    const cliente = toCliente(row, ctx, visitedIds)
    return recientes.has(cliente.key) ? { ...cliente, visitado: true } : cliente
  })
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
