import { describe, expect, it } from 'vitest'
import type { Question } from './questions'
import { parseAction, parseOperator, ruleMatches, visibleQuestions, type Rule } from './rules'

const q = (key: string, order: number): Question => ({
  id: Number(key),
  key,
  text: `Pregunta ${key}`,
  help: null,
  type: 'text',
  options: [],
  required: true,
  order,
})

const rule = (target: string, source: string, value: string, extra: Partial<Rule> = {}): Rule => ({
  target,
  source,
  value,
  operator: 'eq',
  action: 'show',
  ...extra,
})

describe('parseOperator / parseAction', () => {
  it('reconoce operadores en español y símbolos', () => {
    expect(parseOperator('=')).toBe('eq')
    expect(parseOperator('Diferente de')).toBe('neq')
    expect(parseOperator('>=')).toBe('gte')
    expect(parseOperator('contiene')).toBe('contains')
    expect(parseOperator('respondida')).toBe('answered')
    expect(parseOperator(null)).toBe('eq')
    expect(parseOperator('algo raro')).toBe('eq')
  })
  it('reconoce acciones', () => {
    expect(parseAction('Mostrar')).toBe('show')
    expect(parseAction('ocultar')).toBe('hide')
    expect(parseAction(false)).toBe('hide')
    expect(parseAction(undefined)).toBe('show')
  })
})

describe('ruleMatches', () => {
  it('compara sin importar mayúsculas ni acentos, y entiende sí/no como booleano', () => {
    expect(ruleMatches(rule('2', '1', 'Sí'), 'si')).toBe(true)
    expect(ruleMatches(rule('2', '1', 'SI'), 'Sí')).toBe(true)
    expect(ruleMatches(rule('2', '1', 'true'), 'Sí')).toBe(true)
    expect(ruleMatches(rule('2', '1', 'No'), 'Sí')).toBe(false)
  })
  it('no cumple si la pregunta no se ha respondido', () => {
    expect(ruleMatches(rule('2', '1', 'Sí'), undefined)).toBe(false)
    expect(ruleMatches(rule('2', '1', 'Sí', { operator: 'neq' }), undefined)).toBe(false)
    expect(ruleMatches(rule('2', '1', '', { operator: 'empty' }), undefined)).toBe(true)
  })
  it('compara números', () => {
    expect(ruleMatches(rule('2', '1', '10', { operator: 'gt' }), '12')).toBe(true)
    expect(ruleMatches(rule('2', '1', '10', { operator: 'gt' }), '10')).toBe(false)
    expect(ruleMatches(rule('2', '1', '10', { operator: 'lte' }), '10')).toBe(true)
    expect(ruleMatches(rule('2', '1', '5.5', { operator: 'eq' }), '5.50')).toBe(true)
  })
  it('evalúa opción múltiple (arreglos)', () => {
    expect(ruleMatches(rule('2', '1', 'Coca-Cola'), ['Pepsi', 'Coca-Cola'])).toBe(true)
    expect(ruleMatches(rule('2', '1', 'A, B', { operator: 'in' }), 'b')).toBe(true)
    expect(ruleMatches(rule('2', '1', 'cola', { operator: 'contains' }), 'Coca-Cola')).toBe(true)
  })
})

describe('visibleQuestions', () => {
  const questions = [q('1', 1), q('2', 2), q('3', 3), q('4', 4)]

  it('muestra todas las preguntas sin reglas', () => {
    expect([...visibleQuestions(questions, [], {})]).toEqual(['1', '2', '3', '4'])
  })

  it('oculta la pregunta hasta que se cumple su regla', () => {
    const rules = [rule('2', '1', 'Sí')]
    expect(visibleQuestions(questions, rules, {}).has('2')).toBe(false)
    expect(visibleQuestions(questions, rules, { '1': 'No' }).has('2')).toBe(false)
    expect(visibleQuestions(questions, rules, { '1': 'Sí' }).has('2')).toBe(true)
  })

  it('encadena: si la pregunta de origen se oculta, su respuesta no cuenta', () => {
    const rules = [rule('2', '1', 'Sí'), rule('3', '2', 'Sí')]
    const all = { '1': 'Sí', '2': 'Sí' }
    expect(visibleQuestions(questions, rules, all).has('3')).toBe(true)
    // Cambia la 1 a "No": la 2 se oculta y por tanto la 3 también, aunque la 2 tenga respuesta guardada.
    const changed = visibleQuestions(questions, rules, { ...all, '1': 'No' })
    expect(changed.has('2')).toBe(false)
    expect(changed.has('3')).toBe(false)
  })

  it('varias reglas sobre la misma pregunta = cualquiera; sobre preguntas distintas = todas', () => {
    const orSame = [rule('3', '1', 'A'), rule('3', '1', 'B')]
    expect(visibleQuestions(questions, orSame, { '1': 'B' }).has('3')).toBe(true)
    const andDifferent = [rule('3', '1', 'A'), rule('3', '2', 'X')]
    expect(visibleQuestions(questions, andDifferent, { '1': 'A' }).has('3')).toBe(false)
    expect(visibleQuestions(questions, andDifferent, { '1': 'A', '2': 'X' }).has('3')).toBe(true)
  })

  it('reglas de ocultar', () => {
    const rules = [rule('4', '1', 'No', { action: 'hide' })]
    expect(visibleQuestions(questions, rules, {}).has('4')).toBe(true)
    expect(visibleQuestions(questions, rules, { '1': 'No' }).has('4')).toBe(false)
  })

  it('soporta reglas que apuntan a preguntas posteriores', () => {
    const rules = [rule('1', '4', 'Sí')]
    expect(visibleQuestions(questions, rules, { '4': 'Sí' }).has('1')).toBe(true)
    expect(visibleQuestions(questions, rules, { '4': 'No' }).has('1')).toBe(false)
  })

  it('ignora reglas hacia preguntas que no existen o hacia sí mismas', () => {
    const rules = [rule('99', '1', 'Sí'), rule('2', '2', 'Sí')]
    expect(visibleQuestions(questions, rules, {}).size).toBe(4)
  })
})
