import { useQueryClient } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { useEffect } from 'react'
import { clearSchemaCache, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Row } from '../lib/supabase'
import { useUser } from '../providers/AuthProvider'
import { queryKeys, useSchema } from './hooks'
import { insertarConRecuperacion } from './insercion'

const intentoKey = (userId: string) => `pd.perfil.creado.v2.${userId}`

/**
 * Agrega la fila del usuario en la tabla de usuarios/promotores si aún no tiene (como hacía el registro de
 * FlutterFlow). Sin esa fila las visitas no se pueden guardar cuando visitas.id_promotor apunta a esa tabla.
 * Se intenta una sola vez por usuario y teléfono.
 */
export async function crearPerfil(ctx: SchemaContext, user: User): Promise<boolean> {
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
  const { error } = await insertarConRecuperacion(
    [fila],
    { esenciales: [c.authId ?? c.email], quitarPrimero: [c.id, c.nombre] },
    async (filas) => {
      const r = await supabase.from(t.table!).insert(filas)
      return { data: null, error: r.error }
    },
  )
  return !error
}

export function useAsegurarPerfil() {
  const user = useUser()
  const { data: ctx } = useSchema()
  const queryClient = useQueryClient()

  useEffect(() => {
    // Solo si la tabla se pudo leer (si no, "no encontrado" podría ser falta de permiso).
    if (!ctx || ctx.perfil || !ctx.tables.perfiles.table || ctx.tables.perfiles.error) return
    try {
      if (localStorage.getItem(intentoKey(user.id))) return
      localStorage.setItem(intentoKey(user.id), '1')
    } catch {
      return
    }
    void crearPerfil(ctx, user).then((creado) => {
      if (!creado) return
      clearSchemaCache()
      void queryClient.invalidateQueries({ queryKey: queryKeys.schema(user.id) })
    })
  }, [ctx, user, queryClient])
}
