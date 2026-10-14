import { describe, expect, it } from 'vitest'
import { parseOptions, parseQuestionType, serializeAnswer, yesNoOptions, type Question } from './questions'

describe('parseOptions', () => {
  it('acepta arreglos, JSON, arreglos de Postgres y texto separado', () => {
    expect(parseOptions(['A', 'B'])).toEqual(['A', 'B'])
    expect(parseOptions('["A","B"]')).toEqual(['A', 'B'])
    expect(parseOptions('{A,"B C",D}')).toEqual(['A', 'B C', 'D'])
    expect(parseOptions('A, B ,C')).toEqual(['A', 'B', 'C'])
    expect(parseOptions('Sí, siempre; No')).toEqual(['Sí, siempre', 'No'])
    expect(parseOptions('A\nB\n')).toEqual(['A', 'B'])
    expect(parseOptions([{ label: 'X' }, { valor: 'Y' }])).toEqual(['X', 'Y'])
    expect(parseOptions(null)).toEqual([])
    expect(parseOptions('a, A, b')).toEqual(['a', 'b'])
  })
})

describe('parseQuestionType', () => {
  it('deduce el tipo desde la columna tipo', () => {
    expect(parseQuestionType('Si/No', [])).toBe('yesno')
    expect(parseQuestionType('si_no', [])).toBe('yesno')
    expect(parseQuestionType('booleano', [])).toBe('yesno')
    expect(parseQuestionType('Opción múltiple', ['a', 'b'])).toBe('multi')
    expect(parseQuestionType('checkbox', ['a', 'b'])).toBe('multi')
    expect(parseQuestionType('Selección', ['a', 'b'])).toBe('single')
    expect(parseQuestionType('lista', ['Sí', 'No'])).toBe('yesno')
    expect(parseQuestionType('Número', [])).toBe('number')
    expect(parseQuestionType('fecha', [])).toBe('date')
    expect(parseQuestionType('texto largo', [])).toBe('longtext')
    expect(parseQuestionType('texto', [])).toBe('text')
  })
  it('sin tipo, usa las opciones', () => {
    expect(parseQuestionType(null, [])).toBe('text')
    expect(parseQuestionType(null, ['SI', 'NO'])).toBe('yesno')
    expect(parseQuestionType('', ['Rojo', 'Azul'])).toBe('single')
  })
})

describe('respuestas', () => {
  it('respeta las etiquetas sí/no cargadas', () => {
    const question = { options: ['NO', 'SI'] } as Question
    expect(yesNoOptions(question)).toEqual(['SI', 'NO'])
    expect(yesNoOptions({ options: [] as string[] } as Question)).toEqual(['Sí', 'No'])
  })
  it('serializa opción múltiple como texto', () => {
    expect(serializeAnswer(['A', 'B'])).toBe('A, B')
    expect(serializeAnswer('  hola ')).toBe('hola')
  })
})
