import type { PostgrestError, User } from '@supabase/supabase-js'
import { VALOR_ESTADO_VISITA, VALOR_VISITADO_TEXTO } from '../config/schema'
import { isNetworkError } from '../lib/errors'
import { serializeAnswer, isAnswered, type Answers, type Question } from '../lib/questions'
import { isMissingColumnError, ownerValueFor, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Id, type Row } from '../lib/supabase'
import { visitadoValue, type Cliente } from './clientes'

export interface PosicionVisita {
  lat: number
  lng: number
  accuracy: number
  /** Metros al cliente al iniciar la visita (null si el cliente no tiene coordenadas). */
  distance: number | null
}

export interface FinalizarVisitaInput {
  ctx: SchemaContext
  user: User
  cliente: Cliente
  clientes: Cliente[]
  questions: Question[]
  visible: Set<string>
  answers: Answers
  startedAt: number
  position: PosicionVisita | null
  /** Visita ya insertada en un intento anterior (se reutiliza para no duplicarla). */
  visitaPrevia?: { id: Id | null }
  /** Se llama en cuanto la fila de la visita queda guardada, para recordarla en el borrador. */
  onVisitaGuardada?: (visita: { id: Id | null }) => void
}

export interface FinalizarVisitaResult {
  visitaId: Id | null
  respuestas: number
  /** Aviso si la visita se guardó pero el cliente no pudo marcarse como visitado. */
  warning: string | null
}

/** Fecha y hora local con zona horaria (sirve para columnas timestamp, date y time). */
export function localIso(date: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  )
}

function put(row: Row, column: string | undefined, value: unknown) {
  if (column && value !== undefined && value !== null) row[column] = value
}

function omit(row: Row, column: string): Row {
  const out: Row = { ...row }
  delete out[column]
  return out
}

/** Errores porque un dato no encaja en su columna (tipo, enum, check, columna inexistente): se puede reintentar sin ella. */
export function isDataShapeError(error: Pick<PostgrestError, 'code' | 'message'>): boolean {
  if (isNetworkError(error) || error.code === '42501') return false
  return isMissingColumnError(error) || /^22/.test(error.code ?? '') || error.code === '23514'
}

/**
 * Qué columna quitar para reintentar: la que nombra el error (columna inexistente, restricción
 * "visitas_estado_check"…) o, si no la nombra, la opcional menos importante que quede.
 * Nunca quita las esenciales.
 */
