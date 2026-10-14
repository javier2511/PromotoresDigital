import { normalize } from './text'

/** Días de la semana: 1 = lunes … 7 = domingo. */
export const DIAS = [
  { n: 1, corto: 'Lun', largo: 'Lunes' },
  { n: 2, corto: 'Mar', largo: 'Martes' },
  { n: 3, corto: 'Mié', largo: 'Miércoles' },
  { n: 4, corto: 'Jue', largo: 'Jueves' },
  { n: 5, corto: 'Vie', largo: 'Viernes' },
  { n: 6, corto: 'Sáb', largo: 'Sábado' },
  { n: 7, corto: 'Dom', largo: 'Domingo' },
] as const

const ALIAS: Record<string, number> = {
  lunes: 1, lun: 1, lu: 1, l: 1, monday: 1, mon: 1,
  martes: 2, mar: 2, ma: 2, tuesday: 2, tue: 2,
  miercoles: 3, mie: 3, mi: 3, x: 3, wednesday: 3, wed: 3,
  jueves: 4, jue: 4, ju: 4, j: 4, thursday: 4, thu: 4,
  viernes: 5, vie: 5, vi: 5, v: 5, friday: 5, fri: 5,
  sabado: 6, sab: 6, sa: 6, s: 6, saturday: 6, sat: 6,
  domingo: 7, dom: 7, do: 7, d: 7, sunday: 7, sun: 7,
}

const NOMBRES = /lunes|martes|miercoles|jueves|viernes|sabado|domingo/g
const ABREVIADOS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']

/**
 * Días que indica una celda de "día de visita": "Martes", "MARTES", "Mar", "2",
 * "Lunes, Jueves", "Lunes y Jueves", "L/J", y también pegados: "lunesmartes", "LUNMIE"…
 * (1 = lunes; 0 o 7 = domingo).
 */
export function diasDe(valor: unknown): number[] {
  if (valor === null || valor === undefined) return []
  const partes = Array.isArray(valor) ? valor.map(String) : [String(valor)]
  const dias = new Set<number>()
  for (const parte of partes) {
    for (const token of normalize(parte).split(/[\s,;/|+.-]+/)) {
      if (!token || token === 'y' || token === 'e') continue
      if (ALIAS[token]) dias.add(ALIAS[token])
      else if (/^[0-7]$/.test(token)) dias.add(Number(token) === 0 ? 7 : Number(token))
      else {
        // Nombres pegados: "lunesmartes", "lunesmiercolesviernes".
        const nombres = token.match(NOMBRES)
        if (nombres) for (const n of nombres) dias.add(ALIAS[n])
        // Abreviaturas pegadas: "lunmie".
        else if (token.length % 3 === 0) {
          const trozos = token.match(/.{3}/g) ?? []
          if (trozos.every((t) => ABREVIADOS.includes(t))) for (const t of trozos) dias.add(ALIAS[t])
        }
      }
    }
  }
  return [...dias].sort((a, b) => a - b)
}

/** Día de hoy (1 = lunes … 7 = domingo). */
export function diaHoy(fecha = new Date()): number {
  return fecha.getDay() === 0 ? 7 : fecha.getDay()
}
