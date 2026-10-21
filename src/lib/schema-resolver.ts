import type { PostgrestError, User } from '@supabase/supabase-js'
import { ROLES_ADMIN, schema, type Schema, type TableSpec } from '../config/schema'
import { isNetworkError } from './errors'
import { supabase, type Row } from './supabase'

export type TableKey = keyof Schema
type FieldsOf<K extends TableKey> = Schema[K] extends TableSpec<infer F> ? F : never

export interface ResolvedTable<F extends string = string> {
  /** Nombre real de la tabla, o null si no existe ninguna de las opciones. */
  table: string | null
  /** Columna real para cada dato lógico encontrado. */
  columns: Partial<Record<F, string>>
  /** Columnas vistas en una fila de ejemplo (null si no había filas visibles). */
  allColumns: string[] | null
  /** true: columnas confirmadas contra la base; false: se asumieron los primeros nombres de la lista. */
  verified: boolean
  missingRequired: F[]
  error: string | null
}

export type ResolvedSchema = { [K in TableKey]: ResolvedTable<FieldsOf<K>> }

export interface OwnerFilter {
  column: string
  value: string | number
  /** 'ilike' para comparar correos sin importar mayúsculas. */
  op: 'eq' | 'ilike'
  via: 'uid' | 'email' | 'perfil'
  /** ¿Se encontró al menos un cliente con este filtro? */
  matched: boolean
  /**
   * La columna existe pero ninguna forma de compararla con el usuario funcionó (p. ej. es un número y no
   * hay tabla de usuarios). En ese caso NO se muestran clientes: sería mostrar los de todos los promotores.
   */
  error?: string
}

export interface Perfil {
  id: string | number
  nombre: string | null
  /** false si la tabla tiene columnas de latitud/longitud (o ubicación) y aún están vacías. */
  conUbicacion?: boolean
  /** Texto de la columna "ubicacion", si tiene (p. ej. "LatLng(lat: …, lng: …)" que guardaba FlutterFlow). */
  ubicacionTexto?: string | null
  /** Columna rol (p. ej. 'promotor' o 'admin'). */
  rol?: string | null
}

export interface SchemaContext {
  tables: ResolvedSchema
  perfil: Perfil | null
  owner: OwnerFilter | null
  resolvedAt: number
}

// ---------------------------------------------------------------------------
// Errores de PostgREST
// ---------------------------------------------------------------------------

type ErrorInfo = Pick<PostgrestError, 'code' | 'message'>

export function isMissingTableError(error: ErrorInfo | null): boolean {
  if (!error) return false
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /could not find the table|relation .* does not exist/i.test(error.message)
  )
}

export function isMissingColumnError(error: ErrorInfo | null): boolean {
  if (!error) return false
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /column .* does not exist|could not find the .* column/i.test(error.message)
  )
}

// ---------------------------------------------------------------------------
// Resolución de columnas
// ---------------------------------------------------------------------------

/** Elige, en orden, la primera columna existente para cada dato (sin repetir columnas entre datos). */
export function pickColumns<F extends string>(
  fields: Record<F, string[]>,
  existing: Iterable<string>,
): Partial<Record<F, string>> {
  const byLower = new Map<string, string>()
  for (const c of existing) byLower.set(c.toLowerCase(), c)
  const used = new Set<string>()
  const result: Partial<Record<F, string>> = {}
  for (const field of Object.keys(fields) as F[]) {
    for (const candidate of fields[field]) {
      const real = byLower.get(candidate.toLowerCase())
      if (real && !used.has(real)) {
        result[field] = real
        used.add(real)
        break
      }
    }
  }
  return result
}

function assumeColumns<F extends string>(fields: Record<F, string[]>): Partial<Record<F, string>> {
  const used = new Set<string>()
  const result: Partial<Record<F, string>> = {}
  for (const field of Object.keys(fields) as F[]) {
    const first = fields[field].find((c) => !used.has(c))
    if (first) {
      result[field] = first
      used.add(first)
    }
  }
  return result
}

class OfflineError extends Error {
  constructor() {
    super('Failed to fetch')
  }
}

async function columnExists(table: string, column: string): Promise<boolean | null> {
  const { error } = await supabase.from(table).select(column).limit(0)
  if (!error) return true
  if (isNetworkError(error)) throw new OfflineError()
  if (isMissingColumnError(error)) return false
  return null // no se pudo saber (p. ej. permisos)
}

