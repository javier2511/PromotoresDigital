import { CalendarDays, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import type { OpcionRegion } from '../../data/alcance'
import { diaMes, etiquetaPeriodo, moverPeriodo, partesPeriodo, rangoDe, type Periodo } from '../../lib/periodos'
import { cn } from '../ui/cn'
import { SegmentedControl } from '../ui/SegmentedControl'
import type { usePeriodo } from './usePeriodo'

/** Fila de chips: en el teléfono se desliza de lado; en pantallas grandes se acomoda en varias líneas. */
export const FILA_CHIPS = '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0'

export function Chip({ activo, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { activo: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition disabled:cursor-default disabled:opacity-40',
        activo ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-fg hover:bg-soft disabled:hover:bg-card',
        className,
      )}
      {...props}
    >
      {activo && <Check className="size-4" strokeWidth={2.5} />}
      {children}
    </button>
  )
}

const alternar = <T,>(lista: T[], x: T) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x])

/** Filtro de región del admin: una o varias (vacío: todas). No aparece si nadie tiene región. */
export function FiltroRegion({
  opciones,
  elegidas,
  onElegir,
}: {
  opciones: OpcionRegion[]
  elegidas: string[]
  onElegir: (regiones: string[]) => void
}) {
  if (opciones.length === 0) return null
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Región</p>
      <div className={FILA_CHIPS} role="group" aria-label="Región">
        <Chip activo={elegidas.length === 0} onClick={() => onElegir([])}>
          Todas
        </Chip>
        {opciones.map((o) => (
          <Chip key={o.clave || '__sin__'} activo={elegidas.includes(o.clave)} onClick={() => onElegir(alternar(elegidas, o.clave))}>
            {o.nombre}
          </Chip>
        ))}
      </div>
    </div>
  )
}

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'total', label: 'Total' },
  { value: 'mes', label: 'Mes' },
  { value: 'semana', label: 'Semana' },
  { value: 'rango', label: 'Rango' },
]

/** Total, Mes, Semana o Rango, con las flechas y la fecha (mes y semana) o las fechas desde–hasta (rango). */
export function SelectorPeriodo({
  p,
  hoy,
  primerDia,
  todo = 'Todas las visitas',
}: {
  p: ReturnType<typeof usePeriodo>
  hoy: string
  primerDia: string | null
  /** Texto de "Total". */
  todo?: string
}) {
  const { periodo, ancla, rango } = p
  const siguiente = moverPeriodo(periodo, ancla, 1)
  const hayFuturo = rangoDe(periodo, siguiente).desde <= hoy
  const esActual = rango.desde <= hoy && hoy < rango.hasta
  const periodoTexto = partesPeriodo(rango, hoy)

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <SegmentedControl
        label="Periodo"
        value={periodo}
        onChange={(v) => p.cambiarPeriodo(v, primerDia)}
        options={PERIODOS}
        className="sm:w-96"
      />
      {periodo === 'rango' ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {(
            [
              ['Desde', p.desde, p.cambiarDesde, undefined, hoy],
              ['Hasta', p.hasta, p.cambiarHasta, p.desde, hoy],
            ] as const
          ).map(([etiqueta, valor, cambiar, min, max]) => (
            <label
              key={etiqueta}
              className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15 sm:max-w-52"
            >
              <span className="shrink-0 text-xs font-semibold text-muted">{etiqueta}</span>
              <input
                type="date"
                value={valor}
                min={min}
                max={max}
                onChange={(e) => e.target.value && cambiar(e.target.value)}
                aria-label={etiqueta}
                className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-fg outline-none"
              />
            </label>
          ))}
        </div>
      ) : periodo === 'total' ? (
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 sm:max-w-72">
          <CalendarDays className="size-4 shrink-0 text-muted" />
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="truncate text-[15px] font-semibold">{todo}</span>
            {primerDia && <span className="text-[11px] font-medium text-muted">Desde el {diaMes(primerDia)}</span>}
          </span>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            onClick={() => p.irA(moverPeriodo(periodo, ancla, -1))}
            aria-label="Periodo anterior"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg hover:bg-soft"
          >
            <ChevronLeft className="size-5" />
          </button>
          <label
            title={etiquetaPeriodo(rango, hoy)}
            className="relative flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 hover:bg-soft sm:max-w-72"
          >
            <CalendarDays className="size-4 shrink-0 text-muted" />
            <span className="flex min-w-0 flex-col items-start leading-tight">
              {periodoTexto.detalle && <span className="text-[11px] font-medium text-muted">{periodoTexto.detalle}</span>}
              <span className="truncate text-[15px] font-semibold">{periodoTexto.titulo}</span>
            </span>
            <input
              type="date"
              value={ancla}
              max={hoy}
              onChange={(e) => e.target.value && p.irA(e.target.value)}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker()
                } catch {
                  /* el navegador abre su selector */
                }
              }}
              aria-label="Elegir fecha"
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <button
            type="button"
            onClick={() => p.irA(siguiente)}
            disabled={!hayFuturo}
            aria-label="Periodo siguiente"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg hover:bg-soft disabled:opacity-40 disabled:hover:bg-card"
          >
            <ChevronRight className="size-5" />
          </button>
          {!esActual && (
            <button
              type="button"
              onClick={() => p.irA(hoy)}
              className="h-11 shrink-0 rounded-xl border border-line bg-card px-4 text-sm font-semibold hover:bg-soft"
            >
              Hoy
            </button>
          )}
        </div>
      )}
    </div>
  )
}
