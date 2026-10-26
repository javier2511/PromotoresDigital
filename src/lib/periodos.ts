/** Periodos del tablero: todo, un día, una semana (lunes a domingo) o un mes. Fechas locales "YYYY-MM-DD". */
export type Periodo = 'total' | 'dia' | 'semana' | 'mes'

export interface Rango {
  periodo: Periodo
  /** Primer día (incluido). */
  desde: string
  /** Día siguiente al último (no incluido). */
  hasta: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM-DD" de una fecha, en hora local. */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Hoy, "YYYY-MM-DD" en hora local. */
export const hoyLocal = () => isoLocal(new Date())

/** Fecha local de "YYYY-MM-DD", a mediodía (así ningún cambio de horario la mueve de día). */
export function deIso(fecha: string): Date {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function sumarDias(fecha: string, dias: number): string {
  const d = deIso(fecha)
  d.setDate(d.getDate() + dias)
  return isoLocal(d)
}

/** Límites de "total": abarcan cualquier fecha. */
export const SIN_LIMITE = { desde: '0001-01-01', hasta: '9999-12-31' }

/** Todo, o el día, la semana (de lunes a domingo) o el mes que contiene a `ancla`. */
export function rangoDe(periodo: Periodo, ancla: string): Rango {
  if (periodo === 'total') return { periodo, ...SIN_LIMITE }
  if (periodo === 'dia') return { periodo, desde: ancla, hasta: sumarDias(ancla, 1) }
  const d = deIso(ancla)
  if (periodo === 'semana') {
    const lunes = sumarDias(ancla, -((d.getDay() + 6) % 7))
    return { periodo, desde: lunes, hasta: sumarDias(lunes, 7) }
  }
  return {
    periodo,
    desde: isoLocal(new Date(d.getFullYear(), d.getMonth(), 1, 12)),
    hasta: isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)),
  }
}

/** Mueve la fecha de referencia un periodo hacia atrás (-1) o adelante (+1). */
export function moverPeriodo(periodo: Periodo, ancla: string, pasos: number): string {
  if (periodo === 'total') return ancla
  if (periodo === 'dia') return sumarDias(ancla, pasos)
  if (periodo === 'semana') return sumarDias(ancla, 7 * pasos)
  // Mismo día del mes, sin pasarse del último (31 de marzo → 30 de abril).
  const d = deIso(ancla)
  const destino = new Date(d.getFullYear(), d.getMonth() + pasos, 1, 12)
  const ultimo = new Date(destino.getFullYear(), destino.getMonth() + 1, 0, 12).getDate()
  destino.setDate(Math.min(d.getDate(), ultimo))
  return isoLocal(destino)
}

/** Días del rango, en orden. */
export function diasDelRango(r: Pick<Rango, 'desde' | 'hasta'>): string[] {
  const dias: string[] = []
  for (let f = r.desde; f < r.hasta; f = sumarDias(f, 1)) dias.push(f)
  return dias
}

/** Número de semana ISO (la semana 1 es la del primer jueves del año). */
export function semanaIso(fecha: string): number {
  const d = deIso(fecha)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const semana1 = new Date(d.getFullYear(), 0, 4, 12)
  return 1 + Math.round(((d.getTime() - semana1.getTime()) / 86400000 - 3 + ((semana1.getDay() + 6) % 7)) / 7)
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** "19 oct". */
export function diaMes(fecha: string): string {
  const d = deIso(fecha)
  return `${d.getDate()} ${MESES[d.getMonth()]}`
}

/** "lunes 20 de octubre" (con el año si no es el actual). */
export function fechaLarga(fecha: string, hoy: string): string {
  const d = deIso(fecha)
  const anio = fecha.slice(0, 4) !== hoy.slice(0, 4) ? ` de ${d.getFullYear()}` : ''
  return `${DIAS_LARGOS[d.getDay()]} ${d.getDate()} de ${MESES_LARGOS[d.getMonth()]}${anio}`
}

/** El periodo en dos partes: { titulo: "19 – 25 oct", detalle: "Semana 43" }; detalle "Hoy"/"Ayer" en un día. */
export function partesPeriodo(r: Rango, hoy: string): { titulo: string; detalle: string | null } {
  if (r.periodo === 'total') return { titulo: 'Todas las visitas', detalle: null }
  const d = deIso(r.desde)
  const anio = r.desde.slice(0, 4) !== hoy.slice(0, 4) ? ` ${d.getFullYear()}` : ''
  if (r.periodo === 'dia') {
    const detalle = r.desde === hoy ? 'Hoy' : r.desde === sumarDias(hoy, -1) ? 'Ayer' : null
    return { titulo: `${DIAS_CORTOS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}${anio}`, detalle }
  }
  if (r.periodo === 'semana') {
    const fin = deIso(sumarDias(r.hasta, -1))
    const inicio = d.getMonth() === fin.getMonth() ? `${d.getDate()}` : `${d.getDate()} ${MESES[d.getMonth()]}`
    return { titulo: `${inicio} – ${fin.getDate()} ${MESES[fin.getMonth()]}${anio}`, detalle: `Semana ${semanaIso(r.desde)}` }
  }
  const mes = MESES_LARGOS[d.getMonth()]
  return { titulo: `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${d.getFullYear()}`, detalle: null }
}

/** Texto del periodo en una línea: "Hoy", "Sáb 24 oct", "Semana 43 · 19 – 25 oct", "Octubre 2026". */
export function etiquetaPeriodo(r: Rango, hoy: string): string {
  const { titulo, detalle } = partesPeriodo(r, hoy)
  if (r.periodo === 'dia') return detalle ?? titulo
  return detalle ? `${detalle} · ${titulo}` : titulo
}
