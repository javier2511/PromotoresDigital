import { CircleCheck, ClipboardList, MapPinOff, Navigation, Phone, SearchX } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ClienteAvatar } from '../components/ClienteAvatar'
import { ClienteInfo } from '../components/ClienteInfo'
import { ErrorState } from '../components/ErrorState'
import { TopBar } from '../components/PageHeader'
import { StartVisitButton, useVisitGate, VisitGateCard, type VisitStart } from '../components/VisitGate'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink, buttonClass } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { useClientes } from '../data/hooks'
import { loadDraft, saveDraft } from '../lib/draft'
import { googleMapsDirectionsUrl, wazeUrl } from '../lib/geo'
import { useUser } from '../providers/AuthProvider'

const ClientMap = lazy(() => import('../components/map/ClientMap'))

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <Skeleton className="h-48 w-full rounded-3xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  )
}

export function ClienteDetallePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const user = useUser()
  const { clientes, ctx, isPending, error, refetch } = useClientes()
  const cliente = clientes?.find((c) => c.key === id)
  const gate = useVisitGate(cliente)
  const draft = cliente ? loadDraft(user.id, cliente.key) : null

  if (error) {
    return (
      <>
        <TopBar title="Cliente" backTo="/" />
        <ErrorState error={error} onRetry={refetch} />
      </>
    )
  }
  if (isPending) {
    return (
      <>
        <TopBar title="Cliente" backTo="/" />
        <DetailSkeleton />
      </>
    )
  }
  if (!cliente) {
    return (
      <>
        <TopBar title="Cliente" backTo="/" />
        <EmptyState
          icon={SearchX}
          title="Cliente no encontrado"
          action={
            <ButtonLink to="/" variant="secondary">
              Ver mis clientes
            </ButtonLink>
          }
        >
          Puede que ya no esté asignado a ti.
        </EmptyState>
      </>
    )
  }

  const abrirVisita = () => navigate(`/clientes/${encodeURIComponent(cliente.key)}/visita`)
  const iniciar = (inicio: VisitStart) => {
    saveDraft(user.id, cliente.key, inicio)
    abrirVisita()
  }

  return (
    <div className="pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      <TopBar title={cliente.nombre} subtitle={cliente.codigo ? `Código ${cliente.codigo}` : 'Detalle del cliente'} backTo="/" />

      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 sm:px-6">
        {/* Mini mapa */}
        <div className="relative h-52 overflow-hidden rounded-3xl border border-line bg-soft shadow-card sm:h-64">
          {cliente.location ? (
            <Suspense fallback={<Skeleton className="absolute inset-0 rounded-none" />}>
              <ClientMap
                variant="mini"
                clientes={[{ ...cliente, distance: gate.kind === 'ok' || gate.kind === 'far' ? gate.distance : null }]}
                me={gate.kind === 'ok' || gate.kind === 'far' ? gate.position : null}
                selectedKey={cliente.key}
                className="absolute inset-0"
              />
            </Suspense>
          ) : (
            <div className="grid h-full place-items-center text-center text-muted">
              <div>
                <MapPinOff className="mx-auto size-8" />
                <p className="mt-2 text-sm">Sin ubicación registrada</p>
              </div>
            </div>
          )}
        </div>

        {/* Encabezado */}
        <Card className="p-4">
          <div className="flex items-start gap-3.5">
            <ClienteAvatar nombre={cliente.nombre} visitado={cliente.visitado} className="size-14 text-lg" />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl leading-snug font-bold tracking-tight">{cliente.nombre}</h2>
              {cliente.direccion && <p className="mt-0.5 text-sm text-muted">{cliente.direccion}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cliente.visitado ? (
                  <Badge tone="success" icon={<CircleCheck className="size-3" />}>
                    Visitado
                  </Badge>
                ) : draft ? (
                  <Badge tone="warning">Visita en curso</Badge>
                ) : (
                  <Badge tone="danger">Pendiente</Badge>
                )}
                {cliente.codigo && <Badge>#{cliente.codigo}</Badge>}
              </div>
            </div>
          </div>

          {(cliente.location || cliente.telefono) && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {cliente.location && (
                <>
                  <a
                    href={googleMapsDirectionsUrl(cliente.location)}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClass('secondary', 'md', 'col-span-2 sm:col-span-1')}
                  >
                    <Navigation className="size-4 text-brand-600" /> Google Maps
                  </a>
                  <a href={wazeUrl(cliente.location)} target="_blank" rel="noreferrer" className={buttonClass('secondary')}>
                    <Navigation className="size-4 text-sky-500" /> Waze
                  </a>
                </>
              )}
              {cliente.telefono && (
                <a href={`tel:${cliente.telefono.replace(/[^\d+]/g, '')}`} className={buttonClass('secondary')}>
                  <Phone className="size-4 text-emerald-600" /> Llamar
                </a>
              )}
            </div>
          )}
        </Card>

        {/* Validación de distancia */}
        {!cliente.visitado && !draft && <VisitGateCard gate={gate} />}

        {/* Información del cliente (solo los datos configurados) */}
        {ctx && <ClienteInfo cliente={cliente} ctx={ctx} />}
      </div>

      {/* Acción principal */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:left-64">
        <div className="mx-auto max-w-3xl">
          {draft ? (
            <Button size="lg" className="w-full" onClick={abrirVisita} icon={<ClipboardList className="size-5" />}>
              Continuar visita
            </Button>
          ) : cliente.visitado ? (
            <Button size="lg" variant="success" className="w-full" disabled icon={<CircleCheck className="size-5" />}>
              Visita finalizada
            </Button>
          ) : (
            <StartVisitButton cliente={cliente} onStart={iniciar} />
          )}
        </div>
      </div>
    </div>
  )
}
