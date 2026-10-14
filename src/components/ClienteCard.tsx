import { ChevronRight, MapPinOff, Navigation, Timer } from 'lucide-react'
import { Link } from 'react-router'
import type { ClienteConDistancia } from '../data/hooks'
import { formatDistance } from '../lib/geo'
import { ClienteAvatar } from './ClienteAvatar'
import { Badge } from './ui/Badge'
import { cn } from './ui/cn'

export function ClienteCard({
  cliente,
  enCurso,
  destacado,
  radio,
}: {
  cliente: ClienteConDistancia
  enCurso?: boolean
  destacado?: boolean
  radio: number
}) {
  const cerca = cliente.distance !== null && cliente.distance <= radio
  return (
    <Link
      to={`/clientes/${encodeURIComponent(cliente.key)}`}
      className={cn(
        'flex items-center gap-3.5 rounded-2xl border bg-card p-3.5 shadow-card transition [contain-intrinsic-size:auto_84px] [content-visibility:auto]',
        'hover:border-brand-300 active:scale-[0.99] dark:hover:border-brand-700',
        destacado ? 'border-brand-300 ring-4 ring-brand-500/10 dark:border-brand-700' : 'border-line',
      )}
    >
      <ClienteAvatar nombre={cliente.nombre} visitado={cliente.visitado} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-semibold">{cliente.nombre}</p>
        </div>
        {cliente.direccion && <p className="mt-0.5 truncate text-sm text-muted">{cliente.direccion}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {cliente.visitado ? (
            <Badge tone="success">Visitado</Badge>
          ) : enCurso ? (
            <Badge tone="warning" icon={<Timer className="size-3" />}>
              Visita en curso
            </Badge>
          ) : null}
          {destacado && !cliente.visitado && <Badge tone="brand">Más cercano</Badge>}
          {cliente.location ? (
            cliente.distance !== null && (
              <Badge tone={cerca ? 'success' : 'neutral'} icon={<Navigation className="size-3" />}>
                {formatDistance(cliente.distance)}
              </Badge>
            )
          ) : (
            <Badge tone="warning" icon={<MapPinOff className="size-3" />}>
              Sin ubicación
            </Badge>
          )}
          {cliente.codigo && <Badge>#{cliente.codigo}</Badge>}
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted" />
    </Link>
  )
}
