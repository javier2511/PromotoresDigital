import type { User } from '@supabase/supabase-js'
import {
  RESPUESTAS_EN_VISITA,
  VALOR_ASIGNACION_COMPLETADA,
  VALOR_ESTADO_VISITA,
  VALOR_VISITA_REALIZADA,
  VALOR_VISITADO_TEXTO,
} from '../config/schema'
import { serializeAnswer, isAnswered, type Answers, type Question } from '../lib/questions'
import { isNetworkError } from '../lib/errors'
import { ownerValueFor, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Id, type Row } from '../lib/supabase'
import { normalize, toBoolean } from '../lib/text'
import { visitadoValue, whereUser, type Cliente } from './clientes'
import {
  ErrorAlGuardar,
  insertarConRecuperacion,
  localIso,
  palabras,
  VALORES_NO,
  VALORES_SI,
  type Recuperacion,
} from './insercion'

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

function put(row: Row, column: string | undefined, value: unknown) {
  if (column && value !== undefined && value !== null) row[column] = value
}

/** Formas de identificar al usuario en una columna: la más probable primero. */
function valoresUsuario(columna: string, input: FinalizarVisitaInput): (string | number)[] {
  const { ctx, user } = input
  const valores = [ownerValueFor(columna, ctx, user), user.id, user.email, ctx.perfil?.id]
  return [...new Set(valores.filter((v): v is string | number => v !== undefined && v !== null && v !== ''))]
}

/**
 * Valor para una columna obligatoria que la app no conocía, deducido de su nombre
 * (p. ej. "fecha_registro", "hora", "id_cliente", "lat"…). undefined si no se sabe.
 */
function valorDeducido(columna: string, input: FinalizarVisitaInput, visitaId: Id | null = null): unknown {
  const p = palabras(columna)
  const tiene = (...w: string[]) => w.some((x) => p.includes(x))
  const { cliente, position, startedAt } = input
  const esFecha = tiene('fecha', 'hora', 'date', 'time', 'dia', 'at')
  if (!esFecha && tiene('realizada', 'realizado', 'completada', 'completado', 'finalizada', 'finalizado', 'terminada', 'terminado', 'concluida', 'hecha', 'efectiva', 'visitado', 'visitada')) {
    return VALOR_VISITA_REALIZADA
  }
  if (tiene('visita') && visitaId !== null) return visitaId
  if (tiene('cliente', 'tienda', 'pdv')) return cliente.id
  if (tiene('usuario', 'user', 'promotor', 'uid', 'vendedor', 'empleado')) return valoresUsuario(columna, input)[0]
  if (tiene('lat', 'latitud', 'latitude')) return position?.lat
  if (tiene('lng', 'lon', 'long', 'longitud', 'longitude')) return position?.lng
  if (tiene('distancia', 'metros', 'distance')) return position?.distance != null ? Math.round(position.distance) : undefined
  if (tiene('precision', 'accuracy', 'exactitud')) return position ? Math.round(position.accuracy) : undefined
  if (tiene('ubicacion', 'coordenadas', 'latlng')) return position ? `${position.lat},${position.lng}` : undefined
  if (tiene('estado', 'status', 'estatus')) return VALOR_ESTADO_VISITA
  if (tiene('duracion', 'minutos')) return Math.max(1, Math.round((Date.now() - startedAt) / 60000))
  if (tiene('inicio', 'entrada', 'checkin')) return localIso(new Date(startedAt))
  if (tiene('fecha', 'date', 'dia', 'hora', 'time', 'created', 'registro', 'fin', 'timestamp')) {
    return localIso(new Date())
  }
  return undefined
}

/** "Si" / "Ya la tenía" → true, "No" → false; otras respuestas (p. ej. "No aplica") → null. */
function siNo(texto: string): boolean | null {
  const b = toBoolean(texto)
  if (b !== null) return b
  return /^ya\b/.test(normalize(texto)) ? true : null
}

