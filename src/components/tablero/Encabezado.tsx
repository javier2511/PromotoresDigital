import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

/** Barra roja con el título de cada sección del Tablero (como en el reporte de Power BI). */
export function EncabezadoTablero({
  children,
  accion,
  className,
}: {
  children: ReactNode
  accion?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-3 bg-brand-800 px-4 py-2 text-white', className)}>
      <h2 className="min-w-0 truncate text-[15px] font-semibold">{children}</h2>
      {accion}
    </div>
  )
}