async function resolveTable<F extends string>(spec: TableSpec<F>): Promise<ResolvedTable<F>> {
  const missing = (columns: Partial<Record<F, string>>) => spec.required.filter((f) => !columns[f])

  for (const name of spec.table) {
    const { data, error } = await supabase.from(name).select('*').limit(1)
    if (isNetworkError(error)) throw new OfflineError()
    if (isMissingTableError(error)) continue

    if (error) {
      // La tabla existe pero no se puede leer (p. ej. RLS sin permiso de lectura): se asumen nombres.
      const columns = assumeColumns(spec.fields)
      return { table: name, columns, allColumns: null, verified: false, missingRequired: [], error: error.message }
    }

    const sample = (data as Row[] | null)?.[0]
    if (sample) {
      const allColumns = Object.keys(sample)
      const columns = pickColumns(spec.fields, allColumns)
      return { table: name, columns, allColumns, verified: true, missingRequired: missing(columns), error: null }
    }

    // Tabla vacía (o sin filas visibles para este usuario): se sondea cada columna posible.
    const candidates = [...new Set(Object.values<string[]>(spec.fields).flat())]
    const checks = await Promise.all(candidates.map((c) => columnExists(name, c)))
    if (checks.some((c) => c === null)) {
      const columns = assumeColumns(spec.fields)
      return { table: name, columns, allColumns: null, verified: false, missingRequired: [], error: null }
    }
    const existing = candidates.filter((_, i) => checks[i])
    const columns = pickColumns(spec.fields, existing)
    return { table: name, columns, allColumns: null, verified: true, missingRequired: missing(columns), error: null }
  }

  return {
    table: null,
    columns: {},
    allColumns: null,
    verified: true,
    missingRequired: [...spec.required],
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Usuario: perfil y filtro de "mis clientes"
// ---------------------------------------------------------------------------

const looksLikeEmailColumn = (column: string) => /mail|correo/i.test(column)

/** Escapa comodines de LIKE para comparar textos exactos sin importar mayúsculas. */
export const likeExact = (text: string) => text.replace(/[\\%_*]/g, '\\$&')

async function resolvePerfil(t: ResolvedTable<FieldsOf<'perfiles'>>, user: User): Promise<Perfil | null> {
  if (!t.table || !t.columns.id) return null
  const tries: [string, string, 'eq' | 'ilike'][] = []
  if (t.columns.authId) tries.push([t.columns.authId, user.id, 'eq'])
  if (t.columns.email && user.email) tries.push([t.columns.email, likeExact(user.email), 'ilike'])
  tries.push([t.columns.id, user.id, 'eq'])
  for (const [column, value, op] of tries) {
    const query = supabase.from(t.table).select('*').limit(1)
    const { data, error } = await (op === 'eq' ? query.eq(column, value) : query.ilike(column, value))
    if (isNetworkError(error)) throw new OfflineError()
    const row = (data as Row[] | null)?.[0]
    if (!error && row) {
      const nombre = t.columns.nombre ? row[t.columns.nombre] : null
      const { latitud, longitud, ubicacion } = t.columns
      const vacio = (col: string) => row[col] === null || row[col] === undefined || String(row[col]).trim() === ''
      // Lo que cuenta son latitud y longitud; la columna de texto solo si no existen esas dos.
      const coordenadas = [latitud, longitud].filter((c): c is string => Boolean(c))
      const conUbicacion =
        coordenadas.length > 0 ? coordenadas.every((c) => !vacio(c)) : ubicacion ? !vacio(ubicacion) : true
      return {
        id: row[t.columns.id] as string | number,
        nombre: typeof nombre === 'string' && nombre.trim() ? nombre.trim() : null,
        conUbicacion,
        ubicacionTexto: ubicacion && !vacio(ubicacion) ? String(row[ubicacion]) : null,
        rol: t.columns.rol && !vacio(t.columns.rol) ? String(row[t.columns.rol]) : null,
      }
    }
  }
  return null
}

/** Valores con los que el usuario puede aparecer en una columna "dueño" (uuid, correo o id de perfil). */
export function ownerCandidates(column: string, user: User, perfil: Perfil | null) {
  const list: { value: string | number; op: 'eq' | 'ilike'; via: OwnerFilter['via'] }[] = []
  const email = user.email ? { value: likeExact(user.email), op: 'ilike' as const, via: 'email' as const } : null
  if (looksLikeEmailColumn(column)) {
    if (email) list.push(email)
    return list
  }
  list.push({ value: user.id, op: 'eq', via: 'uid' })
  if (perfil && String(perfil.id) !== user.id) list.push({ value: perfil.id, op: 'eq', via: 'perfil' })
  if (email) list.push(email)
  return list
}

async function resolveOwner(
  t: ResolvedTable<FieldsOf<'clientes'>>,
  user: User,
  perfil: Perfil | null,
): Promise<OwnerFilter | null> {
  const column = t.columns.asignadoA
  if (!t.table || !column) return null
  let fallback: OwnerFilter | null = null
  let lastError = 'no se pudo comparar con tu usuario'
  for (const c of ownerCandidates(column, user, perfil)) {
    const query = supabase.from(t.table).select('*', { count: 'exact', head: true })
    const { count, error } = await (c.op === 'eq' ? query.eq(column, c.value) : query.ilike(column, String(c.value)))
    if (isNetworkError(error)) throw new OfflineError()
    if (error) {
      // p. ej. columna numérica comparada con un uuid: se prueba la siguiente forma.
      lastError = error.message
      continue
    }
    const filter: OwnerFilter = { column, value: c.value, op: c.op, via: c.via, matched: (count ?? 0) > 0 }
    if (filter.matched) return filter
    fallback ??= filter
  }
  return fallback ?? { column, value: '', op: 'eq', via: 'uid', matched: false, error: lastError }
}

// ---------------------------------------------------------------------------
// Carga con caché
// ---------------------------------------------------------------------------

const CACHE_KEY = 'pd.schema.v1'
/** Cada hora se vuelve a revisar la base (así se detectan columnas nuevas, p. ej. las de distancia). */
const CACHE_TTL_MS = 60 * 60 * 1000
/** Subirlo obliga a todos los teléfonos a volver a detectar al publicar una versión nueva. */
const DETECCION_VERSION = 3

function configHash(): string {
  const text = JSON.stringify(schema) + DETECCION_VERSION
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0
  return String(h)
}

interface CacheEntry {
  hash: string
  userId: string
  ctx: SchemaContext
}

function readCache(userId: string): SchemaContext | null {
  try {
    const entry = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as CacheEntry | null
    if (!entry || entry.hash !== configHash() || entry.userId !== userId) return null
    if (Date.now() - entry.ctx.resolvedAt > CACHE_TTL_MS) return null
    // Si no se encontraron clientes del usuario, se vuelve a revisar cada vez (quizá ya se los cargaron).
    if (entry.ctx.owner && !entry.ctx.owner.matched) return null
    return entry.ctx
  } catch {
    return null
  }
}

export function clearSchemaCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* sin almacenamiento */
  }
}

