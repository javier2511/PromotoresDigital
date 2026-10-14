import { useQueryClient } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { useEffect } from 'react'
import { clearSchemaCache, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Row } from '../lib/supabase'
import { useUser } from '../providers/AuthProvider'
import { queryKeys, useSchema } from './hooks'
import { insertarConRecuperacion } from './insercion'

const intentoKey = (userId: string) => `pd.perfil.creado.${userId}`

/**
 * Para cuentas creadas desde "Crear cuenta": agrega su fila en la tabla de usuarios (si existe),
 * como hacía el registro de FlutterFlow. Se intenta una sola vez por usuario.
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
  if (c.nombre && typeof nombre === 'string' && nombre.trim()) fila[c.nombre] = nombre.trim()
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
    if (!ctx || ctx.perfil || user.user_metadata?.registro_app !== true) return
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
