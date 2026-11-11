/** Usuarios desactivados (promotores.activo = false): no entran a la app. */
export const MENSAJE_CUENTA_INACTIVA = 'Tu usuario está desactivado. Habla con tu administrador.'

let aviso = false

/** Se cerró la sesión porque el usuario está desactivado: el inicio de sesión lo explica. */
export function avisarCuentaInactiva(): void {
  aviso = true
}

export function hayAvisoCuentaInactiva(): boolean {
  return aviso
}

export function quitarAvisoCuentaInactiva(): void {
  aviso = false
}