/** Columnas de visitas que se llenan con respuestas del formulario (RESPUESTAS_EN_VISITA). */
export function respuestasEnVisita(
  columnas: string[] | null,
  questions: Question[],
  visible: Set<string>,
  answers: Answers,
): Row {
  const out: Row = {}
  for (const m of RESPUESTAS_EN_VISITA) {
    // Si no se conocen las columnas de la tabla (vacía), no se adivinan.
    if (!columnas?.includes(m.columna)) continue
    const respondida = m.preguntas
      .map((grupo) => questions.find((q) => grupo.every((p) => normalize(q.text).includes(normalize(p)))))
      .find((q) => q !== undefined && visible.has(q.key) && isAnswered(answers[q.key]))
    let valor: unknown = null
    if (respondida) {
      const texto = serializeAnswer(answers[respondida.key])
      valor = m.tipo === 'si_no' ? siNo(texto) : texto
    }
    valor ??= m.siFalta ?? null
    if (valor !== null) out[m.columna] = valor
  }
  return out
}

async function insertVisita(input: FinalizarVisitaInput): Promise<Id | null> {
  const { ctx, cliente, startedAt, position } = input
  const v = ctx.tables.visitas
  const c = v.columns
  if (!v.table || !c.cliente) return null

  const inicio = new Date(startedAt)
  const fin = new Date()
  const row: Row = {}
  put(row, c.cliente, cliente.id)
  put(row, c.asignacion, cliente.asignacion?.id)
  if (c.usuario) put(row, c.usuario, valoresUsuario(c.usuario, input)[0])
  put(row, c.inicio, localIso(inicio))
  put(row, c.fin, localIso(fin))
  put(row, c.finHora, localIso(fin))
  if (position) {
    put(row, c.latitud, position.lat)
    put(row, c.longitud, position.lng)
    if (!c.latitud || !c.longitud) put(row, c.ubicacion, `${position.lat},${position.lng}`)
    if (position.distance !== null) put(row, c.distancia, Math.round(position.distance))
    put(row, c.precision, Math.round(position.accuracy))
    // Check-in: la ubicación al iniciar la visita (mismo formato que usaba FlutterFlow).
    put(row, c.checkin, true)
    put(row, c.fechaCheckin, localIso(inicio))
    put(row, c.latitudCheckin, position.lat)
    put(row, c.longitudCheckin, position.lng)
    put(row, c.ubicacionCheckin, `LatLng(lat: ${position.lat}, lng: ${position.lng})`)
  }
  put(row, c.estado, VALOR_ESTADO_VISITA)
  put(row, c.realizada, VALOR_VISITA_REALIZADA)
  put(row, c.duracion, Math.max(1, Math.round((fin.getTime() - startedAt) / 60000)))
  // Respuestas que también van en la fila de la visita (p. ej. visita_realizada = "¿Se realizó la visita?").
  const deRespuestas = respuestasEnVisita(v.allColumns, input.questions, input.visible, input.answers)
  Object.assign(row, deRespuestas)

  const fechas: Record<string, Date> = {}
  for (const col of [c.inicio, c.fechaCheckin]) if (col) fechas[col] = inicio
  for (const col of [c.fin, c.finHora]) if (col) fechas[col] = fin
  // Columnas de sí/no: si no son booleanas se prueba 1/0, "Si"/"No"…
  const alternativas: Record<string, unknown[]> = {}
  for (const [col, valor] of Object.entries(row)) {
    if (typeof valor === 'boolean') alternativas[col] = valor ? VALORES_SI : VALORES_NO
  }
  const recuperacion: Recuperacion = {
    esenciales: [c.cliente],
    // Primero se sacrifica lo menos importante; la ubicación (evidencia de la visita) al final.
    quitarPrimero: [
      c.estado,
      c.duracion,
      c.precision,
      c.ubicacionCheckin,
      ...Object.keys(deRespuestas),
      c.checkin,
      c.fechaCheckin,
      c.latitudCheckin,
      c.longitudCheckin,
      c.inicio,
      c.ubicacion,
      c.realizada,
      c.finHora,
      c.fin,
      c.asignacion,
      c.distancia,
      c.latitud,
      c.longitud,
      c.usuario,
    ],
    rellenar: (columna) => valorDeducido(columna, input),
    usuario: c.usuario ? { columna: c.usuario, alternativas: valoresUsuario(c.usuario, input) } : undefined,
    alternativas,
    fechas,
  }

  // Las respuestas se ligan a la visita por su id: en ese caso hay que obtenerlo de vuelta.
  const needsId = Boolean(ctx.tables.respuestas.table && ctx.tables.respuestas.columns.visita)
  const returning = c.id ?? '*'
  const { data, error, filas } = await insertarConRecuperacion<Row>([row], recuperacion, async ([values]) => {
    const result = await supabase.from(v.table!).insert(values).select(returning).single()
    if (result.error?.code !== '42501' || needsId) return { data: result.data as Row | null, error: result.error }
    // Permiso para insertar pero no para leer la fila creada, y no se necesita su id.
    const plain = await supabase.from(v.table!).insert(values)
    return { data: null, error: plain.error }
  })
  if (error) throw new ErrorAlGuardar('Registrar la visita', v.table, error, Object.keys(filas[0] ?? {}))
  return c.id && data ? (data[c.id] as Id) : null
}

