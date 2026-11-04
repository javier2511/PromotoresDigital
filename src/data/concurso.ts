import { isoLocal } from '../lib/periodos'
import type { SchemaContext } from '../lib/schema-resolver'
import { supabase, type Row } from '../lib/supabase'
import { esVacio, toBoolean } from '../lib/text'
import { idsDe, porGrupos, type Alcance, type PromotorEquipo } from './alcance'
import { fetchAll } from './clientes'
import { columnaLlave, columnasResultados, instante, masReciente } from './tablero'

/** Una visita de resultados_visitas para el concurso: cuenta por su fecha de actualización, no por la de visita. */
export interface VisitaConcurso {
  key: string
  promotor: string | null
  cliente: string | null
  nombreCliente: string | null
  conCompra: boolean
  /** Fecha y hora de fecha_actualizacion, en milisegundos (null si la fila no la tiene). */
  actualizado: number | null
  /** Día local "YYYY-MM-DD" de la actualización: con él se filtra el periodo. */
  dia: string | null
  /** Fecha de la visita (solo se muestra). */
  fechaVisita: number | null
}

export interface DatosConcurso {
  visitas: VisitaConcurso[]
  promotores: PromotorEquipo[]
  /** Columna de la fecha de actualización (null: la tabla no la tiene). */
  columnaActualizado: string | null
}

/**
 * Todas las filas de resultados_visitas de los promotores del alcance, una por visita (la fila más reciente, como en
 * el Tablero). Se leen todas, sin filtrar por fecha: así cada visita cuenta una sola vez, en el día de su última
 * actualización.
 */
export async function fetchConcurso(ctx: SchemaContext, alcance: Alcance): Promise<DatosConcurso> {
  const t = ctx.tables.resultados
  if (!t.table) throw new Error('No se encontró la tabla resultados_visitas.')
  const tabla = t.table
  const usuario = t.columns.usuario
  const llave = columnaLlave(t)
  const ids = idsDe(alcance)
  const filas = await porGrupos(ids && !usuario ? [] : ids, (grupo) =>
    fetchAll(() => {
      let q = supabase.from(tabla).select('*', { count: 'exact' })
      if (grupo && usuario) q = q.in(usuario, grupo)
      return llave ? q.order(llave, { ascending: true }) : q
    }),
  )
  // Las columnas se leen de las filas que llegaron (la tabla pudo cambiar desde que se detectó).
  const claves = filas.length ? Object.keys(filas[0]) : (t.allColumns ?? [])
  const c = claves.length ? columnasResultados(claves) : t.columns

  const porVisita = new Map<string, Row>()
  filas.forEach((row, i) => {
    const id = c.visita ? row[c.visita] : null
    const key = esVacio(id) ? `#${i}` : String(id)
    const previa = porVisita.get(key)
    porVisita.set(key, previa ? masReciente(previa, row, c) : row)
  })
  const texto = (row: Row, col: string | undefined) => (col && !esVacio(row[col]) ? String(row[col]).trim() : null)
  const visitas = [...porVisita].map(([key, r]): VisitaConcurso => {
    const actualizado = c.actualizado ? instante(r[c.actualizado]) : null
    return {
      key,
      promotor: texto(r, c.usuario),
      cliente: texto(r, c.cliente),
      nombreCliente: texto(r, c.nombreCliente),
      conCompra: c.indicador ? toBoolean(r[c.indicador]) === true : false,
      actualizado,
      dia: actualizado !== null ? isoLocal(new Date(actualizado)) : null,
      fechaVisita: c.fecha ? instante(r[c.fecha]) : null,
    }
  })
  return { visitas, promotores: alcance.promotores, columnaActualizado: c.actualizado ?? null }
}

export interface FilaConcurso {
  /** Lugar en el ranking: los empates comparten lugar (1, 2, 2, 4). */
  lugar: number
  id: string | null
  nombre: string
  region: string | null
  conCompra: number
  visitas: number
}

/** Ranking por visitas con compra (más primero); en empate, por porcentaje y por nombre. */
export function rankingConcurso(visitas: VisitaConcurso[], promotores: PromotorEquipo[]): FilaConcurso[] {
  const info = new Map(promotores.map((p) => [p.id, p]))
  const grupos = new Map<string | null, { conCompra: number; visitas: number }>()
  for (const v of visitas) {
    const g = grupos.get(v.promotor) ?? { conCompra: 0, visitas: 0 }
    g.visitas++
    if (v.conCompra) g.conCompra++
    grupos.set(v.promotor, g)
  }
  const filas = [...grupos]
    .map(([id, g]) => ({
      id,
      nombre: id === null ? 'Sin promotor' : (info.get(id)?.nombre ?? id),
      region: id === null ? null : (info.get(id)?.region ?? null),
      ...g,
    }))
    .sort(
      (a, b) =>
        b.conCompra - a.conCompra || b.conCompra / b.visitas - a.conCompra / a.visitas || a.nombre.localeCompare(b.nombre, 'es'),
    )
  return filas.map((f) => ({ ...f, lugar: 1 + filas.filter((o) => o.conCompra > f.conCompra).length }))
}