export async function loadSchema(user: User, { force = false } = {}): Promise<SchemaContext> {
  if (!force) {
    const cached = readCache(user.id)
    if (cached) {
      // Las tablas se recuerdan una hora, pero el perfil (nombre, rol admin) se lee cada vez que se abre la app,
      // para que un cambio de rol se vea de inmediato. Sin señal se usa el guardado.
      const perfil = await resolvePerfil(cached.tables.perfiles, user).catch(() => cached.perfil)
      return { ...cached, perfil }
    }
  }
  const keys = Object.keys(schema) as TableKey[]
  const resolved = await Promise.all(keys.map((k) => resolveTable(schema[k] as TableSpec<string>)))
  const tables = Object.fromEntries(keys.map((k, i) => [k, resolved[i]])) as unknown as ResolvedSchema
  const perfil = await resolvePerfil(tables.perfiles, user)
  const owner = await resolveOwner(tables.clientes, user, perfil)
  const ctx: SchemaContext = { tables, perfil, owner, resolvedAt: Date.now() }
  // Solo se guarda una detección completa; si algo no se pudo confirmar se vuelve a intentar la próxima vez.
  const complete = resolved.every((t) => t.verified && !t.error)
  if (complete) {
    try {
      const entry: CacheEntry = { hash: configHash(), userId: user.id, ctx }
      localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
    } catch {
      /* sin almacenamiento */
    }
  }
  return ctx
}

/** Columnas que por su nombre guardan el id de Supabase Auth (uuid), no el id de la tabla de usuarios. */
const AUTH_ID_COLUMN = /^(user_id|uid|user_uid|auth_id|auth_user_id|id_auth)$/i

/** Valor con el que se identifica al usuario en una columna "dueño" de otra tabla (visitas, respuestas…). */
export function ownerValueFor(
  column: string,
  ctx: Pick<SchemaContext, 'owner' | 'perfil'>,
  user: Pick<User, 'id' | 'email'>,
): string | number {
  if (looksLikeEmailColumn(column)) return user.email ?? user.id
  const owner = ctx.owner && !ctx.owner.error ? ctx.owner : null
  // Misma columna que en clientes: mismo formato con el que se encontraron sus clientes.
  if (owner && owner.column === column) {
    if (owner.via === 'email') return user.email ?? user.id
    if (owner.via === 'perfil' && ctx.perfil) return ctx.perfil.id
    return user.id
  }
  if (AUTH_ID_COLUMN.test(column)) return user.id
  if (owner?.via === 'perfil' && ctx.perfil) return ctx.perfil.id
  return user.id
}

/** ¿El usuario es administrador (rol en ROLES_ADMIN)? Solo decide qué se muestra; los permisos los da Supabase. */
export function esAdmin(ctx: Pick<SchemaContext, 'perfil'> | undefined): boolean {
  const rol = ctx?.perfil?.rol
  return Boolean(rol && ROLES_ADMIN.includes(rol.trim().toLowerCase()))
}
