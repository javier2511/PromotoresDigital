import type { AnswerValue, Answers, Question } from './questions'
import { isNumeric, normalize, toBoolean } from './text'

export type Operator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'answered'
  | 'empty'

export interface Rule {
  /** Pregunta que se muestra u oculta. */
  target: string
  /** Pregunta cuya respuesta se evalúa. */
  source: string
  operator: Operator
  value: string
  action: 'show' | 'hide'
}

const OPERATORS: [Operator, string[]][] = [
  ['eq', ['=', '==', '===', 'eq', 'igual', 'igual a', 'es', 'es igual a', 'equals', 'equal']],
  ['neq', ['!=', '<>', '!==', 'neq', 'ne', 'distinto', 'distinto de', 'diferente', 'diferente de', 'no es', 'no igual', 'not equal']],
  ['gt', ['>', 'gt', 'mayor', 'mayor que', 'mayor a']],
  ['gte', ['>=', '=>', 'gte', 'mayor o igual', 'mayor o igual que', 'mayor o igual a']],
  ['lt', ['<', 'lt', 'menor', 'menor que', 'menor a']],
  ['lte', ['<=', '=<', 'lte', 'menor o igual', 'menor o igual que', 'menor o igual a']],
  ['contains', ['contiene', 'contains', 'incluye', 'like', 'ilike']],
  ['not_contains', ['no contiene', 'not contains', 'no incluye', 'not like']],
  ['in', ['in', 'en', 'alguno de', 'cualquiera de', 'uno de', 'entre']],
  ['answered', ['respondida', 'respondido', 'contestada', 'contestado', 'answered', 'not null', 'is not null', 'no vacio', 'no vacia', 'tiene valor', 'con respuesta']],
  ['empty', ['vacia', 'vacio', 'empty', 'null', 'is null', 'sin respuesta', 'no respondida']],
]

/** Valores que significan "cualquier respuesta" (p. ej. valor_activador = "*"). */
const CUALQUIERA = new Set(['*', '%', 'cualquiera', 'cualquier', 'any', 'todas', 'todos'])

export function esCualquiera(value: unknown): boolean {
  return CUALQUIERA.has(normalize(value))
}

export function parseOperator(raw: unknown): Operator {
  const n = normalize(raw)
  if (!n) return 'eq'
  for (const [op, words] of OPERATORS) if (words.includes(n)) return op
  return 'eq'
}

export function parseAction(raw: unknown): 'show' | 'hide' {
  if (typeof raw === 'boolean') return raw ? 'show' : 'hide'
  const n = normalize(raw)
  if (/ocultar|esconder|hide|omitir|deshabilitar|no mostrar/.test(n)) return 'hide'
  if (n === 'false' || n === 'no' || n === '0') return 'hide'
  return 'show'
}

function equals(answer: string, expected: string): boolean {
  const a = normalize(answer)
  const b = normalize(expected)
  if (a === b) return true
  const ab = toBoolean(a)
  const bb = toBoolean(b)
  if (ab !== null && bb !== null) return ab === bb
  if (isNumeric(a) && isNumeric(b)) return Number(a) === Number(b)
  return false
}

function splitList(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

/** ¿La respuesta cumple la condición de la regla? */
export function ruleMatches(rule: Rule, answer: AnswerValue | undefined): boolean {
  const values = (answer === undefined ? [] : Array.isArray(answer) ? answer : [answer]).filter(
    (v) => normalize(v) !== '',
  )
  switch (rule.operator) {
    case 'answered':
      return values.length > 0
    case 'empty':
      return values.length === 0
    case 'eq':
      return values.some((v) => equals(v, rule.value))
    case 'neq':
      return values.length > 0 && !values.some((v) => equals(v, rule.value))
    case 'in': {
      const expected = splitList(rule.value)
      return values.some((v) => expected.some((e) => equals(v, e)))
    }
    case 'contains':
      return values.some((v) => normalize(v).includes(normalize(rule.value)))
    case 'not_contains':
      return values.length > 0 && !values.some((v) => normalize(v).includes(normalize(rule.value)))
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const expected = Number(normalize(rule.value).replace(',', '.'))
      if (!Number.isFinite(expected)) return false
      return values.some((v) => {
        const n = Number(normalize(v).replace(',', '.'))
        if (!Number.isFinite(n)) return false
        if (rule.operator === 'gt') return n > expected
        if (rule.operator === 'gte') return n >= expected
        if (rule.operator === 'lt') return n < expected
        return n <= expected
      })
    }
  }
}

/**
 * Calcula qué preguntas se ven con las respuestas actuales.
 *
 * - Una pregunta sin reglas "mostrar" siempre se ve.
 * - Con reglas "mostrar": se ve si se cumple CUALQUIERA de ellas (como un flujo: a la pregunta 8 se puede
 *   llegar desde la 4 = "Si", desde la 5 respondida, etc.).
 * - Si se cumple alguna regla "ocultar", no se ve.
 * - La respuesta de una pregunta oculta cuenta como vacía (las reglas se encadenan).
 */
export function visibleQuestions(questions: Question[], rules: Rule[], answers: Answers): Set<string> {
  const keys = new Set(questions.map((q) => q.key))
  const byTarget = new Map<string, Rule[]>()
  for (const rule of rules) {
    if (!keys.has(rule.target) || rule.target === rule.source) continue
    const list = byTarget.get(rule.target) ?? []
    list.push(rule)
    byTarget.set(rule.target, list)
  }

  const visible = new Map<string, boolean>()
  const answerOf = (key: string): AnswerValue | undefined =>
    visible.get(key) === false ? undefined : answers[key]

  const evaluate = (q: Question): boolean => {
    const own = byTarget.get(q.key)
    if (!own) return true
    const hide = own.filter((r) => r.action === 'hide')
    if (hide.some((r) => ruleMatches(r, answerOf(r.source)))) return false
    const show = own.filter((r) => r.action === 'show')
    if (show.length === 0) return true
    return show.some((r) => ruleMatches(r, answerOf(r.source)))
  }

  // Se evalúa en orden; se repite por si alguna regla apunta a una pregunta posterior.
  for (let pass = 0; pass < 10; pass++) {
    let changed = false
    for (const q of questions) {
      const v = evaluate(q)
      if (visible.get(q.key) !== v) {
        visible.set(q.key, v)
        changed = true
      }
    }
    if (!changed) break
  }

  return new Set(questions.filter((q) => visible.get(q.key) !== false).map((q) => q.key))
}

const OPERADOR_TEXTO: Record<Operator, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  contains: 'contiene',
  not_contains: 'no contiene',
  in: 'es uno de',
  answered: 'está respondida',
  empty: 'está vacía',
}

/** "Se muestra «P3 …» si «P1 …» = «Sí»", para revisar las reglas en Verificar conexión. */
export function describirRegla(rule: Rule, pregunta: (key: string) => string): string {
  const condicion =
    rule.operator === 'answered' || rule.operator === 'empty'
      ? `${pregunta(rule.source)} ${OPERADOR_TEXTO[rule.operator]}`
      : `${pregunta(rule.source)} ${OPERADOR_TEXTO[rule.operator]} «${rule.value}»`
  return `${rule.action === 'show' ? 'Se muestra' : 'Se oculta'} ${pregunta(rule.target)} si ${condicion}`
}
