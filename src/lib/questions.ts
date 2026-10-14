import { normalize, toBoolean } from './text'

export type QuestionType = 'yesno' | 'single' | 'multi' | 'number' | 'date' | 'longtext' | 'text'

export interface Question {
  /** Id tal como viene de la base de datos (número o uuid). */
  id: string | number
  /** Id como texto, para usar como llave. */
  key: string
  text: string
  help: string | null
  type: QuestionType
  options: string[]
  required: boolean
  order: number
}

/** Respuesta en el formulario: texto, o lista de textos para opción múltiple. */
export type AnswerValue = string | string[]
export type Answers = Record<string, AnswerValue>

/** Si la tabla de preguntas no tiene columna "obligatoria", todas las preguntas visibles son obligatorias. */
export const OBLIGATORIAS_POR_DEFECTO = true

/** Interpreta un literal de arreglo de Postgres: {a,"b c",d}. */
function parsePgArray(text: string): string[] {
  const inner = text.slice(1, -1)
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === '"') quoted = !quoted
    else if (ch === '\\' && i + 1 < inner.length) current += inner[++i]
    else if (ch === ',' && !quoted) {
      out.push(current)
      current = ''
    } else current += ch
  }
  out.push(current)
  return out
}

/** Convierte la columna de opciones (arreglo, JSON o texto separado) en una lista. */
export function parseOptions(raw: unknown): string[] {
  if (raw === null || raw === undefined) return []
  let list: unknown[]
  if (Array.isArray(raw)) {
    list = raw
  } else if (typeof raw === 'object') {
    const values = Object.values(raw as Record<string, unknown>)
    list = values.length === 1 && Array.isArray(values[0]) ? values[0] : values
  } else {
    const text = String(raw).trim()
    if (!text) return []
    if (text.startsWith('[')) {
      try {
        return parseOptions(JSON.parse(text))
      } catch {
        /* sigue como texto */
      }
    }
    if (text.startsWith('{') && text.endsWith('}')) {
      list = parsePgArray(text)
    } else if (/\r?\n|;|\|/.test(text)) {
      list = text.split(/\r?\n|;|\|/)
    } else {
      list = text.split(',')
    }
  }
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of list) {
    const label =
      item && typeof item === 'object'
        ? String(
            (item as Record<string, unknown>).label ??
              (item as Record<string, unknown>).texto ??
              (item as Record<string, unknown>).valor ??
              (item as Record<string, unknown>).value ??
              '',
          ).trim()
        : String(item ?? '').trim()
    if (label && !seen.has(normalize(label))) {
      seen.add(normalize(label))
      result.push(label)
    }
  }
  return result
}

function isYesNoOptions(options: string[]): boolean {
  if (options.length !== 2) return false
  const values = options.map((o) => toBoolean(o))
  return values.includes(true) && values.includes(false)
}

/** Deduce el tipo de control a partir de la columna "tipo" y de las opciones. */
export function parseQuestionType(raw: unknown, options: string[]): QuestionType {
  const n = normalize(raw)
  if (n) {
    if (/multiple|multi|varias|checkbox|casillas/.test(n)) return 'multi'
    if (/\bsi[\s/_-]?no\b|boolean|bool|verdadero|switch|check/.test(n)) return 'yesno'
    if (/opcion|seleccion|select|lista|radio|unica|dropdown|desplegable|combo/.test(n)) {
      return isYesNoOptions(options) ? 'yesno' : 'single'
    }
    if (/numer|entero|decimal|cantidad|number|\bint\b|integer|float|precio|monto|porcentaje/.test(n)) return 'number'
    if (/fecha|date/.test(n)) return 'date'
    if (/largo|larga|parrafo|textarea|comentario|observacion/.test(n)) return 'longtext'
    if (/texto|text|abierta|string|corta/.test(n)) return options.length > 0 ? 'single' : 'text'
  }
  if (options.length > 0) return isYesNoOptions(options) ? 'yesno' : 'single'
  return 'text'
}

/** Opciones a mostrar para una pregunta Sí/No (respeta las que cargaste, p. ej. "SI"/"NO"). */
export function yesNoOptions(question: Question): [string, string] {
  if (isYesNoOptions(question.options)) {
    const yes = question.options.find((o) => toBoolean(o) === true)!
    const no = question.options.find((o) => toBoolean(o) === false)!
    return [yes, no]
  }
  return ['Sí', 'No']
}

export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === undefined) return false
  if (Array.isArray(value)) return value.some((v) => v.trim() !== '')
  return value.trim() !== ''
}

/** Texto que se guarda en la base de datos. */
export function serializeAnswer(value: AnswerValue): string {
  return Array.isArray(value) ? value.filter((v) => v.trim() !== '').join(', ') : value.trim()
}
