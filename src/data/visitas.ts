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
  distance: number
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

/** Errores por datos que no encajan con la columna (tipo, enum, check…), que vale la pena reintentar con menos columnas. */
function isDataShapeError(error: PostgrestError): boolean {
  if (isNetworkError(error) || error.code === '42501') return false
  return isMissingColumnError(error) || /^22|^23514$|^PGRST/.test(error.code ?? '')
}

function pick(row: Row, columns: (string | undefined)[]): Row {
  const out: Row = {}
  for (const c of columns) if (c && c in row) out[c] = row[c]
  return out
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
    put(row, c.distancia, Math.round(position.distance))
    put(row, c.precision, Math.round(position.accuracy))
  }
  put(row, c.estado, VALOR_ESTADO_VISITA)
  put(row, c.duracion, Math.max(1, Math.round((now.getTime() - startedAt) / 60000)))

  const returning = c.id ?? '*'
  const insert = async (values: Row) => {
    const result = await supabase.from(v.table!).insert(values).select(returning).single()
    if (result.error?.code !== '42501') return result
    // Hay permiso para insertar pero no para leer la fila creada: se inserta sin pedirla de vuelta.
    const { error } = await supabase.from(v.table!).insert(values)
    return { data: null, error }
  }
  let { data, error } = await insert(row)
  if (error && isDataShapeError(error)) {
    // Reintento con lo esencial, por si alguna columna opcional no acepta el formato.
    ;({ data, error } = await insert(pick(row, [c.cliente, c.usuario, c.fin])))
  }
  if (error) throw error
  return c.id && data ? ((data as unknown as Row)[c.id] as Id) : null
}

async function insertRespuestas(input: FinalizarVisitaInput, visitaId: Id | null): Promise<number> {
  const { ctx, user, cliente, questions, visible, answers } = input
  const r = ctx.tables.respuestas
  const c = r.columns
  if (!r.table || !c.pregunta || !c.respuesta) return 0

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

  let { error } = await supabase.from(r.table).insert(rows)
  if (error && isDataShapeError(error)) {
    const essential = [c.pregunta, c.respuesta, c.visita, c.cliente, c.usuario]
    ;({ error } = await supabase.from(r.table).insert(rows.map((row) => pick(row, essential))))
  }
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
    return 'La visita se guardó, pero la base de datos no permitió marcar al cliente como visitado (permisos RLS de actualización).'
  }
  return null
}

/**
 * Guarda la visita: 1) fila en visitas, 2) respuestas visibles, 3) marca al cliente como visitado.
 * Si fallan las respuestas se intenta borrar la visita recién creada para no dejarla a medias.
 */
export async function finalizarVisita(input: FinalizarVisitaInput): Promise<FinalizarVisitaResult> {
  const visitaId = await insertVisita(input)
  let respuestas = 0
  try {
    respuestas = await insertRespuestas(input, visitaId)
  } catch (error) {
    const v = input.ctx.tables.visitas
    if (visitaId !== null && v.table && v.columns.id) {
      await supabase.from(v.table).delete().eq(v.columns.id, visitaId)
    }
    throw error
  }
  let warning: string | null = null
  try {
    warning = await marcarVisitado(input)
  } catch {
    warning =
      'La visita y las respuestas se guardaron, pero no se pudo marcar al cliente como visitado. Avísale a tu administrador.'
  }
  return { visitaId, respuestas, warning }
}
