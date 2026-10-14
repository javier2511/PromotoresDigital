import type { Row } from './supabase'
import { normalize } from './text'

/** Qué columna de la tabla de reglas es cada cosa. */
export interface ColumnasRegla {
  id?: string
  /** Pregunta que se muestra u oculta. */
  pregunta?: string
  /** Pregunta cuya respuesta se evalúa. */
  dependeDe?: string
  valor?: string
  operador?: string
  accion?: string
}

/** "id_preguntaCondicion" → ["id", "pregunta", "condicion"] */
function tokens(column: string): string[] {
  return normalize(column.replace(/([a-z])([A-Z])/g, '$1_$2'))
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Palabras que indican la pregunta que se MUESTRA (destino). */
const DESTINO = new Set([
  'destino', 'siguiente', 'mostrar', 'muestra', 'mostrada', 'hija', 'hijo', 'objetivo', 'dependiente',
  'condicional', 'target', 'habilita', 'habilitar', 'resultado', 'afectada', 'visible', 'next', 'child', 'show',
])
/** Palabras que indican la pregunta cuya respuesta se EVALÚA (origen). */
const ORIGEN = new Set([
  'padre', 'origen', 'depende', 'condicion', 'anterior', 'trigger', 'activadora', 'disparadora', 'base',
  'previa', 'referencia', 'evaluada', 'evaluar', 'fuente', 'source', 'parent', 'cuando', 'si',
])
const ES_VALOR = new Set(['respuesta', 'valor', 'opcion', 'answer', 'value', 'texto', 'descripcion', 'nombre'])
const ES_PREGUNTA = new Set(['pregunta', 'preguntas', 'question', 'preg', 'depende', 'padre', 'hija', 'hijo', 'destino', 'origen'])

/**
 * Completa la detección de columnas de la tabla de reglas mirando los nombres de TODAS sus columnas.
 * Sirve cuando las columnas no tienen los nombres esperados: p. ej. `pregunta_id` + `mostrar_pregunta`,
 * o `id_pregunta` + `id_pregunta_condicion`.
 */
export function inferirColumnasRegla(columnas: string[], detectadas: ColumnasRegla): ColumnasRegla {
  const out: ColumnasRegla = { ...detectadas }
  const idRegla = out.id ?? columnas.find((c) => normalize(c) === 'id')
  const usadas = () => new Set(Object.values(out).filter(Boolean))

  const preguntas = columnas.filter((c) => {
    if (c === idRegla) return false
    const t = tokens(c)
    return t.some((w) => ES_PREGUNTA.has(w)) && !t.some((w) => ES_VALOR.has(w))
  })

  if (!(out.pregunta && out.dependeDe && out.pregunta !== out.dependeDe) && preguntas.length >= 2) {
    const puntaje = (c: string) => {
      const t = tokens(c)
      return t.filter((w) => DESTINO.has(w)).length - t.filter((w) => ORIGEN.has(w)).length
    }
    const ordenadas = [...preguntas].sort((a, b) => puntaje(b) - puntaje(a))
    const destino = ordenadas[0]
    const origen = ordenadas[ordenadas.length - 1]
    if (puntaje(destino) !== puntaje(origen)) {
      out.pregunta = destino
      out.dependeDe = origen
    }
  }

  const libre = (c: string) => !usadas().has(c) && c !== idRegla
  if (!out.valor) {
    out.valor =
      columnas.find((c) => libre(c) && tokens(c).some((w) => ES_VALOR.has(w) && w !== 'texto') && !tokens(c).includes('id')) ??
      columnas.find((c) => libre(c) && tokens(c).some((w) => ES_VALOR.has(w) && w !== 'texto'))
  }
  if (!out.operador) {
    out.operador = columnas.find((c) => libre(c) && tokens(c).some((w) => ['operador', 'comparador', 'operacion', 'operator'].includes(w)))
  }
  if (!out.accion) {
    out.accion = columnas.find((c) => libre(c) && tokens(c).some((w) => ['accion', 'action', 'efecto'].includes(w)))
  }
  return out
}

/** Columnas de una pregunta por las que una regla podría referirse a ella, en orden de prioridad. */
const REFERENCIAS = ['id_pregunta', 'pregunta_id', 'numero', 'numero_pregunta', 'num', 'no', 'orden', 'codigo', 'clave', 'folio', 'consecutivo']

/**
 * Traduce lo que guarda una regla (id de la pregunta, otro id, su número/orden o incluso su texto)
 * a la llave de la pregunta en el formulario. Devuelve null si no corresponde a ninguna.
 */
export function indicePreguntas(
  filas: Row[],
  llaveDe: (fila: Row) => string,
  columnaId: string,
  columnaTexto?: string,
): (referencia: unknown) => string | null {
  const porColumna: Map<string, string>[] = []
  const agregar = (columna: string) => {
    const mapa = new Map<string, string>()
    for (const fila of filas) {
      const valor = fila[columna]
      if (valor !== null && valor !== undefined && valor !== '' && !mapa.has(String(valor).trim())) {
        mapa.set(String(valor).trim(), llaveDe(fila))
      }
    }
    porColumna.push(mapa)
  }
  agregar(columnaId)
  const existentes = new Set(filas.flatMap((f) => Object.keys(f)))
  for (const c of REFERENCIAS) {
    const real = [...existentes].find((e) => e.toLowerCase() === c && e !== columnaId)
    if (real) agregar(real)
  }
  const porTexto = new Map<string, string>()
  if (columnaTexto) {
    for (const fila of filas) {
      const texto = normalize(fila[columnaTexto])
      if (texto && !porTexto.has(texto)) porTexto.set(texto, llaveDe(fila))
    }
  }
  return (referencia) => {
    if (referencia === null || referencia === undefined) return null
    const texto = String(referencia).trim()
    if (!texto) return null
    for (const mapa of porColumna) {
      const llave = mapa.get(texto)
      if (llave !== undefined) return llave
    }
    return porTexto.get(normalize(texto)) ?? null
  }
}
