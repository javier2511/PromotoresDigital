import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { cn } from './ui/cn'

/** Encabezado fijo con botón de regreso (pantallas de detalle). */
export function TopBar({
  title,
  subtitle,
  backTo,
  actions,
  className,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** Ruta a la que regresar si no hay historial. */
  backTo?: string
  actions?: ReactNode
  className?: string
  children?: ReactNode
}) {
  const navigate = useNavigate()
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate(backTo ?? '/', { replace: true })
  }
  return (
    <header className={cn('sticky top-0 z-20 border-b border-line bg-bg/85 pt-safe backdrop-blur-xl', className)}>
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2 sm:px-4">
        <button
          type="button"
          onClick={goBack}
          aria-label="Regresar"
          className="grid size-10 shrink-0 place-items-center rounded-full text-fg transition hover:bg-soft active:scale-95"
        >
          <ArrowLeft className="size-[22px]" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] leading-tight font-semibold">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </header>
  )
}

/** Título grande de las pantallas principales. */
export function PageTitle({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 pt-safe">
      <div className="min-w-0 pt-6">
        <h1 className="text-[26px] leading-tight font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-1 pt-6">{actions}</div>}
    </div>
  )
}
