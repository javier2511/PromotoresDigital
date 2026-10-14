import type { ReactNode } from 'react'
import type { Cliente } from '../data/clientes'
import { DIAS, diaHoy } from '../lib/dias'
import { SIN_DIA } from '../lib/filtro-dia'
import { cn } from './ui/cn'

/**
 * Chips "Todos · Lun · Mar…" según la columna dia_visita. No se muestra si ningún cliente tiene día.
 * `conteoDe`: clientes con los que se cuentan los números (p. ej. solo los pendientes).
 */
export function FiltroDias({
  clientes,
  conteoDe = clientes,
  dia,
  onChange,
  className,
}: {
  clientes: Pick<Cliente, 'dias'>[]
  conteoDe?: Pick<Cliente, 'dias'>[]
  dia: number | null
  onChange: (dia: number | null) => void
  className?: string
}) {
  const hoy = diaHoy()
  const conDia = new Set(clientes.flatMap((c) => c.dias))
  if (conDia.size === 0) return null
  const conteo = new Map<number, number>()
  for (const c of conteoDe) {
    // Un cliente con varios días ("lunesmartes") cuenta en cada uno de ellos.
    if (c.dias.length === 0) conteo.set(SIN_DIA, (conteo.get(SIN_DIA) ?? 0) + 1)
    for (const d of c.dias) conteo.set(d, (conteo.get(d) ?? 0) + 1)
  }
  const haySinDia = clientes.some((c) => c.dias.length === 0)

  const chip = (activo: boolean, onClick: () => void, contenido: ReactNode, ariaLabel: string, esHoy = false) => (
    <button
      type="button"
      aria-pressed={activo}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'relative flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition',
        activo
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm shadow-brand-600/25'
          : 'border-line bg-card text-fg hover:border-brand-300',
      )}
    >
      {contenido}
      {esHoy && !activo && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card bg-brand-500" />}
    </button>
  )

  return (
    <div
      role="group"
      aria-label="Filtrar por día de visita"
      className={cn('flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
    >
      {chip(dia === null, () => onChange(null), 'Todos los días', 'Todos los días')}
      {DIAS.filter((d) => conDia.has(d.n) || d.n === dia).map((d) => {
        const n = conteo.get(d.n) ?? 0
        const esHoy = d.n === hoy
        return (
          <span key={d.n} className="contents">
            {chip(
              dia === d.n,
              () => onChange(dia === d.n ? null : d.n),
              <>
                {esHoy ? `${d.corto} · Hoy` : d.corto}
                <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', dia === d.n ? 'bg-white/20' : 'bg-soft text-muted')}>
                  {n}
                </span>
              </>,
              `${d.largo}${esHoy ? ' (hoy)' : ''}: ${n} ${n === 1 ? 'cliente' : 'clientes'}`,
              esHoy,
            )}
          </span>
        )
      })}
      {(haySinDia || dia === SIN_DIA) &&
        chip(
          dia === SIN_DIA,
          () => onChange(dia === SIN_DIA ? null : SIN_DIA),
          <>
            Sin día
            <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', dia === SIN_DIA ? 'bg-white/20' : 'bg-soft text-muted')}>
              {conteo.get(SIN_DIA) ?? 0}
            </span>
          </>,
          `Sin día de visita: ${conteo.get(SIN_DIA) ?? 0} clientes`,
        )}
    </div>
  )
}
