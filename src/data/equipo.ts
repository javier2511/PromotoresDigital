import { ROL_PROMOTOR } from '../config/schema'
import { locationFromColumns, type LatLng } from '../lib/geo'
import type { SchemaContext } from '../lib/schema-resolver'
import { supabase, type Id, type Row } from '../lib/supabase'
import { esVacio, normalize, toBoolean } from '../lib/text'
import { fetchAll } from './clientes'
import { localIso } from './insercion'

export interface JornadaEquipo {
  inicio: string
  fin: string | null
  entrada: LatLng | null
  salida: LatLng | null
  precisionEntrada: number | null
  precisionSalida: number | null
}

export interface MiembroEquipo {
  id: Id
  nombre: string
  correo: string | null
  /** Jornada más reciente del día (null si no la inició). */
  jornada: JornadaEquipo | null
}

export interface Equipo {
  fecha: string
  miembros: MiembroEquipo[]
  /** Filas de promotores que la base dejó leer (si es 1, falta el permiso de admin: 10_admin_jornadas.sql). */
  promotoresVisibles: number
}

const numero = (v: unknown) => (esVacio(v) || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)))

/** Jornadas del día de todos los promotores (requiere ser admin: lo controla la política de Supabase). */
export async function fetchEquipo(ctx: SchemaContext, fecha: string): Promise<Equipo> {
  const j = ctx.tables.jornadas
  const p = ctx.tables.perfiles
  const cj = j.columns
  const cp = p.columns
  if (!j.table || !cj.usuario || !cj.inicio) throw new Error('No existe la tabla de jornadas (ejecuta supabase/06_jornadas.sql).')
  if (!p.table || !cp.id) throw new Error('No se encontró la tabla de promotores.')

  const [y, m, d] = fecha.split('-').map(Number)
  const desde = localIso(new Date(y, m - 1, d))
  const hasta = localIso(new Date(y, m - 1, d + 1))
  const [jornadas, promotores] = await Promise.all([
    fetchAll(() => {
      let q = supabase.from(j.table!).select('*', { count: 'exact' })
      q = cj.fecha ? q.eq(cj.fecha, fecha) : q.gte(cj.inicio!, desde).lt(cj.inicio!, hasta)
      return q.order(cj.inicio!, { ascending: false }).order(cj.id ?? cj.usuario!, { ascending: true })
    }),
    fetchAll(() => supabase.from(p.table!).select('*', { count: 'exact' }).order(cp.id!, { ascending: true })),
  ])

  // La más reciente de cada promotor (llegan de la más nueva a la más vieja).
  const porUsuario = new Map<string, Row>()
  for (const row of jornadas) {
    const key = String(row[cj.usuario])
    if (!porUsuario.has(key)) porUsuario.set(key, row)
  }
  const punto = (lat?: string, lng?: string) => (row: Row) =>
    lat && lng ? locationFromColumns(row[lat], row[lng]) : null

  const miembros = promotores
    .filter((row) => {
      if (cp.activo && toBoolean(row[cp.activo]) === false) return false
      // Solo los promotores (no otros administradores); rol vacío = promotor, como al registrarse.
      // Sin columna de rol: todos menos uno mismo.
      if (!cp.rol) return String(row[cp.id!]) !== String(ctx.perfil?.id)
      return esVacio(row[cp.rol]) || normalize(row[cp.rol]) === ROL_PROMOTOR
    })
    .map((row): MiembroEquipo => {
      const id = row[cp.id!] as Id
      const jr = porUsuario.get(String(id))
      const nombre = cp.nombre && !esVacio(row[cp.nombre]) ? String(row[cp.nombre]).trim() : null
      const correo = cp.email && !esVacio(row[cp.email]) ? String(row[cp.email]).trim() : null
      return {
        id,
        nombre: nombre ?? correo ?? String(id),
        correo,
        jornada: jr
          ? {
              inicio: String(jr[cj.inicio!]),
              fin: cj.fin && !esVacio(jr[cj.fin]) ? String(jr[cj.fin]) : null,
              entrada: punto(cj.latitudInicio, cj.longitudInicio)(jr),
              salida: punto(cj.latitudFin, cj.longitudFin)(jr),
              precisionEntrada: cj.precisionInicio ? numero(jr[cj.precisionInicio]) : null,
              precisionSalida: cj.precisionFin ? numero(jr[cj.precisionFin]) : null,
            }
          : null,
      }
    })
    // Primero los que ya iniciaron (por hora de entrada), luego los que no, por nombre.
    .sort((a, b) => {
      if (a.jornada && b.jornada) return a.jornada.inicio.localeCompare(b.jornada.inicio)
      if (a.jornada) return -1
      if (b.jornada) return 1
      return a.nombre.localeCompare(b.nombre, 'es')
    })

  return { fecha, miembros, promotoresVisibles: promotores.length }
}

/** Enlace de Google Maps a un punto. */
export function enlaceMapa(punto: LatLng): string {
  return `https://www.google.com/maps?q=${punto.lat},${punto.lng}`
}

