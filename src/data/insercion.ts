import type { PostgrestError } from '@supabase/supabase-js'
import { isNetworkError } from '../lib/errors'
import { isMissingColumnError } from '../lib/schema-resolver'
import type { Row } from '../lib/supabase'
import { normalize } from '../lib/text'

export type ErrorPostgrest = Pick<PostgrestError, 'code' | 'message'> & Partial<Pick<PostgrestError, 'details' | 'hint'>>

const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')

/** Fecha y hora local con zona horaria (para columnas timestamp, timestamptz, date y texto). */
export function localIso(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  )
}

/** Solo la hora local, "10:40:05" (columnas de tipo time: Postgres no acepta ahí una fecha completa). */
export function soloHora(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function palabras(columna: string): string[] {
  return normalize(columna.replace(/([a-z])([A-Z])/g, '$1_$2'))
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Columna obligatoria que faltó: 'null value in column "hora" of relation "visitas"…'. */
export function columnaObligatoria(error: ErrorPostgrest): string | null {
  return /column "([^"]+)"/.exec(error.message ?? '')?.[1] ?? null
}

/**
 * Columna cuyo valor rechazó la base: la que nombra una llave foránea ("Key (usuario_id)=(…)") o la que
 * tiene el valor que aparece entre comillas en el mensaje ('invalid input syntax for type uuid: "7"').
 */
export function columnaPorValor(error: ErrorPostgrest, fila: Row, prioridad: (string | undefined)[] = []): string | null {
  const texto = `${error.message ?? ''} ${error.details ?? ''}`
  const llave = /Key \(([^)]+)\)=/.exec(texto)?.[1]
  if (llave && llave in fila) return llave
  const citados = new Set([...texto.matchAll(/"([^"]*)"/g)].map((m) => m[1]))
  const orden = [...new Set([...prioridad.filter((c): c is string => Boolean(c && c in fila)), ...Object.keys(fila)])]
  return orden.find((c) => fila[c] !== null && fila[c] !== undefined && citados.has(String(fila[c]))) ?? null
}

/** Columna que nombra el error (columna inexistente, restricción "visitas_estado_check"…). */
export function columnaNombrada(error: ErrorPostgrest, columnas: string[]): string | null {
  const texto = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()
  const escapar = (c: string) => c.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (
    columnas
      .filter((c) => new RegExp(`(^|[^a-z0-9])${escapar(c)}([^a-z0-9]|$)`).test(texto))
      .sort((a, b) => b.length - a.length)[0] ?? null
  )
}

/** Errores porque un dato no encaja en su columna (tipo, enum, check, columna inexistente o generada). */
export function esErrorDeDato(error: ErrorPostgrest): boolean {
  if (isNetworkError(error) || error.code === '42501') return false
  return isMissingColumnError(error) || /^22/.test(error.code ?? '') || error.code === '23514' || error.code === '428C9'
}

const RECHAZA_VALOR = new Set(['22P02', '22007', '22008', '22003', '22001', '23503', '42501'])

/** Formas de decir "sí" según el tipo de la columna (booleano, número, texto o lista de valores). */
export const VALORES_SI: unknown[] = [true, 1, 'Sí', 'Si', 'si', 'SI', 'S']
export const VALORES_NO: unknown[] = [false, 0, 'No', 'no', 'NO', 'N']

export interface Recuperacion {
  /** Columnas sin las que no tiene sentido guardar (nunca se quitan). */
  esenciales: (string | undefined)[]
  /** Si el error no dice qué columna falló, se quitan en este orden (lo menos importante primero). */
  quitarPrimero: (string | undefined)[]
  /** Valor para una columna obligatoria (NOT NULL) que no se envió; undefined si no se sabe. */
  rellenar?: (columna: string) => unknown
  /** Columna del usuario y otras formas de identificarlo (uuid, correo, id de la tabla de usuarios). */
  usuario?: { columna: string; alternativas: (string | number)[] }
  /** Otros valores a probar, en orden, si la base rechaza el de una columna. */
  alternativas?: Record<string, unknown[]>
  /** Fecha que representa cada columna de fecha/hora, para cambiar de formato si la base lo rechaza. */
  fechas?: Record<string, Date>
}

export interface ResultadoInsercion<T> {
  data: T | null
  error: PostgrestError | null
  /** Filas tal como se enviaron en el último intento. */
  filas: Row[]
}

/**
 * Inserta y, si la base rechaza algo, corrige y reintenta:
 * llena columnas obligatorias que falten, prueba otra forma de identificar al usuario, cambia el
 * formato de fechas/horas o quita la columna opcional que no encaja. Nunca quita las esenciales.
 */
