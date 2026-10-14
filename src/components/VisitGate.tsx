import { CircleCheck, LocateFixed, LocateOff, MapPinOff, Navigation, SatelliteDish } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { RADIO_VISITA_M } from '../config/app'
import type { Cliente } from '../data/clientes'
import type { PosicionVisita } from '../data/visitas'
import { distanceMeters, formatDistance } from '../lib/geo'
import { useGeo, type GeoPosition } from '../providers/GeoProvider'
import { Button } from './ui/Button'
import { cn } from './ui/cn'
import { Spinner } from './ui/Spinner'

export type GateState =
  | { kind: 'no-coords' }
  | { kind: 'unsupported' }
  | { kind: 'prompt' }
  | { kind: 'denied' }
  | { kind: 'locating' }
  | { kind: 'unavailable' }
  | { kind: 'far' | 'ok'; distance: number; position: GeoPosition }

/** ¿Puede el promotor iniciar la visita? Compara su ubicación actual con la del cliente. */
export function useVisitGate(cliente: Cliente | undefined): GateState {
  const { status, position } = useGeo()
  if (!cliente?.location) return { kind: 'no-coords' }
  if (position) {
    const distance = distanceMeters(position, cliente.location)
    return { kind: distance <= RADIO_VISITA_M ? 'ok' : 'far', distance, position }
  }
  if (status === 'unsupported') return { kind: 'unsupported' }
  if (status === 'denied') return { kind: 'denied' }
  if (status === 'prompt') return { kind: 'prompt' }
  if (status === 'unavailable') return { kind: 'unavailable' }
  return { kind: 'locating' }
}

export interface VisitStart {
  startedAt: number
  answers: Record<string, never>
  position: PosicionVisita
}

/**
 * Al tocar "Iniciar visita" se pide una lectura de GPS nueva (no la última mostrada, que puede ser vieja)
 * y se vuelve a medir la distancia. Devuelve los datos de inicio, o null si no está en el punto de venta.
 */
export function useStartVisit(cliente: Cliente | undefined) {
  const { getFresh } = useGeo()
  const [checking, setChecking] = useState(false)

  const start = async (): Promise<VisitStart | null> => {
    if (!cliente?.location) return null
    setChecking(true)
    try {
      const position = await getFresh()
      const distance = distanceMeters(position, cliente.location)
      if (distance > RADIO_VISITA_M) {
        toast.warning(
          `Estás a ${formatDistance(distance)} del cliente. Acércate a menos de ${formatDistance(RADIO_VISITA_M)} para iniciar.`,
        )
        return null
      }
      return {
        startedAt: Date.now(),
        answers: {},
        position: { lat: position.lat, lng: position.lng, accuracy: position.accuracy, distance },
      }
    } catch (error) {
      const code = (error as GeolocationPositionError | null)?.code
      toast.error(
        code === 1
          ? 'Permite el acceso a tu ubicación para iniciar la visita.'
          : 'No se pudo confirmar tu ubicación. Revisa que el GPS esté encendido e inténtalo de nuevo.',
      )
      return null
    } finally {
      setChecking(false)
    }
  }

  return { start, checking }
}

/** Tarjeta que explica si la visita está desbloqueada y por qué. */
export function VisitGateCard({ gate, className }: { gate: GateState; className?: string }) {
  const { request } = useGeo()

  if (gate.kind === 'ok' || gate.kind === 'far') {
    const ok = gate.kind === 'ok'
    // Qué tan cerca está, de 0 (≥ 10 veces el radio) a 1 (dentro del radio), para la barra.
    const closeness = ok ? 1 : Math.max(0.04, 1 - Math.log10(gate.distance / RADIO_VISITA_M))
    const weakGps = gate.position.accuracy > RADIO_VISITA_M
    return (
      <div
        className={cn(
          'rounded-2xl border p-4',
          ok
            ? 'border-emerald-300/60 bg-emerald-500/8 dark:border-emerald-800'
            : 'border-amber-300/60 bg-amber-500/8 dark:border-amber-800',
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-xl text-white',
              ok ? 'bg-emerald-600' : 'bg-amber-500',
            )}
          >
            {ok ? <CircleCheck className="size-6" /> : <Navigation className="size-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{ok ? 'Estás en el punto de venta' : 'Aún estás lejos'}</p>
            <p className="text-sm text-muted">
              {ok
                ? `A ${formatDistance(gate.distance)} del cliente. Ya puedes iniciar la visita.`
                : `Acércate a menos de ${formatDistance(RADIO_VISITA_M)} para iniciar la visita.`}
            </p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                'text-xl font-bold tabular-nums',
                ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300',
              )}
            >
              {formatDistance(gate.distance)}
            </p>
            <p className="text-[11px] text-muted">±{Math.round(gate.position.accuracy)} m</p>
          </div>
        </div>
        {!ok && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-500/15">
            <div
              className="h-full rounded-full bg-amber-500 transition-[width] duration-700"
              style={{ width: `${Math.min(100, closeness * 100)}%` }}
            />
          </div>
        )}
        {weakGps && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            <SatelliteDish className="size-3.5" />
            Señal GPS débil (±{Math.round(gate.position.accuracy)} m). Sal a un lugar abierto para mejorar la precisión.
          </p>
        )}
      </div>
    )
  }

  const info = {
    'no-coords': {
      icon: MapPinOff,
      title: 'Cliente sin ubicación',
      text: 'Este cliente no tiene coordenadas registradas, así que no se puede validar la distancia. Avísale a tu administrador.',
    },
    unsupported: {
      icon: MapPinOff,
      title: 'Ubicación no disponible',
      text: 'Tu navegador no comparte la ubicación. Abre la app en Chrome o Safari actualizados.',
    },
    prompt: {
      icon: LocateFixed,
      title: 'Activa tu ubicación',
      text: 'La necesitamos para validar que estás en el punto de venta.',
    },
    denied: {
      icon: LocateOff,
      title: 'Ubicación bloqueada',
      text: 'Permite el acceso a la ubicación para este sitio en la configuración del navegador y recarga la página.',
    },
    unavailable: {
      icon: SatelliteDish,
      title: 'Buscando señal GPS…',
      text: 'Revisa que el GPS esté encendido. Seguimos intentando.',
    },
    locating: { icon: LocateFixed, title: 'Obteniendo tu ubicación…', text: 'Esto toma solo unos segundos.' },
  }[gate.kind]

  const Icon = info.icon
  return (
    <div className={cn('rounded-2xl border border-line bg-card p-4', className)}>
      <div className="flex items-center gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-soft text-muted">
          {gate.kind === 'locating' ? <Spinner className="size-5 text-brand-600" /> : <Icon className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{info.title}</p>
          <p className="text-sm text-muted">{info.text}</p>
        </div>
        {(gate.kind === 'prompt' || gate.kind === 'unavailable') && (
          <Button size="sm" onClick={request}>
            Activar
          </Button>
        )}
      </div>
    </div>
  )
}
