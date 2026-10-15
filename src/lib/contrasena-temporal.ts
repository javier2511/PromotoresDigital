/** Correo con el que se entró usando la contraseña temporal (se guarda antes de iniciar sesión). */
const TEMPORAL_KEY = 'pd.contrasenaTemporal'

export function guardarCorreoTemporal(email: string | null) {
  try {
    if (email) sessionStorage.setItem(TEMPORAL_KEY, email.trim().toLowerCase())
    else sessionStorage.removeItem(TEMPORAL_KEY)
  } catch {
    /* sin almacenamiento */
  }
}

export function leerCorreoTemporal(): string | null {
  try {
    return sessionStorage.getItem(TEMPORAL_KEY)
  } catch {
    return null
  }
}
