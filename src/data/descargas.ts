import { supabase, type Row } from '../lib/supabase'

const PAGINA = 1000
const EN_PARALELO = 4

/** Solo las filas con estos valores en la columna (p. ej. los promotores de la región de un líder). */
export interface FiltroDescarga {
  columna: string
  valores: string[]
}

const GRUPO_VALORES = 100

/**
 * Todas las filas de una tabla (o solo las del filtro), en orden estable por `orden` (la llave). Avisa el avance
 * con `onAvance`. Con filtro se pide por grupos de valores, para no exceder el largo de la URL.
 */
export async function leerTablaCompleta(
  tabla: string,
  orden: string | undefined,
  onAvance?: (leidas: number, total: number | null) => void,
  filtro?: FiltroDescarga,
): Promise<Row[]> {
  if (!filtro) return leerPaginas(tabla, orden, null, onAvance)
  const filas: Row[] = []
  for (let i = 0; i < filtro.valores.length; i += GRUPO_VALORES) {
    const grupo = { columna: filtro.columna, valores: filtro.valores.slice(i, i + GRUPO_VALORES) }
    const previas = filas.length
    filas.push(...(await leerPaginas(tabla, orden, grupo, (leidas) => onAvance?.(previas + leidas, null))))
  }
  return filas
}

/**
 * Las páginas se piden de a varias a la vez; su tamaño es el que entregó Supabase en la primera
 * (si el servidor limita a menos filas, así no quedan huecos).
 */
async function leerPaginas(
  tabla: string,
  orden: string | undefined,
  filtro: FiltroDescarga | null,
  onAvance?: (leidas: number, total: number | null) => void,
): Promise<Row[]> {
  const consulta = (conConteo: boolean) => {
    let q = supabase.from(tabla).select('*', conConteo ? { count: 'exact' } : undefined)
    if (filtro) q = q.in(filtro.columna, filtro.valores)
    return orden ? q.order(orden, { ascending: true }) : q
  }
  const primera = await consulta(true).range(0, PAGINA - 1)
  if (primera.error) throw primera.error
  const filas = (primera.data ?? []) as Row[]
  const total = typeof primera.count === 'number' ? primera.count : null
  const tamano = filas.length
  let leidas = filas.length
  onAvance?.(leidas, total)
  if (tamano === 0 || (total !== null && leidas >= total)) return filas

  if (total === null) {
    // Sin conteo: página por página hasta que llegue una incompleta.
    for (let desde = tamano; ; desde += tamano) {
      const { data, error } = await consulta(false).range(desde, desde + tamano - 1)
      if (error) throw error
      const pagina = (data ?? []) as Row[]
      filas.push(...pagina)
      onAvance?.(filas.length, null)
      if (pagina.length < tamano) return filas
    }
  }

  const desdes: number[] = []
  for (let desde = tamano; desde < total; desde += tamano) desdes.push(desde)
  const paginas: Row[][] = new Array(desdes.length)
  let siguiente = 0
  await Promise.all(
    Array.from({ length: Math.min(EN_PARALELO, desdes.length) }, async () => {
      while (siguiente < desdes.length) {
        const i = siguiente++
        const { data, error } = await consulta(false).range(desdes[i], desdes[i] + tamano - 1)
        if (error) throw error
        paginas[i] = (data ?? []) as Row[]
        leidas += paginas[i].length
        onAvance?.(leidas, total)
      }
    }),
  )
  return filas.concat(...paginas)
}