async function insertRespuestas(input: FinalizarVisitaInput, visitaId: Id | null): Promise<number> {
  const { ctx, cliente, questions, visible, answers } = input
  const r = ctx.tables.respuestas
  const c = r.columns
  if (!r.table || !c.pregunta || !c.respuesta) return 0
  if (c.visita && visitaId === null && ctx.tables.visitas.table) {
    // Sin el id las respuestas quedarían sueltas, sin visita.
    throw new ErrorAlGuardar(
      'Guardar las respuestas',
      r.table,
      { code: '', message: 'No se obtuvo el id de la visita para ligar las respuestas (revisa la columna id de la tabla de visitas).' },
      [],
    )
  }

  const ahora = new Date()
  const rows: Row[] = questions
    .filter((q) => visible.has(q.key) && isAnswered(answers[q.key]))
    .map((q) => {
      const row: Row = {}
      put(row, c.pregunta, q.id)
      put(row, c.respuesta, serializeAnswer(answers[q.key]))
      put(row, c.preguntaTexto, q.text)
      if (visitaId !== null) put(row, c.visita, visitaId)
      put(row, c.cliente, cliente.id)
      if (c.usuario) put(row, c.usuario, valoresUsuario(c.usuario, input)[0])
      put(row, c.fecha, localIso(ahora))
      return row
    })
  if (rows.length === 0) return 0

  const linked = visitaId !== null && c.visita ? c.visita : c.cliente
  const { error, filas } = await insertarConRecuperacion<null>(
    rows,
    {
      esenciales: [c.pregunta, c.respuesta, linked],
      quitarPrimero: [c.fecha, c.preguntaTexto, c.usuario, c.cliente],
      rellenar: (columna) => valorDeducido(columna, input, visitaId),
      usuario: c.usuario ? { columna: c.usuario, alternativas: valoresUsuario(c.usuario, input) } : undefined,
      fechas: c.fecha ? { [c.fecha]: ahora } : {},
    },
    async (values) => {
      const result = await supabase.from(r.table!).insert(values)
      return { data: null, error: result.error }
    },
  )
  if (error) throw new ErrorAlGuardar('Guardar las respuestas', r.table, error, Object.keys(filas[0] ?? {}))
  return rows.length
}

/** Pasa la asignación del cliente a "Completada" (si los clientes se asignan por la tabla asignaciones). */
async function completarAsignacion(input: FinalizarVisitaInput): Promise<string | null> {
  const { ctx, cliente, user } = input
  const a = ctx.tables.asignaciones
  const c = a.columns
  if (!a.table || !c.estatus || !c.cliente) return null
  const update = supabase.from(a.table).update({ [c.estatus]: VALOR_ASIGNACION_COMPLETADA })
  const filtrada =
    c.id && cliente.asignacion?.id !== null && cliente.asignacion?.id !== undefined
      ? update.eq(c.id, cliente.asignacion.id)
      : c.usuario
        ? whereUser(update.eq(c.cliente, cliente.id), c.usuario, ownerValueFor(c.usuario, ctx, user))
        : update.eq(c.cliente, cliente.id)
  const { data, error } = await filtrada.select(c.id ?? c.cliente)
  if (error) throw error
  if (!data || data.length === 0) {
    return 'La visita se guardó, pero la base de datos no permitió marcar la asignación como completada (permisos RLS). Avísale a tu administrador.'
  }
  return null
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
 * Guarda la visita: 1) fila en visitas, 2) respuestas visibles, 3) marca al cliente como visitado (o su
 * asignación como completada).
 * Si un paso falla, la visita ya guardada se recuerda en el borrador y el reintento la reutiliza
 * (no se crean visitas duplicadas).
 */
