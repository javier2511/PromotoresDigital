import { useQueryClient } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef } from 'react'
import { parseLocation, type LatLng } from '../lib/geo'
import { clearSchemaCache, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Row } from '../lib/supabase'
import { useUser } from '../providers/AuthProvider'
import { useGeo, type GeoPosition } from '../providers/GeoProvider'
import { queryKeys, useSchema } from './hooks'
import { insertarConRecuperacion } from './insercion'

const intentoKey = (userId: string) => `pd.perfil.creado.v2.${userId}`
/** Con esta precisión (m) la ubicación se guarda de inmediato; si no, se espera un poco por una mejor. */
const PRECISION_BUENA_M = 100
/** Tiempo máximo de espera por una mejor lectura; después se guarda la mejor que haya (aunque sea aproximada). */
const ESPERA_MAX_MS = 20_000

/** Columnas de ubicación de la tabla de usuarios/promotores (mismo formato de texto que usaba FlutterFlow). */
function filaUbicacion(ctx: SchemaContext, pos: LatLng | null, conTexto = true): Row {
  const c = ctx.tables.perfiles.columns
  const fila: Row = {}
  if (!pos) return fila
  if (c.latitud) fila[c.latitud] = pos.lat
  if (c.longitud) fila[c.longitud] = pos.lng
  if (c.ubicacion && conTexto) fila[c.ubicacion] = `LatLng(lat: ${pos.lat}, lng: ${pos.lng})`
  return fila
}

/**
 * Agrega la fila del usuario en la tabla de usuarios/promotores si aún no tiene (como hacía el registro de
 * FlutterFlow), con su ubicación si ya se conoce. Sin esa fila las visitas no se pueden guardar cuando
 * visitas.id_promotor apunta a esa tabla. Se intenta una sola vez por usuario y teléfono.
 */
export async function crearPerfil(ctx: SchemaContext, user: User, pos: GeoPosition | null = null): Promise<boolean> {
  const t = ctx.tables.perfiles
  if (!t.table || ctx.perfil) return false
  const c = t.columns
  if (!c.authId && !c.email) return false
  const fila: Row = {}
  if (c.authId) fila[c.authId] = user.id
  else if (c.id) fila[c.id] = user.id // tablas de usuarios cuyo id es el mismo de Supabase Auth
  if (c.email && user.email) fila[c.email] = user.email
  const nombre = user.user_metadata?.full_name
  const nombreFinal = typeof nombre === 'string' && nombre.trim() ? nombre.trim() : user.email?.split('@')[0]
  if (c.nombre && nombreFinal) fila[c.nombre] = nombreFinal
  Object.assign(fila, filaUbicacion(ctx, pos))
  const { error } = await insertarConRecuperacion(
    [fila],
    { esenciales: [c.authId ?? c.email], quitarPrimero: [c.ubicacion, c.latitud, c.longitud, c.id, c.nombre] },
    async (filas) => {
      const r = await supabase.from(t.table!).insert(filas)
      return { data: null, error: r.error }
    },
  )
  return !error
}

/** Guarda la ubicación del usuario en su fila de usuarios/promotores. Lanza un error si la base no lo permite. */
export async function guardarUbicacionPerfil(ctx: SchemaContext, pos: LatLng, conTexto = true): Promise<void> {
  const t = ctx.tables.perfiles
  if (!t.table || !t.columns.id || !ctx.perfil) throw new Error('No se encontró tu fila en la tabla de usuarios.')
  const cambios = filaUbicacion(ctx, pos, conTexto)
  if (Object.keys(cambios).length === 0) throw new Error(`La tabla "${t.table}" no tiene columnas de ubicación.`)
  const { data, error } = await supabase
    .from(t.table)
    .update(cambios)
    .eq(t.columns.id, ctx.perfil.id)
    .select(t.columns.id)
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`La base de datos no permitió actualizar tu fila en "${t.table}" (permisos RLS de actualización).`)
  }
}

export function useAsegurarPerfil() {
  const user = useUser()
  const { data: ctx } = useSchema()
  const { position } = useGeo()
  const queryClient = useQueryClient()
  const ubicacionIntentada = useRef(false)
  const mejor = useRef<GeoPosition | null>(null)
  const espera = useRef<number | null>(null)

  const refrescar = useCallback(() => {
    clearSchemaCache()
    void queryClient.invalidateQueries({ queryKey: queryKeys.schema(user.id) })
  }, [queryClient, user.id])

  // 1) Crear la fila del usuario si no existe.
  useEffect(() => {
    // Solo si la tabla se pudo leer (si no, "no encontrado" podría ser falta de permiso).
    if (!ctx || ctx.perfil || !ctx.tables.perfiles.table || ctx.tables.perfiles.error) return
    try {
      if (localStorage.getItem(intentoKey(user.id))) return
      localStorage.setItem(intentoKey(user.id), '1')
    } catch {
      return
    }
    const pos = position && position.accuracy <= PRECISION_BUENA_M ? position : null
    void crearPerfil(ctx, user, pos).then((creado) => {
      if (creado) refrescar()
    })
    // Se crea en cuanto se conoce el contexto (una sola vez); si aún no hay GPS, la ubicación se agrega en el paso 2.
  }, [ctx, user, position, refrescar])

  // 2) Guardar su ubicación (la del registro) si su fila aún no tiene latitud/longitud.
  useEffect(() => {
    const perfil = ctx?.perfil
    if (!ctx || !perfil || perfil.conUbicacion !== false || ubicacionIntentada.current) return
    const guardar = (pos: LatLng, conTexto: boolean) => {
      if (ubicacionIntentada.current) return
      ubicacionIntentada.current = true
      if (espera.current !== null) window.clearTimeout(espera.current)
      guardarUbicacionPerfil(ctx, pos, conTexto).then(refrescar, () => {
        /* sin permiso o sin conexión: se intenta de nuevo la próxima vez que abra la app */
      })
    }
    // a) Ya hay ubicación en texto (p. ej. la que guardó FlutterFlow al registrarse): se copia a latitud/longitud.
    const deTexto = parseLocation(perfil.ubicacionTexto)
    if (deTexto) return guardar(deTexto, false)
    // b) Con el GPS: se guarda en cuanto la lectura es buena o, si no mejora, la mejor que haya tras unos segundos.
    if (!position) return
    if (!mejor.current || position.accuracy < mejor.current.accuracy) mejor.current = position
    if (mejor.current.accuracy <= PRECISION_BUENA_M) return guardar(mejor.current, true)
    espera.current ??= window.setTimeout(() => {
      if (mejor.current) guardar(mejor.current, true)
    }, ESPERA_MAX_MS)
  }, [ctx, position, refrescar])

  useEffect(
    () => () => {
      if (espera.current !== null) window.clearTimeout(espera.current)
    },
    [],
  )
}
