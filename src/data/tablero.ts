import { RADIO_VISITA_M } from '../config/app'
import {
  MAX_DURACION_VISITA_MIN,
  MAX_TIEMPO_ENTRE_VISITAS_MIN,
  schema,
  type ResultadoField,
  type VisitaField,
} from '../config/schema'
import { claveColumna } from '../lib/info-cliente'
import { diasDelRango, isoLocal, rangoDe, sumarDias, type Rango } from '../lib/periodos'
import { isMissingColumnError, pickColumns, type ResolvedTable, type SchemaContext } from '../lib/schema-resolver'
import { supabase, type Row } from '../lib/supabase'
import { esVacio, toBoolean } from '../lib/text'
import { fetchAll } from './clientes'

/** Una visita de resultados_visitas (minutos y distancia de sus columnas, o calculados con su fila en visitas). */
export interface VisitaTablero {
  key: string
  promotor: string | null
  cliente: string | null
  nombreCliente: string | null
  /** Fecha y hora de la visita, en milisegundos (de fecha_visita, como en el reporte). */
  momento: number | null
  /** Día local "YYYY-MM-DD" (null si no tiene ninguna fecha). */
  dia: string | null
  /** Hora local 0-23 (para el día: visitas por hora). */
  hora: number | null
  conCompra: boolean
  /** Milisegundos (null si no se conoce). */
  inicio: number | null
  fin: number | null
  /** Minutos que duró (null si no se conoce o, calculada, no es creíble: ver MAX_DURACION_VISITA_MIN). */
  duracion: number | null
  /** Metros al cliente al hacer check-in. */
  distancia: number | null
  /**
   * Minutos a la siguiente visita, de la columna de resultados_visitas. undefined si la tabla no la tiene
   * (entonces se calculan con las horas de las visitas).
   */
  minutosNueva?: number | null
}

export interface PromotorTablero {
  id: string
  nombre: string
}

/** Columna de resultados_visitas de donde sale cada dato (null: no la tiene). */
export interface FuentesTablero {
  compra: string | null
  minutosVisita: string | null
  minutosNuevaVisita: string | null
  distancia: string | null
}

export interface DatosTablero {
  rango: Rango
  visitas: VisitaTablero[]
  promotores: PromotorTablero[]
  /** Visitas a las que les faltan tiempos o distancia porque no se encontraron en la tabla visitas. */
  sinDetalle: number
  /** ¿Hay forma de saber los tiempos y la distancia (columnas propias o id_visita para buscarlos en visitas)? */
  conVisita: boolean
  fuentes: FuentesTablero
}

/**
 * Milisegundos de una fecha como la devuelve Supabase. Sin zona horaria ("2026-10-14T12:30:00", columnas
 * timestamp sin zona) se toma como hora local. null si no es una fecha.
 */
export function instante(valor: unknown): number | null {
  if (esVacio(valor) || typeof valor === 'boolean') return null
  const texto = String(valor).trim().replace(' ', 'T')
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (soloFecha) return new Date(+soloFecha[1], +soloFecha[2] - 1, +soloFecha[3]).getTime()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(texto)) return null
  const t = Date.parse(
    texto
      // Microsegundos de Postgres: JavaScript solo entiende milisegundos.
      .replace(/(\.\d{3})\d+/, '$1')
      // "+00" → "+00:00"
      .replace(/([+-]\d{2})$/, '$1:00'),
  )
  return Number.isFinite(t) ? t : null
}

const numero = (v: unknown): number | null => {
  if (esVacio(v) || typeof v === 'boolean') return null
  const n = Number(typeof v === 'string' ? v.trim().replace(',', '.') : v)
  return Number.isFinite(n) ? n : null
}

/**
 * Minutos de una columna: número (en segundos u horas si así lo dice su nombre) o "HH:MM:SS" (time / interval).
 * null si está vacío o es negativo.
 */
