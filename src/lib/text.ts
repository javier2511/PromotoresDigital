import { ETIQUETAS } from '../config/schema'

/** Minúsculas, sin acentos ni espacios extra: "  Sí " → "si". */
export function normalize(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

const TRUE_WORDS = new Set(['true', 'si', 'yes', '1', 'verdadero'])
const FALSE_WORDS = new Set(['false', 'no', '0', 'falso'])

/** Interpreta booleanos escritos de muchas formas. Devuelve null si no es un booleano reconocible. */
export function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const n = normalize(value)
  if (TRUE_WORDS.has(n)) return true
  if (FALSE_WORDS.has(n)) return false
  return null
}

/** Palabras que suelen escribirse sin acento en nombres de columnas. */
const ACENTOS: Record<string, string> = {
  telefono: 'teléfono',
  direccion: 'dirección',
  codigo: 'código',
  numero: 'número',
  razon: 'razón',
  categoria: 'categoría',
  region: 'región',
  ubicacion: 'ubicación',
  informacion: 'información',
  poblacion: 'población',
  descripcion: 'descripción',
  observacion: 'observación',
  credito: 'crédito',
  dias: 'días',
  ultima: 'última',
  ultimo: 'último',
  limite: 'límite',
  genero: 'género',
  electronico: 'electrónico',
  calificacion: 'calificación',
  ejecucion: 'ejecución',
  promocion: 'promoción',
  exhibicion: 'exhibición',
  pais: 'país',
  cp: 'CP',
  rfc: 'RFC',
  id: 'ID',
}

/** Convierte "nombre_comercial" → "Nombre comercial" (y restaura acentos comunes: "telefono" → "Teléfono"). */
export function humanize(column: string): string {
  if (ETIQUETAS[column]) return ETIQUETAS[column]
  const spaced = column
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
    .split(' ')
    .map((w) => ACENTOS[w] ?? w)
    .join(' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const STOPWORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'a', 'en', 'sa', 'cv'])

export function initials(name: string): string {
  const all = name
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(' ')
    .filter(Boolean)
  const meaningful = all.filter((w) => !STOPWORDS.has(w.toLowerCase()))
  const words = meaningful.length ? meaningful : all
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** Tono estable (0-359) a partir de un texto, para avatares de colores. */
export function hueFrom(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360
  return h
}

const dateTimeFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })
const numberFormat = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/

/** Formatea cualquier valor de una celda para mostrarlo. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (typeof value === 'number') return numberFormat.format(value)
  if (Array.isArray(value)) return value.map(formatValue).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  const text = String(value)
  if (ISO_DATE.test(text)) {
    const date = new Date(text.length === 10 ? `${text}T12:00:00` : text)
    if (!Number.isNaN(date.getTime())) {
      return text.length === 10 ? dateFormat.format(date) : dateTimeFormat.format(date)
    }
  }
  return text
}

export function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string' || value.trim() === '') return false
  return Number.isFinite(Number(value))
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
