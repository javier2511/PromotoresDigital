/** Formatos de números del Tablero (es-MX). */

const entero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })
const unDecimal = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const formatoEntero = (n: number) => entero.format(n)

/** "9.5" (siempre un decimal); "—" si no hay dato. */
export const formatoDecimal = (n: number | null) => (n === null ? '—' : unDecimal.format(n))

const dosDecimales = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Minutos con dos decimales, como en el reporte: "9.01"; "—" si no hay dato. */
export const formatoMinutos = (minutos: number | null) => (minutos === null ? '—' : dosDecimales.format(minutos))

/** Metros enteros: "11", "1,693"; "—" si no hay dato. */
export const formatoMetros = (metros: number | null) => (metros === null ? '—' : entero.format(Math.round(metros)))

const fechaHora = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})

/** "19/10/2026 07:19:27 p.m."; "—" si no hay dato. */
export const formatoFechaHora = (ms: number | null) => (ms === null ? '—' : fechaHora.format(ms).replace(',', ''))

/** Porcentaje entero (0 si el total es 0). */
export const porcentaje = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0)

export const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1)

/** Marcas del eje de una gráfica: pasos de 1, 2 o 5 (×10ⁿ), unas tres, en números enteros. */
export function escalaEje(max: number): { tope: number; marcas: number[] } {
  const crudo = Math.max(max, 1) / 3
  const potencia = 10 ** Math.floor(Math.log10(crudo))
  const paso = Math.max(1, [1, 2, 5, 10].map((m) => m * potencia).find((p) => p >= crudo) ?? 1)
  const tope = Math.max(paso, Math.ceil(max / paso) * paso)
  const marcas: number[] = []
  for (let m = 0; m <= tope; m += paso) marcas.push(m)
  return { tope, marcas }
}
