import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '../ui/Card'

/** Tarjeta de indicador como en el reporte: ícono a la izquierda, título arriba y el número abajo. */
export function TarjetaKpi({
  icono: Icono,
  insignia: Insignia,
  titulo,
  extra,
  valor,
  ayuda,
}: {
  icono: LucideIcon
  /** Iconito sobre el principal (p. ej. un reloj sobre el carrito). */
  insignia?: LucideIcon
  titulo: string
  /** Dato que acompaña al título (p. ej. el porcentaje). */
  extra?: ReactNode
  valor: string
  /** Cómo se calculó (se ve al pasar el mouse). */
  ayuda?: string
}) {
  // El número va en la última fila: así los de una misma fila de tarjetas se alinean aunque el título ocupe más
  // líneas. En el teléfono va debajo del ícono, a todo lo ancho; en pantallas grandes, a la derecha del ícono.
  return (
    <Card
      className="grid h-full grid-cols-[auto_minmax(0,1fr)] grid-rows-[1fr_auto] gap-x-3 gap-y-2 p-3.5 sm:p-4"
      title={ayuda}
    >
      <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 sm:row-span-2 sm:size-14 sm:self-center dark:bg-brand-950/60 dark:text-brand-300">
        <Icono className="size-5 sm:size-7" strokeWidth={1.8} />
        {Insignia && (
          <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-card ring-2 ring-card">
            <Insignia className="size-3.5" strokeWidth={2.5} />
          </span>
        )}
      </span>
      <div className="text-right">
        <p className="text-[12px] leading-tight font-semibold sm:text-[13px]">{titulo}</p>
        {extra}
      </div>
      <p className="col-span-2 self-end text-[26px] leading-none font-bold tracking-tight sm:col-span-1 sm:text-[28px]">{valor}</p>
    </Card>
  )
}