export async function insertarConRecuperacion<T>(
  filas: Row[],
  rec: Recuperacion,
  enviar: (filas: Row[]) => Promise<{ data: T | null; error: PostgrestError | null }>,
): Promise<ResultadoInsercion<T>> {
  let actuales = filas
  const esenciales = new Set(rec.esenciales.filter(Boolean))
  const fechas: Record<string, Date> = { ...rec.fechas }
  const alternativas = new Map<string, unknown[]>(Object.entries(rec.alternativas ?? {}))
  if (rec.usuario) alternativas.set(rec.usuario.columna, rec.usuario.alternativas)
  const probados = new Map<string, Set<string>>()
  const formatoCambiado = new Set<string>()
  const rellenadas = new Set<string>()
  const quitadas = new Set<string>()
  /** Error de permisos o de llave foránea del usuario: es más útil que el de tipo de la forma alternativa. */
  let errorUsuario: PostgrestError | null = null
  const cambiar = (columna: string, valor: unknown) => {
    actuales = actuales.map((f) => ({ ...f, [columna]: valor }))
  }
  const quitar = (columna: string) => {
    quitadas.add(columna)
    actuales = actuales.map((f) => {
      const copia = { ...f }
      delete copia[columna]
      return copia
    })
  }
  /** Cambia la columna al siguiente valor alternativo que no se haya probado. */
  const probarOtro = (columna: string, fila: Row): boolean => {
    const lista = alternativas.get(columna)
    if (!lista || !(columna in fila)) return false
    const vistos = probados.get(columna) ?? new Set<string>()
    vistos.add(String(fila[columna]))
    probados.set(columna, vistos)
    const otro = lista.find((v) => v !== undefined && v !== null && !vistos.has(String(v)))
    if (otro === undefined) return false
    cambiar(columna, otro)
    return true
  }

  for (let intento = 0; ; intento++) {
    const r = await enviar(actuales)
    const error = r.error
    if (!error || intento >= 20 || isNetworkError(error)) return { ...r, filas: actuales }
    const fila = actuales[0] ?? {}

    // 1) Columna obligatoria sin valor: se llena si se sabe qué poner (una sola vez por columna).
    if (error.code === '23502') {
      const columna = columnaObligatoria(error)
      if (!columna || columna in fila || rellenadas.has(columna) || quitadas.has(columna)) return { ...r, filas: actuales }
      const valor = rec.rellenar?.(columna)
      if (valor === undefined || valor === null) return { ...r, filas: actuales }
      rellenadas.add(columna)
      if (valor === true && !alternativas.has(columna)) alternativas.set(columna, VALORES_SI)
      if (typeof valor === 'string' && /^\d{2}:\d{2}:\d{2}$|T\d{2}:\d{2}/.test(valor)) fechas[columna] = new Date()
      cambiar(columna, valor)
      continue
    }

    // 2) La base rechazó un valor: se identifica la columna y se corrige.
    if (RECHAZA_VALOR.has(error.code)) {
      const columna =
        error.code === '42501'
          ? (rec.usuario?.columna ?? null)
          : columnaPorValor(error, fila, [rec.usuario?.columna, ...alternativas.keys(), ...Object.keys(fechas)])
      if (columna && columna === rec.usuario?.columna && (error.code === '42501' || error.code === '23503')) {
        errorUsuario ??= error
      }
      if (columna && probarOtro(columna, fila)) continue
      // Ya se probaron todas las formas de identificar al usuario: es un tema de permisos o de datos.
      if (columna && columna === rec.usuario?.columna) return { ...r, error: errorUsuario ?? error, filas: actuales }
      if (columna && fechas[columna] && !formatoCambiado.has(columna)) {
        formatoCambiado.add(columna)
        cambiar(columna, String(fila[columna]).includes('T') ? soloHora(fechas[columna]) : localIso(fechas[columna]))
        continue
      }
      // Columna obligatoria que ya se llenó y no acepta ninguna opción: quitarla no sirve.
      if (columna && rellenadas.has(columna)) return { ...r, filas: actuales }
      if (columna && columna in fila && !esenciales.has(columna)) {
        quitar(columna)
        continue
      }
      if (columna || error.code === '42501' || error.code === '23503') return { ...r, filas: actuales }
    }

    // 3) Columna inexistente, restricción o dato sin columna identificada: otro valor o se quita la opcional.
    if (esErrorDeDato(error)) {
      const opcionales = Object.keys(fila).filter((c) => !esenciales.has(c))
      const columna =
        columnaNombrada(error, opcionales) ??
        rec.quitarPrimero.find((c): c is string => Boolean(c && opcionales.includes(c))) ??
        null
      if (columna && !isMissingColumnError(error) && probarOtro(columna, fila)) continue
      if (columna && rellenadas.has(columna)) return { ...r, filas: actuales }
      if (columna) {
        quitar(columna)
        continue
      }
    }
    return { ...r, filas: actuales }
  }
}

/** Error al guardar, con el paso y la tabla donde ocurrió (para mostrar el detalle técnico). */
export class ErrorAlGuardar extends Error {
  paso: string
  tabla: string
  code: string
  details: string
  hint: string
  columnas: string[]

  constructor(paso: string, tabla: string, error: ErrorPostgrest, columnas: string[]) {
    super(error.message)
    this.name = 'ErrorAlGuardar'
    this.paso = paso
    this.tabla = tabla
    this.code = error.code ?? ''
    this.details = error.details ?? ''
    this.hint = error.hint ?? ''
    this.columnas = columnas
  }
}
