import { useState } from 'react'
import type { Barra } from '../../data/tablero'
import { capitalizar, escalaEje, porcentaje } from '../../lib/formato'
import { deIso, diaMes, DIAS_CORTOS, fechaLarga, partesPeriodo, rangoDe, semanaIso, sumarDias, type Rango } from '../../lib/periodos'
import { Card } from '../ui/Card'
import { cn } from '../ui/cn'
import { EncabezadoTablero } from './Encabezado'

function Columna({ barra, tope }: { barra: Barra; tope: number }) {
  const sinCompra = barra.visitas - barra.conCompra
  const ambas = sinCompra > 0 && barra.conCompra > 0
  // Los dos tramos se separan con 2px del color del fondo (1px se le quita a cada uno).
  const alto = (n: number) => `max(2px, calc(${(n / tope) * 100}% - ${ambas ? 1 : 0}px))`
  return (
    <div className="flex h-full w-[min(24px,70%)] flex-col justify-end gap-[2px]">
      {sinCompra > 0 && <div className="w-full rounded-t-[4px] bg-viz-resto" style={{ height: alto(sinCompra) }} />}
      {barra.conCompra > 0 && (
        <div className={cn('w-full bg-viz-compra', !ambas && 'rounded-t-[4px]')} style={{ height: alto(barra.conCompra) }} />
      )}
    </div>
  )
}

