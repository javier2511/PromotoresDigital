import { OBLIGATORIAS_POR_DEFECTO, parseOptions, parseQuestionType, type Question } from '../lib/questions'
import { parseAction, parseOperator, type Rule } from '../lib/rules'
import type { SchemaContext } from '../lib/schema-resolver'
import { supabase, type Row } from '../lib/supabase'
import { isNumeric, normalize, toBoolean } from '../lib/text'
import { fetchAll, SchemaError } from './clientes'

export interface Formulario {
  questions: Question[]
  rules: Rule[]
}

const INACTIVE = new Set(['inactiva', 'inactivo', 'deshabilitada', 'deshabilitado', 'baja', 'oculta', 'no'])

function isActive(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true
  const b = toBoolean(value)
  if (b !== null) return b
  return !INACTIVE.has(normalize(value))
}

function orderValue(value: unknown, fallback: number): number {
  return isNumeric(value) ? Number(value) : fallback
}

function toQuestion(row: Row, index: number, ctx: SchemaContext): Question {
  const c = ctx.tables.preguntas.columns
  const id = row[c.id!] as string | number
  const options = c.opciones ? parseOptions(row[c.opciones]) : []
  const required = c.obligatoria ? toBoolean(row[c.obligatoria]) : null
  const help = c.ayuda ? row[c.ayuda] : null
  return {
    id,
    key: String(id),
    text: String((c.texto ? row[c.texto] : null) ?? '').trim() || `Pregunta ${index + 1}`,
    help: typeof help === 'string' && help.trim() ? help.trim() : null,
    type: parseQuestionType(c.tipo ? row[c.tipo] : null, options),
    options,
    required: required ?? OBLIGATORIAS_POR_DEFECTO,
    order: orderValue(c.orden ? row[c.orden] : null, isNumeric(id) ? Number(id) : index),
  }
}

function toRule(row: Row, ctx: SchemaContext): Rule | null {
  const c = ctx.tables.reglas.columns
  const target = row[c.pregunta!]
  const source = row[c.dependeDe!]
  if (target === null || target === undefined || source === null || source === undefined) return null
  const rawValue = c.valor ? row[c.valor] : null
  const value = rawValue === null || rawValue === undefined ? '' : String(rawValue)
  let operator = parseOperator(c.operador ? row[c.operador] : null)
  // "Igual a" sin valor: basta con que la pregunta esté respondida.
  if (operator === 'eq' && value.trim() === '') operator = 'answered'
  return {
    target: String(target),
    source: String(source),
    operator,
    value,
    action: parseAction(c.accion ? row[c.accion] : null),
  }
}

export async function fetchFormulario(ctx: SchemaContext): Promise<Formulario> {
  const p = ctx.tables.preguntas
  if (!p.table) throw new SchemaError('No se encontró la tabla de preguntas en Supabase.')
  if (!p.columns.id) throw new SchemaError(`La tabla "${p.table}" no tiene una columna de id reconocible.`)

  const r = ctx.tables.reglas
  const reglasUsable = Boolean(r.table && r.columns.pregunta && r.columns.dependeDe)

  const [preguntaRows, reglaRows] = await Promise.all([
    fetchAll(() => supabase.from(p.table!).select('*', { count: 'exact' }).order(p.columns.id!, { ascending: true })),
    reglasUsable
      ? fetchAll(() => {
          const q = supabase.from(r.table!).select('*', { count: 'exact' })
          return r.columns.id ? q.order(r.columns.id, { ascending: true }) : q
        })
      : Promise.resolve([] as Row[]),
  ])

  const activeCol = p.columns.activa
  const questions = preguntaRows
    .filter((row) => (activeCol ? isActive(row[activeCol]) : true))
    .map((row, i) => toQuestion(row, i, ctx))
    .sort((a, b) => a.order - b.order)

  const rules = reglaRows.map((row) => toRule(row, ctx)).filter((rule): rule is Rule => rule !== null)
  return { questions, rules }
}
