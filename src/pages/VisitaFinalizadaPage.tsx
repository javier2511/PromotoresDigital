import { Check, ChevronRight, Map as MapIcon, Navigation, PartyPopper, Store, TriangleAlert } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router'
import { ClienteAvatar } from '../components/ClienteAvatar'
import { Alert } from '../components/ui/Alert'
import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressRing } from '../components/ui/ProgressRing'
import { Spinner } from '../components/ui/Spinner'
import { useClientes, type ClienteConDistancia } from '../data/hooks'
import { formatDistance } from '../lib/geo'
import type { VisitaFinalizadaState } from './VisitaPage'

function siguiente(clientes: ClienteConDistancia[], actual: string): ClienteConDistancia | undefined {
  const pendientes = clientes.filter((c) => !c.visitado && c.key !== actual)
  const conDistancia = pendientes.filter((c) => c.distance !== null).sort((a, b) => a.distance! - b.distance!)
  return conDistancia[0] ?? pendientes[0]
}

export function VisitaFinalizadaPage() {
  const { id = '' } = useParams()
  const state = useLocation().state as VisitaFinalizadaState | null
  const { clientes, progreso } = useClientes()
  const cliente = clientes?.find((c) => c.key === id)
  const next = clientes ? siguiente(clientes, id) : undefined
  const completo = progreso ? progreso.pendientes === 0 : false

  return (
    <div className="min-h-dvh bg-linear-to-b from-emerald-500/10 via-bg to-bg px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10">
      <div className="mx-auto max-w-md text-center">
        <div className="relative mx-auto size-24">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30 [animation-iteration-count:2]" />
          <div className="relative grid size-24 animate-pop place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40">
            {completo ? <PartyPopper className="size-11" /> : <Check className="size-12" strokeWidth={3} />}
          </div>
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">
          {completo ? '¡Completaste todos tus clientes!' : '¡Visita finalizada!'}
        </h1>
        {cliente && (
          <p className="mt-1 text-muted">
            {cliente.nombre}
            {state ? ` · ${state.respuestas} respuesta${state.respuestas === 1 ? '' : 's'} guardada${state.respuestas === 1 ? '' : 's'}` : ''}
          </p>
        )}
      </div>

      <div className="mx-auto mt-8 max-w-md space-y-4">
        {state?.warning && (
          <Alert tone="warning" icon={<TriangleAlert />}>
            {state.warning}
          </Alert>
        )}

        <Card className="flex items-center gap-5 p-5">
          {progreso ? (
            <>
              <ProgressRing value={progreso.ratio} size={88} stroke={9} className="text-emerald-500">
                <span className="text-xl font-bold tabular-nums">{Math.round(progreso.ratio * 100)}%</span>
              </ProgressRing>
              <div className="text-left">
                <p className="text-sm text-muted">Tu avance</p>
                <p className="text-2xl font-bold tabular-nums">
                  {progreso.visitados} <span className="text-base font-semibold text-muted">de {progreso.total}</span>
                </p>
                <p className="text-sm text-muted">
                  {progreso.pendientes === 0
                    ? 'No te quedan clientes pendientes'
                    : `Te ${progreso.pendientes === 1 ? 'falta 1 cliente' : `faltan ${progreso.pendientes} clientes`}`}
                </p>
              </div>
            </>
          ) : (
            <Spinner className="mx-auto size-6 text-brand-600" />
          )}
        </Card>

        {next && (
          <Link
            to={`/clientes/${encodeURIComponent(next.key)}`}
            replace
            className="flex items-center gap-3 rounded-2xl border border-brand-300 bg-card p-4 shadow-card ring-4 ring-brand-500/10 transition active:scale-[0.99] dark:border-brand-700"
          >
            <ClienteAvatar nombre={next.nombre} />
            <div className="min-w-0 flex-1 text-left">
              <p className="text-xs font-semibold text-brand-700 uppercase dark:text-brand-300">Siguiente cliente</p>
              <p className="truncate font-semibold">{next.nombre}</p>
              {next.distance !== null && (
                <p className="flex items-center gap-1 text-sm text-muted">
                  <Navigation className="size-3.5" /> a {formatDistance(next.distance)}
                </p>
              )}
            </div>
            <ChevronRight className="size-5 text-muted" />
          </Link>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2">
          <ButtonLink to="/" replace variant="secondary" icon={<Store className="size-4" />}>
            Mis clientes
          </ButtonLink>
          <ButtonLink to="/mapa" replace variant="secondary" icon={<MapIcon className="size-4" />}>
            Ver mapa
          </ButtonLink>
        </div>
      </div>
    </div>
  )
}
