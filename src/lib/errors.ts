interface ErrorLike {
  message?: string
  code?: string
  status?: number
}

export function isNetworkError(error: unknown): boolean {
  const e = error as ErrorLike | null
  if (!e) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return !e.code && /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(e.message ?? '')
}

/** Mensaje claro, en español, para mostrar al promotor. */
export function friendlyError(error: unknown): string {
  const e = (error ?? {}) as ErrorLike
  const msg = e.message ?? String(error)
  if (isNetworkError(e)) return 'Sin conexión a internet. Revisa tu señal e inténtalo de nuevo.'
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.'
  if (/email not confirmed/i.test(msg)) return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada.'
  if (e.status === 429 || /rate limit|too many requests/i.test(msg)) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
  }
  if (e.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return 'La base de datos no permitió la operación (permisos RLS). Avísale a tu administrador.'
  }
  if (/jwt expired|invalid jwt|refresh token/i.test(msg)) return 'Tu sesión expiró. Vuelve a iniciar sesión.'
  if (/password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.'
  if (/should be different from the old password/i.test(msg)) {
    return 'La nueva contraseña debe ser distinta de la anterior.'
  }
  return msg
}
