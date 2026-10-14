import { CircleCheck, LocateFixed, LocateOff, MapPinOff, Navigation, Play, SatelliteDish } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { RADIO_VISITA_M } from '../config/app'
import type { Cliente } from '../data/clientes'
import type { PosicionVisita } from '../data/visitas'
import { distanceMeters, formatDistance } from '../lib/geo'
import { useGeo, type GeoPosition } from '../providers/GeoProvider'
import { Button } from './ui/Button'
import { cn } from './ui/cn'
import { ConfirmDialog } from './ui/Dialog'
import { Spinner } from './ui/Spinner'

export type GateState =
  | { kind: 'no-coords' }
  | { kind: 'unsupported' }
  | { kind: 'prompt' }
  | { kind: 'denied' }
  | { kind: 'locating' }
  | { kind: 'unavailable' }
  | { kind: 'far' | 'ok'; distance: number; position: GeoPosition }

/** Distancia entre el promotor y el cliente ('ok' = dentro del radio del punto de venta). */
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
 * Botón "Iniciar visita". La visita se puede iniciar desde cualquier lugar, pero siempre con la ubicación:
 * se toma una lectura de GPS reciente, se mide la distancia al cliente y, si está lejos, se le dice al
 * promotor a cuánto está y se le pide confirmar. La ubicación y la distancia quedan guardadas en la visita.
 */
export function StartVisitButton({
  cliente,
  onStart,
  className,
}: {
  cliente: Cliente
  onStart: (inicio: VisitStart) => void
  className?: string
}) {
  const { getFresh } = useGeo()
  const [checking, setChecking] = useState(false)
  const [lejos, setLejos] = useState<VisitStart | null>(null)

  const iniciar = async () => {
    setChecking(true)
    try {
      const position = await getFresh()
      const distance = cliente.location ? distanceMeters(position, cliente.location) : null
      const inicio: VisitStart = {
        startedAt: Date.now(),
        answers: {},
        position: { lat: position.lat, lng: position.lng, accuracy: position.accuracy, distance },
      }
      if (distance !== null && distance > RADIO_VISITA_M) setLejos(inicio)
      else onStart(inicio)
    } catch (error) {
      const code = (error as GeolocationPositionError | null)?.code
      toast.error(
        code === 1
          ? 'Permite el acceso a tu ubicación para iniciar la visita: se registra dónde la haces.'
          : 'No se pudo obtener tu ubicación. Revisa que el GPS esté encendido e inténtalo de nuevo.',
      )
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <Button
        size="lg"
        className={cn('w-full', className)}
        onClick={iniciar}
        loading={checking}
        icon={<Play className="size-5 fill-current" />}
      >
        {checking ? 'Obteniendo tu ubicación…' : 'Iniciar visita'}
      </Button>
      <ConfirmDialog
        open={lejos !== null}
        title={`Estás a ${formatDistance(lejos?.position.distance)} del cliente`}
        confirmLabel="Iniciar de todos modos"
        onCancel={() => setLejos(null)}
        onConfirm={() => {
          const inicio = lejos
          setLejos(null)
          if (inicio) onStart({ ...inicio, startedAt: Date.now() })
        }}
      >
        Puedes hacer la visita desde aquí, pero quedarán registradas tu ubicación y la distancia al cliente.
      </ConfirmDialog>
    </>
  )
}

/** Tarjeta que le dice al promotor a qué distancia está del cliente. */
export function VisitGateCard({ gate, className }: { gate: GateState; className?: string }) {
  const { request } = useGeo()

  if (gate.kind === 'ok' || gate.kind === 'far') {
    const ok = gate.kind === 'ok'
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
            <p className="font-semibold">
              {ok ? 'Estás en el punto de venta' : `Estás a ${formatDistance(gate.distance)} del cliente`}
            </p>
            <p className="text-sm text-muted">
              {ok
                ? `A ${formatDistance(gate.distance)} del cliente.`
                : 'Puedes iniciar la visita; la distancia quedará registrada.'}
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
      title: 'Cliente sin ubicación registrada',
      text: 'Puedes iniciar la visita; se guardará tu ubicación, pero no se puede calcular la distancia.',
    },
    unsupported: {
      icon: MapPinOff,
      title: 'Ubicación no disponible',
      text: 'Tu navegador no comparte la ubicación. Abre la app en Chrome o Safari actualizados.',
    },
    prompt: {
      icon: LocateFixed,
      title: 'Activa tu ubicación',
      text: 'Se usa para registrar dónde haces la visita y a qué distancia del cliente.',
    },
    denied: {
      icon: LocateOff,
      title: 'Ubicación bloqueada',
      text: 'Para iniciar visitas, permite el acceso a la ubicación para este sitio en la configuración del navegador y recarga la página.',
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
