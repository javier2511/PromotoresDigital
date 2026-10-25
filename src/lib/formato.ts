/** Formatos de números del Tablero (es-MX). */

const entero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })
const unDecimal = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const formatoEntero = (n: number) => entero.format(n)

/** "9.5" (siempre un decimal); "—" si no hay dato. */
export const formatoDecimal = (n: number | null) => (n === null ? '—' : unDecimal.format(n))

/** "12 min", "1 h 05 min"; "—" si no hay dato. */
export function formatoMinutos(minutos: number | null): string {
  if (minutos === null) return '—'
  const m = Math.round(minutos)
  if (m === 0) return minutos > 0 ? '<1 min' : '0 min'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

/** "35 m", "1.2 km"; "—" si no hay dato. */
export function formatoMetros(metros: number | null): string {
  if (metros === null) return '—'
  return metros < 1000 ? `${Math.round(metros)} m` : `${unDecimal.format(metros / 1000)} km`
}

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
