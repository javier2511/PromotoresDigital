import { OBLIGATORIAS_POR_DEFECTO, parseOptions, parseQuestionType, type Question } from '../lib/questions'
import { indicePreguntas, inferirColumnasRegla, type ColumnasRegla } from '../lib/reglas-columnas'
import { parseAction, parseOperator, type Rule } from '../lib/rules'
import type { SchemaContext } from '../lib/schema-resolver'
import { supabase, type Row } from '../lib/supabase'
import { isNumeric, normalize, toBoolean } from '../lib/text'
import { fetchAll, SchemaError } from './clientes'

export interface DiagnosticoReglas {
  /** Tabla de reglas encontrada (null si no hay). */
  tabla: string | null
  /** Columnas usadas para cada parte de la regla. */
  columnas: ColumnasRegla
  /** Filas leídas de la tabla de reglas. */
  leidas: number
  /** Reglas que se aplican al formulario. */
  aplicadas: number
  /** Ejemplos de filas que no se pudieron usar y por qué. */
  descartadas: string[]
}

export interface Formulario {
  questions: Question[]
  rules: Rule[]
  diagnostico: DiagnosticoReglas
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

function toRule(
  row: Row,
  c: ColumnasRegla,
  pregunta: (referencia: unknown) => string | null,
): Rule | string {
  const rawTarget = row[c.pregunta!]
  const rawSource = row[c.dependeDe!]
  if (rawTarget === null || rawTarget === undefined || rawSource === null || rawSource === undefined) {
    return 'le falta la pregunta o la pregunta de la que depende'
  }
  const target = pregunta(rawTarget)
  const source = pregunta(rawSource)
  if (!target) return `la pregunta "${String(rawTarget)}" no existe (o está inactiva)`
  if (!source) return `la pregunta "${String(rawSource)}" no existe (o está inactiva)`
  if (target === source) return 'la pregunta depende de sí misma'
  const rawValue = c.valor ? row[c.valor] : null
  const value = rawValue === null || rawValue === undefined ? '' : String(rawValue)
  let operator = parseOperator(c.operador ? row[c.operador] : null)
  // "Igual a" sin valor: basta con que la pregunta esté respondida.
  if (operator === 'eq' && value.trim() === '') operator = 'answered'
  return { target, source, operator, value, action: parseAction(c.accion ? row[c.accion] : null) }
}

export async function fetchFormulario(ctx: SchemaContext): Promise<Formulario> {
  const p = ctx.tables.preguntas
  if (!p.table) throw new SchemaError('No se encontró la tabla de preguntas en Supabase.')
  if (!p.columns.id) throw new SchemaError(`La tabla "${p.table}" no tiene una columna de id reconocible.`)

  const r = ctx.tables.reglas

  const [preguntaRows, reglaRows] = await Promise.all([
    fetchAll(() => supabase.from(p.table!).select('*', { count: 'exact' }).order(p.columns.id!, { ascending: true })),
    r.table
      ? fetchAll(() => {
          const q = supabase.from(r.table!).select('*', { count: 'exact' })
          return r.columns.id ? q.order(r.columns.id, { ascending: true }) : q
        })
      : Promise.resolve([] as Row[]),
  ])

  const activeCol = p.columns.activa
  const activeRows = preguntaRows.filter((row) => (activeCol ? isActive(row[activeCol]) : true))
  const questions = activeRows.map((row, i) => toQuestion(row, i, ctx)).sort((a, b) => a.order - b.order)

  // Columnas de la tabla de reglas: lo detectado por nombre, completado mirando todas sus columnas.
  const columnasReglas = [...new Set([...(r.allColumns ?? []), ...reglaRows.flatMap((row) => Object.keys(row))])]
  const c = inferirColumnasRegla(columnasReglas, r.columns)
  const pregunta = indicePreguntas(activeRows, (row) => String(row[p.columns.id!]), p.columns.id!, p.columns.texto)

  const rules: Rule[] = []
  const descartadas: string[] = []
  if (c.pregunta && c.dependeDe) {
    reglaRows.forEach((row, i) => {
      const rule = toRule(row, c, pregunta)
      if (typeof rule === 'string') {
        if (descartadas.length < 10) descartadas.push(`Fila ${i + 1}: ${rule}`)
      } else {
        rules.push(rule)
      }
    })
  } else if (reglaRows.length > 0) {
    descartadas.push('No se reconocieron las columnas de "pregunta" y "depende de" en la tabla de reglas.')
  }

  return {
    questions,
    rules,
    diagnostico: { tabla: r.table, columnas: c, leidas: reglaRows.length, aplicadas: rules.length, descartadas },
  }
}