export function minutosDe(valor: unknown, columna: string): number | null {
  const hms = typeof valor === 'string' ? /^(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/.exec(valor.trim()) : null
  let minutos: number | null
  if (hms) minutos = Number(hms[1]) * 60 + Number(hms[2]) + (hms[3] ? Number(hms[3]) / 60 : 0)
  else {
    const n = numero(valor)
    const nombre = claveColumna(columna)
    minutos = n === null ? null : /seg/.test(nombre) ? n / 60 : /hora|hrs$/.test(nombre) ? n * 60 : n
  }
  return minutos !== null && minutos >= 0 ? minutos : null
}

/** Metros de una columna (en kilómetros si así lo dice su nombre). null si está vacío o es negativo. */
export function metrosDe(valor: unknown, columna: string): number | null {
  const n = numero(valor)
  if (n === null || n < 0) return null
  return /km|kilometro/.test(claveColumna(columna)) ? n * 1000 : n
}

/**
 * Si los minutos o la distancia tienen otro nombre en resultados_visitas, se busca una columna que tenga todas
 * las palabras de algún grupo (sin importar mayúsculas, acentos ni guiones) y ninguna de `sin`.
 */
const PALABRAS_TABLERO: { campo: ResultadoField; grupos: string[][]; sin?: string[] }[] = [
  { campo: 'indicador', grupos: [['digital', 'post'], ['autogestion'], ['compra']], sin: ['tiempo', 'minuto', 'distancia', 'fecha'] },
  { campo: 'minutosNuevaVisita', grupos: [['nueva', 'visita'], ['entre', 'visita'], ['siguiente', 'visita'], ['traslado']] },
  {
    campo: 'minutosVisita',
    grupos: [['tiempo', 'visita'], ['minutos', 'visita'], ['duracion']],
    sin: ['nueva', 'entre', 'siguiente', 'traslado', 'compra'],
  },
  { campo: 'distancia', grupos: [['distancia'], ['geoeficiencia']] },
]

/** Columnas de resultados_visitas para el tablero, a partir de las que trae la tabla. */
export function columnasResultados(claves: string[]): Partial<Record<ResultadoField, string>> {
  const c = pickColumns(schema.resultados.fields, claves)
  const usadas = new Set<string>(Object.values(c))
  for (const { campo, grupos, sin = [] } of PALABRAS_TABLERO) {
    if (c[campo]) continue
    for (const grupo of grupos) {
      const columna = claves.find((k) => {
        const clave = claveColumna(k)
        return !usadas.has(k) && grupo.every((p) => clave.includes(p)) && !sin.some((p) => clave.includes(p))
      })
      if (columna) {
        c[campo] = columna
        usadas.add(columna)
        break
      }
    }
  }
  return c
}

/** Columnas de resultados y visitas que usa el tablero. */
export interface ColumnasTablero {
  r: Partial<Record<ResultadoField, string>>
  v: Partial<Record<Extract<VisitaField, 'id' | 'usuario' | 'inicio' | 'fin' | 'finHora' | 'registro' | 'duracion'>, string>>
  /** Columnas de distancia de visitas, en orden de preferencia (p. ej. distancia_checkin_m, distancia_checkin). */
  distancia: string[]
}

/** De varias filas de la misma visita queda la más reciente (por fecha de actualización y luego por id). */
function masReciente(a: Row, b: Row, c: ColumnasTablero['r']): Row {
  const fa = c.actualizado ? (instante(a[c.actualizado]) ?? -Infinity) : -Infinity
  const fb = c.actualizado ? (instante(b[c.actualizado]) ?? -Infinity) : -Infinity
  if (fa !== fb) return fb > fa ? b : a
  if (!c.id) return b
  const ia = numero(a[c.id])
  const ib = numero(b[c.id])
  if (ia !== null && ib !== null) return ib > ia ? b : a
  return String(b[c.id] ?? '') > String(a[c.id] ?? '') ? b : a
}

/** Une cada visita de resultados_visitas (una por visita) con su fila de visitas. */
export function construirVisitas(resultados: Row[], visitas: Row[], c: ColumnasTablero): VisitaTablero[] {
  const porVisita = new Map<string, Row>()
  resultados.forEach((row, i) => {
    const id = c.r.visita ? row[c.r.visita] : null
    const key = esVacio(id) ? `#${i}` : String(id)
    const previa = porVisita.get(key)
    porVisita.set(key, previa ? masReciente(previa, row, c.r) : row)
  })
  const detalle = new Map<string, Row>()
  if (c.v.id) for (const v of visitas) detalle.set(String(v[c.v.id]), v)

  return [...porVisita].map(([key, r]): VisitaTablero => {
    const v = detalle.get(key)
    const valor = (col: string | undefined) => (v && col ? v[col] : null)
    const promotorR = c.r.usuario ? r[c.r.usuario] : null
    const promotorV = valor(c.v.usuario)
    const promotor = !esVacio(promotorR) ? String(promotorR).trim() : !esVacio(promotorV) ? String(promotorV).trim() : null

    const inicio = instante(valor(c.v.inicio))
    // hora_fin (con zona) es la más exacta; fecha_fin (sin zona) guarda la hora local.
    const fin = instante(valor(c.v.finHora)) ?? instante(valor(c.v.fin))
    let duracion: number | null
    if (c.r.minutosVisita) {
      // Ya viene en resultados_visitas: tal cual.
      duracion = minutosDe(r[c.r.minutosVisita], c.r.minutosVisita)
    } else {
      duracion = numero(valor(c.v.duracion))
      if (duracion === null && inicio !== null && fin !== null) duracion = (fin - inicio) / 60000
      if (duracion !== null && (duracion <= 0 || duracion > MAX_DURACION_VISITA_MIN)) duracion = null
    }

    // Día y hora de la visita: fecha_visita de resultados_visitas, como en el reporte. Si la fila no la tiene,
    // la de visitas: la hora de inicio si la visita tiene fin (la app nueva guarda ambas con zona horaria);
    // si no, cuándo se guardó la fila (FlutterFlow guardaba hora_inicio sin zona, desfasada).
    const momento =
      (c.r.fecha ? instante(r[c.r.fecha]) : null) ??
      (inicio !== null && fin !== null ? inicio : (instante(valor(c.v.registro)) ?? inicio))
    const fecha = momento !== null ? new Date(momento) : null
    const texto = (col: string | undefined) => (col && !esVacio(r[col]) ? String(r[col]).trim() : null)

    let distancia: number | null = null
    if (c.r.distancia) distancia = metrosDe(r[c.r.distancia], c.r.distancia)
    else {
      for (const col of c.distancia) {
        distancia = metrosDe(valor(col), col)
        if (distancia !== null) break
      }
    }

    return {
      key,
      promotor,
      cliente: texto(c.r.cliente),
      nombreCliente: texto(c.r.nombreCliente),
      momento,
      dia: fecha ? isoLocal(fecha) : null,
      hora: fecha ? fecha.getHours() : null,
      conCompra: c.r.indicador ? toBoolean(r[c.r.indicador]) === true : false,
      inicio,
      fin,
      duracion,
      distancia,
      minutosNueva: c.r.minutosNuevaVisita ? minutosDe(r[c.r.minutosNuevaVisita], c.r.minutosNuevaVisita) : undefined,
    }
  })
}

export interface Promedio {
  /** null si no hay datos. */
  valor: number | null
  /** Cuántos datos se promediaron. */
  n: number
}

const promedio = (valores: number[]): Promedio => ({
  valor: valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null,
  n: valores.length,
})

export interface Indicadores {
  /** Visitas distintas. */
  visitas: number
  /** Visitas con compra autogestionada (digital_post_visita = true). */
  conCompra: number
  /** Días con al menos una visita. */
  dias: number
  /** Promotores con al menos una visita. */
  promotores: number
  /** visitas / días / promotores */
  diarias: number | null
  /** visitas con compra / días / promotores */
  diariasConCompra: number | null
  /** Minutos promedio de visita. */
  tiempoVisita: Promedio
  tiempoVisitaConCompra: Promedio
  /**
   * Minutos promedio a la siguiente visita: de la columna de resultados_visitas o, si no la tiene, de que termina
   * una visita a que empieza la siguiente (mismo promotor, mismo día).
   */
  tiempoNuevaVisita: Promedio
  /** Metros promedio al cliente en el check-in. */
  distancia: Promedio
  /** Check-ins a RADIO_VISITA_M metros o menos. */
  dentroRadio: number
}

/** Minutos entre el fin de cada visita y el inicio de la siguiente del mismo promotor el mismo día. */
export function tiemposEntreVisitas(visitas: VisitaTablero[]): number[] {
  const grupos = new Map<string, VisitaTablero[]>()
  for (const v of visitas) {
    if (!v.promotor || !v.dia || v.inicio === null) continue
    const key = `${v.promotor}|${v.dia}`
    const lista = grupos.get(key)
    if (lista) lista.push(v)
    else grupos.set(key, [v])
  }
  const huecos: number[] = []
  for (const lista of grupos.values()) {
    lista.sort((a, b) => a.inicio! - b.inicio!)
    for (let i = 1; i < lista.length; i++) {
      const anterior = lista[i - 1]
      if (anterior.fin === null) continue
      const minutos = (lista[i].inicio! - anterior.fin) / 60000
      if (minutos >= 0 && minutos <= MAX_TIEMPO_ENTRE_VISITAS_MIN) huecos.push(minutos)
    }
  }
  return huecos
}

export function calcularIndicadores(visitas: VisitaTablero[], radio = RADIO_VISITA_M): Indicadores {
  const conCompra = visitas.filter((v) => v.conCompra)
  const dias = new Set(visitas.map((v) => v.dia).filter(Boolean)).size
  const conocidos = new Set(visitas.map((v) => v.promotor).filter(Boolean)).size
  // Si ninguna visita dice quién la hizo, cuenta como un promotor.
  const promotores = conocidos || (visitas.length ? 1 : 0)
  const porFigura = (n: number) => (dias && promotores ? n / dias / promotores : null)
  const duraciones = (lista: VisitaTablero[]) => lista.map((v) => v.duracion).filter((d): d is number => d !== null)
  const distancias = visitas.map((v) => v.distancia).filter((d): d is number => d !== null)
  const columnaNueva = visitas.some((v) => v.minutosNueva !== undefined)
  const nuevas = columnaNueva
    ? visitas.map((v) => v.minutosNueva).filter((m): m is number => typeof m === 'number')
    : tiemposEntreVisitas(visitas)
  return {
    visitas: visitas.length,
    conCompra: conCompra.length,
    dias,
    promotores,
    diarias: porFigura(visitas.length),
    diariasConCompra: porFigura(conCompra.length),
    tiempoVisita: promedio(duraciones(visitas)),
    tiempoVisitaConCompra: promedio(duraciones(conCompra)),
    tiempoNuevaVisita: promedio(nuevas),
    distancia: promedio(distancias),
    dentroRadio: distancias.filter((d) => d <= radio).length,
  }
}

export interface FilaPromotor {
  id: string | null
  nombre: string
  indicadores: Indicadores
}

/** Indicadores de cada promotor que tiene visitas (los nombres salen de la tabla de promotores). */
export function porPromotor(visitas: VisitaTablero[], promotores: PromotorTablero[]): FilaPromotor[] {
  const nombres = new Map(promotores.map((p) => [p.id, p.nombre]))
  const grupos = new Map<string | null, VisitaTablero[]>()
  for (const v of visitas) {
    const lista = grupos.get(v.promotor)
    if (lista) lista.push(v)
    else grupos.set(v.promotor, [v])
  }
  return [...grupos]
    .map(([id, lista]) => ({
      id,
      nombre: id === null ? 'Sin promotor' : (nombres.get(id) ?? id),
      indicadores: calcularIndicadores(lista),
    }))
    .sort((a, b) => b.indicadores.visitas - a.indicadores.visitas || a.nombre.localeCompare(b.nombre, 'es'))
}

export interface Barra {
  /** La hora ("9"), el día ("2026-10-19") o el lunes de la semana. */
  clave: string
  tipo: 'hora' | 'dia' | 'semana'
  /** Visitas y visitas con compra en esa hora, día o semana. */
  visitas: number
  conCompra: number
  /** Día que todavía no llega (se dibuja vacío). */
  futuro: boolean
}

/** En "total", hasta este número de días se agrupa por día; con más, por semana. */
const MAX_DIAS_POR_DIA = 35

/** Visitas por día (semana o mes; o solo los días elegidos), por hora (un día) o, en total, por día o semana. */
export function porBarra(
  visitas: VisitaTablero[],
  rango: Rango,
  { ahora = new Date(), soloDias = [] }: { ahora?: Date; soloDias?: string[] } = {},
): Barra[] {
  const hoy = isoLocal(ahora)
  const contar = (clave: string, tipo: Barra['tipo'], lista: VisitaTablero[], futuro = false): Barra => ({
    clave,
    tipo,
    visitas: lista.length,
    conCompra: lista.filter((v) => v.conCompra).length,
    futuro,
  })
  if (rango.periodo === 'total') {
    // Del primer día con visitas hasta hoy (o hasta la última visita, si es después).
    const dias = visitas.map((v) => v.dia).filter((d): d is string => d !== null).sort()
    if (dias.length === 0) return []
    const fin = dias[dias.length - 1] > hoy ? dias[dias.length - 1] : hoy
    const todos = diasDelRango({ desde: dias[0], hasta: sumarDias(fin, 1) })
    if (todos.length <= MAX_DIAS_POR_DIA) return todos.map((dia) => contar(dia, 'dia', visitas.filter((v) => v.dia === dia)))
    const semanas: Barra[] = []
    for (let lunes = rangoDe('semana', dias[0]).desde; lunes <= fin; lunes = sumarDias(lunes, 7)) {
      const hasta = sumarDias(lunes, 7)
      semanas.push(contar(lunes, 'semana', visitas.filter((v) => v.dia !== null && v.dia >= lunes && v.dia < hasta)))
    }
    return semanas
  }
  if (rango.periodo === 'dia') {
    const horas = visitas.map((v) => v.hora).filter((h): h is number => h !== null)
    // De 8:00 a 19:00, más lo que haya antes o después.
    const desde = Math.min(8, ...horas)
    const hasta = Math.max(19, ...horas)
    const barras: Barra[] = []
    for (let h = desde; h <= hasta; h++) {
      const futuro = rango.desde > hoy || (rango.desde === hoy && h > ahora.getHours())
      barras.push(contar(String(h), 'hora', visitas.filter((v) => v.hora === h), futuro))
    }
    return barras
  }
  return (soloDias.length ? [...soloDias].sort() : diasDelRango(rango)).map((dia) =>
    contar(dia, 'dia', visitas.filter((v) => v.dia === dia), dia > hoy),
  )
}

/** Primera columna que parece llave (id, id_resultado…): para paginar en orden estable. */
export function columnaLlave(t: Pick<ResolvedTable, 'allColumns'> & { columns: { id?: string } }): string | undefined {
  return t.columns.id ?? t.allColumns?.find((c) => /^id($|_)/i.test(c))
}

const TAMANO_GRUPO = 200
const EN_PARALELO = 4

/** Ejecuta las tareas de a `n` a la vez, conservando el orden de los resultados. */
async function enParalelo<T>(tareas: (() => Promise<T>)[], n = EN_PARALELO): Promise<T[]> {
  const out: T[] = new Array(tareas.length)
  let siguiente = 0
  await Promise.all(
    Array.from({ length: Math.min(n, tareas.length) }, async () => {
      while (siguiente < tareas.length) {
        const i = siguiente++
        out[i] = await tareas[i]()
      }
    }),
  )
  return out
}

/**
 * Datos del tablero para el rango: resultados_visitas (con un día de margen por las zonas horarias), los
 * promotores (nombres) y, solo si resultados_visitas no trae los minutos o la distancia, sus filas de visitas.
 */
export async function fetchTablero(ctx: SchemaContext, rango: Rango): Promise<DatosTablero> {
  const tr = ctx.tables.resultados
  const tv = ctx.tables.visitas
  const tp = ctx.tables.perfiles
  if (!tr.table) throw new Error('No se encontró la tabla resultados_visitas.')
  const cv = tv.columns
  const tablaR = tr.table
  const llave = columnaLlave(tr)
  const fechaR = tr.columns.fecha

  const leerResultados = (conFecha: boolean) =>
    fetchAll(() => {
      let q = supabase.from(tablaR).select('*', { count: 'exact' })
      // En "total" se leen todas; si no, el periodo con un día de margen.
      if (conFecha && fechaR && rango.periodo !== 'total') {
        q = q.gte(fechaR, sumarDias(rango.desde, -1)).lt(fechaR, sumarDias(rango.hasta, 1))
      }
      return llave ? q.order(llave, { ascending: true }) : q
    })
  const [resultados, promotores] = await Promise.all([
    leerResultados(true).catch((error: unknown) => {
      // La columna de fecha se supuso y no existe: se leen todas.
      if (error && typeof error === 'object' && isMissingColumnError(error as { code: string; message: string })) {
        return leerResultados(false)
      }
      throw error
    }),
    // Solo para los nombres: si no se pueden leer, se muestra el id.
    tp.table && tp.columns.id ? leerPromotores(ctx).catch(() => []) : Promise.resolve([]),
  ])

  // Las columnas se leen de las filas que llegaron (la tabla pudo cambiar desde que se detectó).
  const claves = resultados.length ? Object.keys(resultados[0]) : (tr.allColumns ?? [])
  const cr = claves.length ? columnasResultados(claves) : tr.columns
  // ¿Faltan minutos o distancia en resultados_visitas? Entonces se calculan con la tabla visitas.
  const calcular = !cr.minutosVisita || !cr.minutosNuevaVisita || !cr.distancia

  const distancia = calcular
    ? [...new Set([cv.distancia, ...(tv.allColumns ?? []).filter((c) => /distancia/i.test(c))].filter((c): c is string => Boolean(c)))]
    : []
  const columnas: ColumnasTablero = {
    r: cr,
    v: {
      id: cv.id,
      usuario: cv.usuario,
      inicio: cv.inicio,
      fin: cv.fin,
      finHora: cv.finHora,
      registro: cv.registro,
      duracion: calcular ? cv.duracion : undefined,
    },
    distancia,
  }

  // Solo si faltan minutos o distancia: filas de visitas de esos resultados, por id en grupos.
  const ids = cr.visita
    ? [...new Set(resultados.map((r) => r[cr.visita!]).filter((v) => !esVacio(v)).map(String))]
    : []
  let visitas: Row[] = []
  if (calcular && tv.table && cv.id && ids.length) {
    const tablaV = tv.table
    const campos = [...new Set([...Object.values(columnas.v), ...distancia].filter((c): c is string => Boolean(c)))]
    const seleccion = tv.verified ? campos.join(',') : '*'
    const grupos: string[][] = []
    for (let i = 0; i < ids.length; i += TAMANO_GRUPO) grupos.push(ids.slice(i, i + TAMANO_GRUPO))
    const leer = async (sel: string) =>
      (
        await enParalelo(
          grupos.map((grupo) => async () => {
            const { data, error } = await supabase.from(tablaV).select(sel).in(cv.id!, grupo)
            if (error) throw error
            return (data ?? []) as unknown as Row[]
          }),
        )
      ).flat()
    visitas = await leer(seleccion)
      .catch((error: unknown) => {
        if (seleccion !== '*' && error && typeof error === 'object' && isMissingColumnError(error as { code: string; message: string })) {
          return leer('*')
        }
        throw error
      })
      .catch(() => [])
  }

  const encontradas = new Set(cv.id ? visitas.map((v) => String(v[cv.id!])) : [])
  return {
    rango,
    visitas: construirVisitas(resultados, visitas, columnas),
    promotores,
    sinDetalle: calcular ? ids.filter((id) => !encontradas.has(id)).length : 0,
    conVisita: !calcular || Boolean(cr.visita),
    fuentes: {
      compra: cr.indicador ?? null,
      minutosVisita: cr.minutosVisita ?? null,
      minutosNuevaVisita: cr.minutosNuevaVisita ?? null,
      distancia: cr.distancia ?? null,
    },
  }
}

async function leerPromotores(ctx: SchemaContext): Promise<PromotorTablero[]> {
  const t = ctx.tables.perfiles
  const c = t.columns
  const filas = await fetchAll(() => supabase.from(t.table!).select('*', { count: 'exact' }).order(c.id!, { ascending: true }))
  return filas.map((row) => {
    const nombre = c.nombre && !esVacio(row[c.nombre]) ? String(row[c.nombre]).trim() : null
    const correo = c.email && !esVacio(row[c.email]) ? String(row[c.email]).trim() : null
    return { id: String(row[c.id!]), nombre: nombre ?? correo ?? String(row[c.id!]) }
  })
}

/** La tabla respuestas tal cual (solo las filas de las visitas pedidas). */
export interface RespuestasTablero {
  filas: Row[]
  /** Columnas en el orden de la tabla. */
  columnas: string[]
  /** Columna que liga cada respuesta con su visita (id_visita). */
  visita: string
  /** Llave de la tabla (id_respuesta): ordena las respuestas de una visita como se guardaron. */
  llave: string | null
  /** Columnas de texto (la pregunta y la respuesta), que pueden ocupar varias líneas. */
  pregunta: string | null
  respuesta: string | null
}

const TAMANO_GRUPO_RESPUESTAS = 50

/** Filas de respuestas de esas visitas (una visita tiene varias: se pide por grupos y paginado). */
export async function fetchRespuestasTablero(ctx: SchemaContext, ids: string[]): Promise<RespuestasTablero | null> {
  const t = ctx.tables.respuestas
  const c = t.columns
  if (!t.table || !c.visita) return null
  const tabla = t.table
  const llave = columnaLlave(t) ?? null
  const grupos: string[][] = []
  for (let i = 0; i < ids.length; i += TAMANO_GRUPO_RESPUESTAS) grupos.push(ids.slice(i, i + TAMANO_GRUPO_RESPUESTAS))
  const filas = (
    await enParalelo(
      grupos.map((grupo) => () =>
        fetchAll(() => {
          const q = supabase.from(tabla).select('*', { count: 'exact' }).in(c.visita!, grupo)
          return llave ? q.order(llave, { ascending: true }) : q
        }),
      ),
    )
  ).flat()
  return {
    filas,
    columnas: filas.length ? Object.keys(filas[0]) : (t.allColumns ?? []),
    visita: c.visita,
    llave,
    pregunta: c.preguntaTexto ?? null,
    respuesta: c.respuesta ?? null,
  }
}
