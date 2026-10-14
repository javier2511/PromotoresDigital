import { LocateFixed, LocateOff, MapPinOff } from 'lucide-react'
import { useGeo } from '../providers/GeoProvider'
import { Button } from './ui/Button'
import { cn } from './ui/cn'

/** Aviso cuando la ubicación no está activa (las distancias y las visitas la necesitan). */
export function LocationBanner({ className }: { className?: string }) {
  const { status, request } = useGeo()
  if (status === 'active' || status === 'locating' || status === 'idle') return null

  const content = {
    prompt: {
      icon: LocateFixed,
      title: 'Activa tu ubicación',
      text: 'Para ver qué clientes tienes cerca y registrar dónde haces cada visita.',
      action: true,
    },
    denied: {
      icon: LocateOff,
      title: 'Ubicación bloqueada',
      text: 'Permite el acceso a la ubicación en la configuración del navegador para este sitio y recarga la página.',
      action: false,
    },
    unavailable: {
      icon: MapPinOff,
      title: 'No se pudo obtener tu ubicación',
      text: 'Revisa que el GPS esté encendido. Seguiremos intentando.',
      action: true,
    },
    unsupported: {
      icon: MapPinOff,
      title: 'Tu navegador no comparte la ubicación',
      text: 'Abre la app en Chrome o Safari actualizados.',
      action: false,
    },
  }[status]

  const Icon = content.icon
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3.5 dark:border-brand-900 dark:bg-brand-950/40',
        className,
      )}
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{content.title}</p>
        <p className="text-xs text-muted">{content.text}</p>
      </div>
      {content.action && (
        <Button size="sm" onClick={request}>
          Activar
        </Button>
      )}
    </div>
  )
}
