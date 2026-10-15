import { useQueryClient } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef } from 'react'
import { clearSchemaCache, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Row } from '../lib/supabase'
import { useUser } from '../providers/AuthProvider'
import { useGeo, type GeoPosition } from '../providers/GeoProvider'
import { queryKeys, useSchema } from './hooks'
import { insertarConRecuperacion } from './insercion'

const intentoKey = (userId: string) => `pd.perfil.creado.v2.${userId}`
/** Precisión mínima (m) para guardar la ubicación del promotor. */
const PRECISION_MAX_M = 500

/** Columnas de ubicación de la tabla de usuarios/promotores (mismo formato de texto que usaba FlutterFlow). */
function filaUbicacion(ctx: SchemaContext, pos: GeoPosition | null): Row {
  const c = ctx.tables.perfiles.columns
  const fila: Row = {}
  if (!pos) return fila
  if (c.latitud) fila[c.latitud] = pos.lat
  if (c.longitud) fila[c.longitud] = pos.lng
  if (c.ubicacion) fila[c.ubicacion] = `LatLng(lat: ${pos.lat}, lng: ${pos.lng})`
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

/** Guarda la ubicación del usuario en su fila de usuarios/promotores (si estaba vacía). */
export async function guardarUbicacionPerfil(ctx: SchemaContext, pos: GeoPosition): Promise<boolean> {
  const t = ctx.tables.perfiles
  if (!t.table || !t.columns.id || !ctx.perfil) return false
  const cambios = filaUbicacion(ctx, pos)
  if (Object.keys(cambios).length === 0) return false
  const { data, error } = await supabase
    .from(t.table)
    .update(cambios)
    .eq(t.columns.id, ctx.perfil.id)
    .select(t.columns.id)
  return !error && Array.isArray(data) && data.length > 0
}

export function useAsegurarPerfil() {
  const user = useUser()
  const { data: ctx } = useSchema()
  const { position } = useGeo()
  const queryClient = useQueryClient()
  const ubicacionIntentada = useRef(false)

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
    const pos = position && position.accuracy <= PRECISION_MAX_M ? position : null
    void crearPerfil(ctx, user, pos).then((creado) => {
      if (creado) refrescar()
    })
    // Se crea en cuanto se conoce el contexto (una sola vez); si aún no hay GPS, la ubicación se agrega en el paso 2.
  }, [ctx, user, position, refrescar])

  // 2) Guardar su ubicación (la del registro) cuando el GPS la dé, si su fila aún no la tiene.
  useEffect(() => {
    if (!ctx?.perfil || ctx.perfil.conUbicacion !== false || !position || ubicacionIntentada.current) return
    if (position.accuracy > PRECISION_MAX_M) return
    ubicacionIntentada.current = true
    void guardarUbicacionPerfil(ctx, position).then((ok) => {
      if (ok) refrescar()
    })
  }, [ctx, position, refrescar])
}