/** Visitas por día, por hora (un día) o por semana (el total de muchos días): con compra en verde, sin compra en gris. */
export function GraficaVisitas({ barras, rango, hoy }: { barras: Barra[]; rango: Rango; hoy: string }) {
  const [seleccion, setSeleccion] = useState<number | null>(null)
  const [verTabla, setVerTabla] = useState(false)
  const tipo = barras[0]?.tipo ?? (rango.periodo === 'dia' ? 'hora' : 'dia')
  const porHora = tipo === 'hora'
  const porSemana = tipo === 'semana'
  // En "total" puede haber muchas barras: solo algunas llevan su fecha abajo.
  const cada = rango.periodo === 'total' ? Math.max(1, Math.ceil(barras.length / 8)) : 1
  const { tope, marcas } = escalaEje(Math.max(0, ...barras.map((b) => b.visitas)))
  const columnas = { gridTemplateColumns: `repeat(${barras.length}, minmax(0, 1fr))` }
  const total = barras.reduce((s, b) => s + b.visitas, 0)
  const totalCompra = barras.reduce((s, b) => s + b.conCompra, 0)
  const actual = seleccion !== null ? barras[seleccion] : null

  const titulo = (b: Barra) =>
    porHora
      ? `De ${b.clave}:00 a ${Number(b.clave) + 1}:00`
      : porSemana
        ? `Semana ${semanaIso(b.clave)} · ${partesPeriodo(rangoDe('semana', b.clave), hoy).titulo}`
        : capitalizar(fechaLarga(b.clave, hoy))
  const etiqueta = (b: Barra, i: number) => {
    if (porHora) return Number(b.clave) % 2 === 0 ? b.clave : ''
    if (rango.periodo === 'total') return i % cada === 0 ? diaMes(b.clave) : ''
    const d = deIso(b.clave)
    if (rango.periodo === 'semana') return `${DIAS_CORTOS[d.getDay()]} ${d.getDate()}`
    return d.getDate() === 1 || d.getDate() % 5 === 0 ? String(d.getDate()) : ''
  }
  const esHoy = (b: Barra) => (porSemana ? b.clave <= hoy && hoy < sumarDias(b.clave, 7) : !porHora && b.clave === hoy)
  const resumen = (visitas: number, conCompra: number) =>
    `${visitas} ${visitas === 1 ? 'visita' : 'visitas'} · ${conCompra} con compra (${porcentaje(conCompra, visitas)}%)`

  return (
    <Card className="overflow-hidden">
      <EncabezadoTablero
        accion={
          <button
            type="button"
            onClick={() => setVerTabla((v) => !v)}
            className="h-8 shrink-0 rounded-lg px-2 text-sm font-semibold text-white/90 hover:bg-white/10"
          >
            {verTabla ? 'Ver gráfica' : 'Ver tabla'}
          </button>
        }
      >
        {porHora ? 'Visitas por hora' : porSemana ? 'Visitas por semana' : 'Visitas por día'}
      </EncabezadoTablero>
      <div className="p-4 pt-3">
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-viz-compra" /> Con compra
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-viz-resto" /> Sin compra
          </span>
        </div>

        {verTabla ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-soft text-xs font-semibold text-fg">
                <tr className="border-b border-line">
                  <th className="py-2.5 pr-3 pl-2 text-left">{porHora ? 'Hora' : porSemana ? 'Semana' : 'Día'}</th>
                  <th className="px-3 py-2.5 text-right">Visitas</th>
                  <th className="px-3 py-2.5 text-right">Con compra</th>
                  <th className="py-2.5 pr-2 pl-3 text-right">% con compra</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {barras
                  .filter((b) => !b.futuro)
                  .map((b) => (
                    <tr key={b.clave} className="border-b border-line last:border-0">
                      <td className="py-2 pr-3 pl-2">{titulo(b)}</td>
                      <td className="px-3 py-2 text-right">{b.visitas}</td>
                      <td className="px-3 py-2 text-right">{b.conCompra}</td>
                      <td className="py-2 pr-2 pl-3 text-right">{b.visitas ? `${porcentaje(b.conCompra, b.visitas)}%` : '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {/* Lo que señalas en la gráfica (o el total del periodo). */}
            <div className="mt-3 flex min-h-6 items-start justify-between gap-3 text-sm">
              <p aria-live="polite">
                <span className="font-semibold">{actual ? titulo(actual) : 'Total'}</span>
                <span className="text-muted">
                  {' '}
                  · {actual ? resumen(actual.visitas, actual.conCompra) : resumen(total, totalCompra)}
                </span>
              </p>
              {actual && (
                <button
                  type="button"
                  onClick={() => setSeleccion(null)}
                  className="shrink-0 font-semibold text-brand-600 hover:underline dark:text-brand-300"
                >
                  Ver total
                </button>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <div className="relative h-40 w-7 shrink-0 text-right text-[11px] text-muted tabular-nums" aria-hidden>
                {marcas.map((m) => (
                  <span key={m} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(m / tope) * 100}%` }}>
                    {m}
                  </span>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="relative h-40"
                  onPointerLeave={(e) => {
                    if (e.pointerType === 'mouse') setSeleccion(null)
                  }}
                >
                  {marcas.map((m) => (
                    <div key={m} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(m / tope) * 100}%` }} />
                  ))}
                  <div className="absolute inset-0 grid" style={columnas}>
                    {barras.map((b, i) => (
                      <button
                        key={b.clave}
                        type="button"
                        disabled={b.futuro}
                        aria-label={`${titulo(b)}: ${resumen(b.visitas, b.conCompra)}`}
                        aria-pressed={seleccion === i}
                        onPointerEnter={(e) => {
                          if (e.pointerType === 'mouse') setSeleccion(i)
                        }}
                        onFocus={() => setSeleccion(i)}
                        onClick={() => setSeleccion(i)}
                        className={cn(
                          'relative flex h-full flex-col items-center justify-end rounded-md transition-opacity focus-visible:bg-soft',
                          seleccion !== null && seleccion !== i && 'opacity-40',
                        )}
                      >
                        <Columna barra={b} tope={tope} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-1.5 grid text-center text-[11px] leading-tight text-muted tabular-nums" style={columnas} aria-hidden>
                  {barras.map((b, i) => (
                    <span key={b.clave} className={cn('whitespace-nowrap', esHoy(b) && 'font-bold text-fg', b.futuro && 'opacity-50')}>
                      {etiqueta(b, i)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
