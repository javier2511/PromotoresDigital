import { friendlyError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { UsuarioPorCrear } from '../lib/usuarios-masivos'

export type EstadoUsuario = 'creado' | 'ya_existe' | 'region' | 'sin_cuenta'
export type ResultadoUsuario = { estado: EstadoUsuario } | { estado: 'error'; mensaje: string }

/** La función de supabase/13_crear_usuarios.sql todavía no existe en la base. */
export class FaltaCrearUsuarios extends Error {
  constructor() {
    super('Falta ejecutar supabase/13_crear_usuarios.sql en Supabase.')
  }
}

/** Para guardar regiones falta supabase/14_lideres_por_region.sql (función pd_asignar_region). */
export class FaltaAsignarRegion extends Error {
  constructor() {
    super('Falta ejecutar supabase/14_lideres_por_region.sql en Supabase.')
  }
}

const faltaFuncion = (error: { code?: string; message: string }) =>
  error.code === 'PGRST202' || /could not find the function/i.test(error.message)

/** Le pone la región al promotor con ese correo; false si no está en la tabla de promotores. */
async function asignarRegion(correo: string, region: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('pd_asignar_region', { p_correo: correo, p_region: region })
  if (error) {
    if (faltaFuncion(error)) throw new FaltaAsignarRegion()
    throw error
  }
  return data === true
}

/**
 * Crea la cuenta (ya confirmada, con su contraseña) y su fila en promotores, o avisa que ya existía; después le
 * pone la región si trae. Un renglón sin contraseña solo asigna la región.
 */
export async function crearUsuario(u: UsuarioPorCrear, cambiarContrasena: boolean): Promise<EstadoUsuario> {
  if (u.soloRegion) return (await asignarRegion(u.correo, u.region)) ? 'region' : 'sin_cuenta'
  const { data, error } = await supabase.rpc('pd_crear_usuario', {
    p_correo: u.correo,
    p_nombre: u.nombre,
    p_contrasena: u.contrasena,
    p_cambiar_contrasena: cambiarContrasena,
  })
  if (error) {
    if (faltaFuncion(error)) throw new FaltaCrearUsuarios()
    throw error
  }
  if (u.region) await asignarRegion(u.correo, u.region)
  return data === 'ya_existe' ? 'ya_existe' : 'creado'
}

/**
 * Crea los usuarios de pocos en pocos (cada contraseña se cifra en la base) y avisa cada resultado.
 * Si falta un SQL, se detiene y lanza FaltaCrearUsuarios o FaltaAsignarRegion (con regiones se revisa antes de
 * crear a nadie, para no dejar cuentas sin su región).
 */
export async function crearUsuarios(
  lista: UsuarioPorCrear[],
  cambiarContrasena: boolean,
  alTerminar: (correo: string, resultado: ResultadoUsuario) => void,
  simultaneos = 3,
): Promise<void> {
  if (lista.some((u) => u.region)) await asignarRegion('', '')
  let siguiente = 0
  let falta: Error | null = null
  const trabajador = async () => {
    while (!falta && siguiente < lista.length) {
      const u = lista[siguiente++]
      try {
        alTerminar(u.correo, { estado: await crearUsuario(u, cambiarContrasena) })
      } catch (e) {
        if (e instanceof FaltaCrearUsuarios || e instanceof FaltaAsignarRegion) falta = e
        else alTerminar(u.correo, { estado: 'error', mensaje: friendlyError(e) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(simultaneos, lista.length) }, trabajador))
  if (falta) throw falta
}