export async function finalizarVisita(input: FinalizarVisitaInput): Promise<FinalizarVisitaResult> {
  let visitaId: Id | null
  // Si un intento anterior sí la guardó pero la respuesta no llegó (se cayó la señal), se reutiliza esa fila.
  const previa = input.visitaPrevia ?? (await visitaDeEsteIntento(input))
  if (previa) {
    visitaId = previa.id
    if (!input.visitaPrevia) input.onVisitaGuardada?.(previa)
  } else {
    visitaId = await insertVisita(input)
    if (input.ctx.tables.visitas.table && input.ctx.tables.visitas.columns.cliente) {
      input.onVisitaGuardada?.({ id: visitaId })
    }
  }
  // Lo mismo con las respuestas: si ya quedaron guardadas, no se vuelven a mandar.
  const respuestas = (previa ? await respuestasGuardadas(input, visitaId) : 0) || (await insertRespuestas(input, visitaId))
  let warning: string | null = null
  try {
    const usaAsignaciones = Boolean(input.ctx.tables.asignaciones.table && input.ctx.tables.asignaciones.columns.estatus)
    warning = usaAsignaciones ? await completarAsignacion(input) : await marcarVisitado(input)
  } catch {
    warning =
      'La visita y las respuestas se guardaron, pero no se pudo marcar al cliente como visitado. Avísale a tu administrador.'
  }
  return { visitaId, respuestas, warning }
}

/** Error de una consulta de revisión: sin señal se detiene el guardado (se reintenta); cualquier otro se ignora. */
function revisar(error: unknown): void {
  if (error && isNetworkError(error)) throw error
}

/**
 * Visita de este mismo intento que ya quedó guardada: mismo cliente, mismo promotor y la misma hora de inicio (la
 * del borrador, que no cambia entre reintentos). null si no hay o no se puede saber.
 */
async function visitaDeEsteIntento(input: FinalizarVisitaInput): Promise<{ id: Id | null } | null> {
  const { ctx, cliente, startedAt } = input
  const v = ctx.tables.visitas
  const c = v.columns
  if (!v.table || !c.cliente || !c.inicio || !c.id) return null
  let q = supabase.from(v.table).select(c.id).eq(c.cliente, cliente.id).eq(c.inicio, localIso(new Date(startedAt)))
  if (c.usuario) q = whereUser(q, c.usuario, valoresUsuario(c.usuario, input)[0])
  const { data, error } = await q.limit(1)
  revisar(error)
  const fila = (data as unknown as Row[] | null)?.[0]
  return !error && fila ? { id: fila[c.id] as Id } : null
}

/** Cuántas respuestas de esa visita ya están guardadas (0 si ninguna o no se puede saber). */
async function respuestasGuardadas(input: FinalizarVisitaInput, visitaId: Id | null): Promise<number> {
  const r = input.ctx.tables.respuestas
  if (!r.table || !r.columns.visita || visitaId === null) return 0
  const { data, error } = await supabase.from(r.table).select(r.columns.visita).eq(r.columns.visita, visitaId)
  revisar(error)
  return !error && Array.isArray(data) ? data.length : 0
}

/** Hora (en milisegundos) de la última visita de hoy del usuario a ese cliente; null si no hay. */
export async function visitaDeHoy(ctx: SchemaContext, user: User, cliente: Cliente): Promise<number | null> {
  const v = ctx.tables.visitas
  const c = v.columns
  const columna = c.registro ?? c.inicio
  if (!v.table || !c.cliente || !columna) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  let q = supabase.from(v.table).select(columna).eq(c.cliente, cliente.id).gte(columna, localIso(hoy))
  if (c.usuario) q = whereUser(q, c.usuario, ownerValueFor(c.usuario, ctx, user))
  const { data, error } = await q.order(columna, { ascending: false }).limit(1)
  if (error) return null
  const valor = (data as unknown as Row[] | null)?.[0]?.[columna]
  const ms = valor ? new Date(String(valor)).getTime() : NaN
  return Number.isFinite(ms) ? ms : null
}

/** Borra una visita guardada a medias (al descartar). Devuelve true si se borró. */
export async function borrarVisita(ctx: SchemaContext, visitaId: Id): Promise<boolean> {
  const v = ctx.tables.visitas
  if (!v.table || !v.columns.id) return false
  const { data, error } = await supabase.from(v.table).delete().eq(v.columns.id, visitaId).select(v.columns.id)
  return !error && Array.isArray(data) && data.length > 0
}
