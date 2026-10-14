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
  if (/user already registered|already been registered/i.test(msg)) return 'Ya existe una cuenta con ese correo. Inicia sesión.'
  if (/signups? not allowed|signup.*disabled/i.test(msg)) {
    return 'El registro de usuarios está desactivado en Supabase (Authentication → Sign In / Providers → "Allow new users to sign up").'
  }
  if (/email rate limit/i.test(msg)) {
    return 'Supabase no pudo enviar más correos por ahora (límite de envío). Espera un rato o desactiva "Confirm email" en Supabase.'
  }
  if (/for security purposes/i.test(msg)) return 'Espera unos segundos e inténtalo de nuevo.'
  if (/invalid format|unable to validate email/i.test(msg)) return 'El correo no es válido.'
  if (/email not confirmed/i.test(msg)) return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada.'
  if (e.status === 429 || /rate limit|too many requests/i.test(msg)) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
  }
  if (e.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return 'La base de datos no permitió la operación (permisos RLS). Avísale a tu administrador.'
  }
  if (e.code === '23503' && /promotor|usuario|user/i.test(msg)) {
    return 'Tu usuario no está dado de alta en la tabla de promotores. Avísale a tu administrador para que te agregue.'
  }
  if (e.code === '23503') return 'Un dato no existe en la tabla relacionada (llave foránea). Revisa el detalle técnico.'
  if (e.code === '23502') return 'Falta un dato obligatorio en la base de datos. Revisa el detalle técnico.'
  if (/jwt expired|invalid jwt|refresh token/i.test(msg)) return 'Tu sesión expiró. Vuelve a iniciar sesión.'
  if (/password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.'
  if (/should be different from the old password/i.test(msg)) {
    return 'La nueva contraseña debe ser distinta de la anterior.'
  }
  return msg
}

/** Detalle técnico de un error al guardar, para mostrarlo y poder copiarlo. */
export interface DetalleError {
  fecha: string
  paso?: string
  tabla?: string
  codigo?: string
  mensaje: string
  detalle?: string
  pista?: string
  columnas?: string[]
}

export function detalleDeError(error: unknown): DetalleError {
  const e = (error ?? {}) as Record<string, unknown>
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)
  return {
    fecha: new Date().toISOString(),
    paso: texto(e.paso),
    tabla: texto(e.tabla),
    codigo: texto(e.code),
    mensaje: texto(e.message) ?? String(error),
    detalle: texto(e.details),
    pista: texto(e.hint),
    columnas: Array.isArray(e.columnas) ? (e.columnas as string[]) : undefined,
  }
}

export function textoDetalle(d: DetalleError): string {
  return [
    d.paso && `Paso: ${d.paso}`,
    d.tabla && `Tabla: ${d.tabla}`,
    d.codigo && `Código: ${d.codigo}`,
    `Mensaje: ${d.mensaje}`,
    d.detalle && `Detalle: ${d.detalle}`,
    d.pista && `Pista: ${d.pista}`,
    d.columnas?.length && `Columnas enviadas: ${d.columnas.join(', ')}`,
    `Fecha: ${d.fecha}`,
  ]
    .filter(Boolean)
    .join('\n')
}

const ULTIMO_ERROR = 'pd.ultimoError'

export function guardarUltimoError(detalle: DetalleError) {
  try {
    localStorage.setItem(ULTIMO_ERROR, JSON.stringify(detalle))
  } catch {
    /* sin almacenamiento */
  }
}

export function leerUltimoError(): DetalleError | null {
  try {
    return JSON.parse(localStorage.getItem(ULTIMO_ERROR) ?? 'null') as DetalleError | null
  } catch {
    return null
  }
}
