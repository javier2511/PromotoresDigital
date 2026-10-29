import { friendlyError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { UsuarioPorCrear } from '../lib/usuarios-masivos'

export type ResultadoUsuario = { estado: 'creado' | 'ya_existe' } | { estado: 'error'; mensaje: string }

/** La función de supabase/13_crear_usuarios.sql todavía no existe en la base. */
export class FaltaCrearUsuarios extends Error {
  constructor() {
    super('Falta ejecutar supabase/13_crear_usuarios.sql en Supabase.')
  }
}

/** Crea la cuenta (ya confirmada, con su contraseña) y su fila en promotores, o avisa que ya existía. */
export async function crearUsuario(
  u: Pick<UsuarioPorCrear, 'nombre' | 'correo' | 'contrasena'>,
  cambiarContrasena: boolean,
): Promise<'creado' | 'ya_existe'> {
  const { data, error } = await supabase.rpc('pd_crear_usuario', {
    p_correo: u.correo,
    p_nombre: u.nombre,
    p_contrasena: u.contrasena,
    p_cambiar_contrasena: cambiarContrasena,
  })
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) throw new FaltaCrearUsuarios()
    throw error
  }
  return data === 'ya_existe' ? 'ya_existe' : 'creado'
}

/**
 * Crea los usuarios de pocos en pocos (cada contraseña se cifra en la base) y avisa cada resultado.
 * Si falta el SQL, se detiene y lanza FaltaCrearUsuarios.
 */
export async function crearUsuarios(
  lista: UsuarioPorCrear[],
  cambiarContrasena: boolean,
  alTerminar: (correo: string, resultado: ResultadoUsuario) => void,
  simultaneos = 3,
): Promise<void> {
  let siguiente = 0
  let falta: FaltaCrearUsuarios | null = null
  const trabajador = async () => {
    while (!falta && siguiente < lista.length) {
      const u = lista[siguiente++]
      try {
        alTerminar(u.correo, { estado: await crearUsuario(u, cambiarContrasena) })
      } catch (e) {
        if (e instanceof FaltaCrearUsuarios) falta = e
        else alTerminar(u.correo, { estado: 'error', mensaje: friendlyError(e) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(simultaneos, lista.length) }, trabajador))
  if (falta) throw falta
}
