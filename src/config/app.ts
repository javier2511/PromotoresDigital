const env = import.meta.env

function numberFromEnv(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const APP_NAME = 'Promotores Digital'

export const SUPABASE_URL: string = env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_KEY: string =
  env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

/** Metros para considerar que el promotor está en el punto de venta (más lejos: se le avisa y queda registrado). */
export const RADIO_VISITA_M = numberFromEnv(env.VITE_RADIO_VISITA_M, 100)

/** Estilo del mapa. OpenFreeMap es gratuito, sin API key ni límites de uso. */
export const MAP_STYLE_URL: string =
  env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty'

/** Fuente para los números de los grupos de puntos en el mapa (debe existir en el servidor de glifos del estilo). */
export const MAP_LABEL_FONT = ['Noto Sans Bold']

/** Centro por defecto del mapa si no hay clientes ni ubicación (Ciudad de México). */
export const DEFAULT_CENTER: [number, number] = [-99.1332, 19.4326]

/** Un borrador de visita sin terminar se descarta pasado este tiempo. */
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000

/**
 * Contraseña temporal que el administrador le pone a un promotor que olvidó la suya. Si alguien entra con ella
 * (o su cuenta tiene user_metadata.debe_cambiar_contrasena = true), la app le pide elegir una nueva antes de seguir.
 */
export const CONTRASENA_TEMPORAL = 'coca1234'

export const APP_VERSION = '1.0.0'
