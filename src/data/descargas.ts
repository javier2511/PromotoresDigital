import { supabase, type Row } from '../lib/supabase'

const PAGINA = 1000
const EN_PARALELO = 4

/**
 * Todas las filas de una tabla, en orden estable por `orden` (la llave). Avisa el avance con `onAvance`.
 * Las páginas se piden de a varias a la vez; su tamaño es el que entregó Supabase en la primera
 * (si el servidor limita a menos filas, así no quedan huecos).
 */
export async function leerTablaCompleta(
  tabla: string,
  orden: string | undefined,
  onAvance?: (leidas: number, total: number | null) => void,
): Promise<Row[]> {
  const consulta = (conConteo: boolean) => {
    const q = supabase.from(tabla).select('*', conConteo ? { count: 'exact' } : undefined)
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