export function columnToDrop(
  error: Pick<PostgrestError, 'message' | 'details' | 'hint'>,
  present: string[],
  dropOrder: (string | undefined)[],
  essential: (string | undefined)[],
): string | null {
  const keep = new Set(essential.filter(Boolean))
  const candidates = present.filter((c) => !keep.has(c))
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()
  const named = candidates
    .filter((c) => new RegExp(`(^|[^a-z0-9])${c.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(text))
    .sort((a, b) => b.length - a.length)[0]
  if (named) return named
  return dropOrder.find((c): c is string => Boolean(c && candidates.includes(c))) ?? null
}

type InsertResult<T> = { data: T | null; error: PostgrestError | null }

/** Inserta y, si una columna opcional rechaza su valor, reintenta sin esa columna (una a la vez). */
async function insertAdaptive<T>(
  rows: Row[],
  essential: (string | undefined)[],
  dropOrder: (string | undefined)[],
  run: (rows: Row[]) => Promise<InsertResult<T>>,
): Promise<InsertResult<T>> {
  let current = rows
  for (let attempt = 0; ; attempt++) {
    const result = await run(current)
    if (!result.error || !isDataShapeError(result.error) || attempt >= 8) return result
    const drop = columnToDrop(result.error, Object.keys(current[0] ?? {}), dropOrder, essential)
    if (!drop) return result
    current = current.map((row) => omit(row, drop))
  }
}

async function insertVisita(input: FinalizarVisitaInput): Promise<Id | null> {
  const { ctx, user, cliente, startedAt, position } = input
  const v = ctx.tables.visitas
  const c = v.columns
  if (!v.table || !c.cliente) return null

  const now = new Date()
  const row: Row = {}
  put(row, c.cliente, cliente.id)
  if (c.usuario) put(row, c.usuario, ownerValueFor(c.usuario, ctx, user))
  put(row, c.inicio, localIso(new Date(startedAt)))
  put(row, c.fin, localIso(now))
  if (position) {
    put(row, c.latitud, position.lat)
    put(row, c.longitud, position.lng)
    if (!c.latitud || !c.longitud) put(row, c.ubicacion, `${position.lat},${position.lng}`)
    if (position.distance !== null) put(row, c.distancia, Math.round(position.distance))
    put(row, c.precision, Math.round(position.accuracy))
  }
  put(row, c.estado, VALOR_ESTADO_VISITA)
  put(row, c.duracion, Math.max(1, Math.round((now.getTime() - startedAt) / 60000)))

  // Las respuestas se ligan a la visita por su id: en ese caso hay que obtenerlo de vuelta.
  const needsId = Boolean(ctx.tables.respuestas.table && ctx.tables.respuestas.columns.visita)
  const returning = c.id ?? '*'
  const { data, error } = await insertAdaptive<Row>(
    [row],
    [c.cliente, c.usuario],
    // Primero se sacrifica lo menos importante; la ubicación (evidencia de la visita) al final.
    [c.estado, c.duracion, c.precision, c.inicio, c.ubicacion, c.fin, c.distancia, c.latitud, c.longitud],
    async ([values]) => {
      const result = await supabase.from(v.table!).insert(values).select(returning).single()
      if (result.error?.code !== '42501' || needsId) {
        return { data: result.data as Row | null, error: result.error }
      }
      // Permiso para insertar pero no para leer la fila creada, y no se necesita su id.
      const plain = await supabase.from(v.table!).insert(values)
      return { data: null, error: plain.error }
    },
  )
  if (error?.code === '42501' && needsId) {
    throw new Error(
      'No se pudo registrar la visita: la base de datos no permite leer la visita recién creada (falta una política RLS de lectura en la tabla de visitas).',
    )
  }
  if (error) throw error
  return c.id && data ? (data[c.id] as Id) : null
}

async function insertRespuestas(input: FinalizarVisitaInput, visitaId: Id | null): Promise<number> {
  const { ctx, user, cliente, questions, visible, answers } = input
  const r = ctx.tables.respuestas
  const c = r.columns
  if (!r.table || !c.pregunta || !c.respuesta) return 0
  if (c.visita && visitaId === null && ctx.tables.visitas.table) {
    // Sin el id las respuestas quedarían sueltas, sin visita.
    throw new Error('No se pudo obtener el id de la visita para ligar las respuestas.')
  }

  const fecha = localIso(new Date())
  const rows: Row[] = questions
    .filter((q) => visible.has(q.key) && isAnswered(answers[q.key]))
    .map((q) => {
      const row: Row = {}
      put(row, c.pregunta, q.id)
      put(row, c.respuesta, serializeAnswer(answers[q.key]))
      put(row, c.preguntaTexto, q.text)
      if (visitaId !== null) put(row, c.visita, visitaId)
      put(row, c.cliente, cliente.id)
      if (c.usuario) put(row, c.usuario, ownerValueFor(c.usuario, ctx, user))
      put(row, c.fecha, fecha)
      return row
    })
  if (rows.length === 0) return 0

  const linked = visitaId !== null && c.visita ? c.visita : c.cliente
  const { error } = await insertAdaptive<null>(
    rows,
    [c.pregunta, c.respuesta, linked],
    [c.fecha, c.preguntaTexto, c.usuario, c.cliente],
    async (values) => {
      const result = await supabase.from(r.table!).insert(values)
      return { data: null, error: result.error }
    },
  )
  if (error) throw error
  return rows.length
}

async function marcarVisitado(input: FinalizarVisitaInput): Promise<string | null> {
  const { ctx, cliente, clientes } = input
  const t = ctx.tables.clientes
  const col = t.columns.visitado
  if (!t.table || !col || !t.columns.id) return null
  const value = visitadoValue(clientes, col, VALOR_VISITADO_TEXTO)
  const { data, error } = await supabase
    .from(t.table)
    .update({ [col]: value })
    .eq(t.columns.id, cliente.id)
    .select(t.columns.id)
  if (error) throw error
  if (!data || data.length === 0) {
    return 'La visita se guardó, pero la base de datos no permitió marcar al cliente como visitado (permisos RLS de actualización). Avísale a tu administrador.'
  }
  return null
}

/**
 * Guarda la visita: 1) fila en visitas, 2) respuestas visibles, 3) marca al cliente como visitado.
 * Si un paso falla, la visita ya guardada se recuerda en el borrador y el reintento la reutiliza
 * (no se crean visitas duplicadas).
 */
export async function finalizarVisita(input: FinalizarVisitaInput): Promise<FinalizarVisitaResult> {
  let visitaId: Id | null
  if (input.visitaPrevia) {
    visitaId = input.visitaPrevia.id
  } else {
    visitaId = await insertVisita(input)
    if (input.ctx.tables.visitas.table && input.ctx.tables.visitas.columns.cliente) {
      input.onVisitaGuardada?.({ id: visitaId })
    }
  }
  const respuestas = await insertRespuestas(input, visitaId)
  let warning: string | null = null
  try {
    warning = await marcarVisitado(input)
  } catch {
    warning =
      'La visita y las respuestas se guardaron, pero no se pudo marcar al cliente como visitado. Avísale a tu administrador.'
  }
  return { visitaId, respuestas, warning }
}

/** Borra una visita guardada a medias (al descartar). Devuelve true si se borró. */
export async function borrarVisita(ctx: SchemaContext, visitaId: Id): Promise<boolean> {
  const v = ctx.tables.visitas
  if (!v.table || !v.columns.id) return false
  const { data, error } = await supabase.from(v.table).delete().eq(v.columns.id, visitaId).select(v.columns.id)
  return !error && Array.isArray(data) && data.length > 0
}
