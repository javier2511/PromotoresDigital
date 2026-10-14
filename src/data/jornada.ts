import type { User } from '@supabase/supabase-js'
import { likeExact, ownerValueFor, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Id, type Row } from '../lib/supabase'
import type { GeoPosition } from '../providers/GeoProvider'
import { whereUser } from './clientes'
import { ErrorAlGuardar, insertarConRecuperacion, localIso } from './insercion'

export interface Jornada {
  id: Id | null
  /** Fecha y hora de inicio (ISO). */
  inicio: string
  fin: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-10-14" en la hora del teléfono. */
export function fechaLocal(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function aJornada(row: Row, ctx: SchemaContext): Jornada {
  const c = ctx.tables.jornadas.columns
  return {
    id: c.id ? (row[c.id] as Id) : null,
    inicio: String(row[c.inicio!]),
    fin: c.fin && row[c.fin] ? String(row[c.fin]) : null,
  }
}

/** Jornada de hoy del usuario (la más reciente si hubiera varias), o null si aún no la inicia. */
export async function fetchJornadaHoy(ctx: SchemaContext, user: User): Promise<Jornada | null> {
  const t = ctx.tables.jornadas
  const c = t.columns
  if (!t.table || !c.usuario || !c.inicio) return null
  const hoy = new Date()
  const valor = ownerValueFor(c.usuario, ctx, user)
  let q = supabase.from(t.table).select('*')
  q = typeof valor === 'string' && valor.includes('@') ? q.ilike(c.usuario, likeExact(valor)) : q.eq(c.usuario, valor)
  q = c.fecha
    ? q.eq(c.fecha, fechaLocal(hoy))
    : q.gte(c.inicio, localIso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())))
  const { data, error } = await q.order(c.inicio, { ascending: false }).limit(1)
  if (error) throw error
  const row = (data as Row[] | null)?.[0]
  return row ? aJornada(row, ctx) : null
}

const put = (row: Row, column: string | undefined, value: unknown) => {
  if (column && value !== undefined && value !== null) row[column] = value
}

export async function iniciarJornada(ctx: SchemaContext, user: User, pos: GeoPosition | null): Promise<Jornada> {
  const t = ctx.tables.jornadas
  const c = t.columns
  const ahora = new Date()
  const usuarios = [...new Set([ownerValueFor(c.usuario!, ctx, user), user.id, user.email].filter(Boolean))] as (string | number)[]
  const row: Row = {}
  put(row, c.usuario, usuarios[0])
  put(row, c.fecha, fechaLocal(ahora))
  put(row, c.inicio, localIso(ahora))
  if (pos) {
    put(row, c.latitudInicio, pos.lat)
    put(row, c.longitudInicio, pos.lng)
    put(row, c.precisionInicio, Math.round(pos.accuracy))
  }
  const { data, error, filas } = await insertarConRecuperacion<Row>(
    [row],
    {
      esenciales: [c.usuario, c.inicio],
      quitarPrimero: [c.precisionInicio, c.fecha, c.latitudInicio, c.longitudInicio],
      usuario: { columna: c.usuario!, alternativas: usuarios },
      fechas: { [c.inicio!]: ahora },
    },
    async ([values]) => {
      const r = await supabase.from(t.table!).insert(values).select('*').single()
      return { data: r.data as Row | null, error: r.error }
    },
  )
  if (error) throw new ErrorAlGuardar('Iniciar la jornada', t.table!, error, Object.keys(filas[0] ?? {}))
  return data ? aJornada(data, ctx) : { id: null, inicio: localIso(ahora), fin: null }
}

export async function terminarJornada(
  ctx: SchemaContext,
  user: User,
  jornada: Jornada,
  pos: GeoPosition | null,
): Promise<void> {
  const t = ctx.tables.jornadas
  const c = t.columns
  if (!c.fin) throw new Error(`La tabla "${t.table}" no tiene una columna para la hora de fin (p. ej. hora_fin).`)
  const cambios: Row = { [c.fin]: localIso(new Date()) }
  if (pos) {
    put(cambios, c.latitudFin, pos.lat)
    put(cambios, c.longitudFin, pos.lng)
    put(cambios, c.precisionFin, Math.round(pos.accuracy))
  }
  const update = supabase.from(t.table!).update(cambios)
  const filtrada =
    c.id && jornada.id !== null
      ? update.eq(c.id, jornada.id)
      : whereUser(update.eq(c.inicio!, jornada.inicio), c.usuario!, ownerValueFor(c.usuario!, ctx, user))
  const { data, error } = await filtrada.select(c.id ?? c.inicio!)
  if (error) throw new ErrorAlGuardar('Terminar la jornada', t.table!, error, Object.keys(cambios))
  if (!data || data.length === 0) {
    throw new Error('La base de datos no permitió registrar el fin de la jornada (permisos RLS de actualización).')
  }
}
