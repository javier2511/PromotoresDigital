import { ChevronRight, LocateFixed, Maximize2, Navigation, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ClienteAvatar } from '../components/ClienteAvatar'
import { ErrorState } from '../components/ErrorState'
import { FiltroDias } from '../components/FiltroDias'
import { filtrarPorDia, useFiltroDia } from '../lib/filtro-dia'
import { LocationBanner } from '../components/LocationBanner'
import type { ClientMapHandle } from '../components/map/ClientMap'
import { requestCompassPermission } from '../components/map/useCompass'
import { Badge } from '../components/ui/Badge'
import { buttonClass, Button } from '../components/ui/Button'
import { cn } from '../components/ui/cn'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Spinner } from '../components/ui/Spinner'
import { RADIO_VISITA_M } from '../config/app'
import { useClientes, type ClienteConDistancia } from '../data/hooks'
import { formatDistance, googleMapsDirectionsUrl } from '../lib/geo'
import { useElementHeight } from '../lib/useElementHeight'
import { useGeo } from '../providers/GeoProvider'

const ClientMap = lazy(() => import('../components/map/ClientMap'))

type Filtro = 'pendientes' | 'todos'

function byDistance(a: ClienteConDistancia, b: ClienteConDistancia) {
  if (a.distance === null && b.distance === null) return a.nombre.localeCompare(b.nombre, 'es')
  if (a.distance === null) return 1
  if (b.distance === null) return -1
  return a.distance - b.distance
}

function Fab({ onClick, label, children, active }: { onClick: () => void; label: string; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-12 place-items-center rounded-2xl border border-line bg-card shadow-float transition active:scale-95',
        active ? 'text-me' : 'text-fg',
      )}
    >
      {children}
    </button>
  )
}

function SelectedCard({ cliente, onClose }: { cliente: ClienteConDistancia; onClose: () => void }) {
  const navigate = useNavigate()
  const cerca = cliente.distance !== null && cliente.distance <= RADIO_VISITA_M
  return (
    <div className="animate-rise rounded-3xl border border-line bg-card p-4 shadow-float">
      <div className="flex items-start gap-3">
        <ClienteAvatar nombre={cliente.nombre} visitado={cliente.visitado} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold">{cliente.nombre}</p>
          {cliente.direccion && <p className="line-clamp-2 text-sm text-muted">{cliente.direccion}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cliente.distance !== null && (
              <Badge tone={cerca ? 'success' : 'neutral'} icon={<Navigation className="size-3" />}>
                {formatDistance(cliente.distance)}
              </Badge>
            )}
            {cliente.visitado ? <Badge tone="success">Visitado</Badge> : <Badge tone="danger">Pendiente</Badge>}
            {cliente.codigo && <Badge>#{cliente.codigo}</Badge>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-mt-1 -mr-1 grid size-9 place-items-center rounded-full text-muted hover:bg-soft"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={() => navigate(`/clientes/${encodeURIComponent(cliente.key)}`)}>
          Ver detalle <ChevronRight className="size-4" />
        </Button>
        {cliente.location && (
          <a
            href={googleMapsDirectionsUrl(cliente.location)}
            target="_blank"
            rel="noreferrer"
            className={buttonClass('outline')}
          >
            <Navigation className="size-4" /> Cómo llegar
          </a>
        )}
      </div>
    </div>
  )
}

function HintCard({
  nearest,
  sinUbicacion,
  onSelect,
}: {
  nearest: ClienteConDistancia | undefined
  sinUbicacion: number
  onSelect: (key: string) => void
}) {
  return (
    <div className="space-y-2">
      <LocationBanner className="shadow-float" />
      <div className="rounded-2xl border border-line bg-card/95 p-3 shadow-float backdrop-blur">
        {nearest ? (
          <button type="button" onClick={() => onSelect(nearest.key)} className="flex w-full items-center gap-3 text-left">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
              <Navigation className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted">Tu cliente pendiente más cercano</p>
              <p className="truncate text-[15px] font-semibold">{nearest.nombre}</p>
            </div>
            <span className="text-sm font-bold text-brand-700 tabular-nums dark:text-brand-300">
              {formatDistance(nearest.distance)}
            </span>
            <ChevronRight className="size-5 text-muted" />
          </button>
        ) : (
          <p className="text-center text-sm text-muted">Toca un punto para ver el cliente</p>
        )}
        <div className="mt-2.5 flex items-center justify-center gap-4 border-t border-line pt-2.5 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-pin-pending" /> Pendiente
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-pin-visited" /> Visitado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-me ring-2 ring-me/25" /> Tú
          </span>
          {sinUbicacion > 0 && <span>{sinUbicacion} sin ubicación</span>}
        </div>
      </div>
    </div>
  )
}

export function MapaPage() {
  const { clientes, progreso, isPending, error, refetch } = useClientes()
  const { position, request } = useGeo()
  const [params, setParams] = useSearchParams()
  const mapRef = useRef<ClientMapHandle>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const bottomHeight = useElementHeight(bottomRef)
  const [compass, setCompass] = useState(false)
  const [wantsLocate, setWantsLocate] = useState(false)

  const filtro: Filtro = params.get('f') === 'todos' ? 'todos' : 'pendientes'
  const selectedKey = params.get('c')

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  const [dia, setDia] = useFiltroDia()
  const delDia = useMemo(() => filtrarPorDia(clientes ?? [], dia), [clientes, dia])
  const pendientesDelDia = useMemo(() => delDia.filter((c) => !c.visitado).length, [delDia])
  const visibles = useMemo(() => delDia.filter((c) => filtro === 'todos' || !c.visitado), [delDia, filtro])
  const filtroDias = (className?: string) =>
    clientes ? (
      <FiltroDias
        clientes={clientes}
        conteoDe={clientes.filter((c) => filtro === 'todos' || !c.visitado)}
        dia={dia}
        onChange={setDia}
        className={className}
      />
    ) : null
  const ordenados = useMemo(() => [...visibles].sort(byDistance), [visibles])
  const selected = clientes?.find((c) => c.key === selectedKey)
  const nearest = ordenados.find((c) => !c.visitado && c.distance !== null)
  const sinUbicacion = visibles.filter((c) => !c.location).length

  // Si se pidió centrar antes de tener ubicación, se centra en cuanto llega.
  useEffect(() => {
    if (wantsLocate && position && mapRef.current?.locateMe()) setWantsLocate(false)
  }, [wantsLocate, position])

  const onLocate = async () => {
    if (!position) {
      request()
      setWantsLocate(true)
    } else {
      mapRef.current?.locateMe()
    }
    if (!compass && (await requestCompassPermission())) setCompass(true)
  }

  const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches

  return (
    <div className="relative flex h-full">
      {/* Lista lateral (escritorio) */}
      <aside className="hidden w-96 shrink-0 flex-col border-r border-line bg-card lg:flex">
        <div className="space-y-3 border-b border-line p-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Mapa de clientes</h1>
            {progreso && (
              <p className="text-sm text-muted">
                {progreso.visitados} de {progreso.total} visitados
              </p>
            )}
          </div>
          <SegmentedControl<Filtro>
            label="Filtrar mapa"
            value={filtro}
            onChange={(v) => setParam('f', v === 'pendientes' ? null : v)}
            options={[
              { value: 'pendientes', label: 'Pendientes', count: clientes ? pendientesDelDia : undefined },
              { value: 'todos', label: 'Todos', count: clientes ? delDia.length : undefined },
            ]}
          />
          {filtroDias('flex-wrap')}
        </div>
        <ul className="flex-1 overflow-y-auto p-2">
          {ordenados.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => setParam('c', c.key)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-soft',
                  c.key === selectedKey && 'bg-brand-500/10',
                )}
              >
                <ClienteAvatar nombre={c.nombre} visitado={c.visitado} className="size-10 rounded-xl text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.nombre}</p>
                  <p className="truncate text-xs text-muted">{c.direccion ?? (c.location ? '' : 'Sin ubicación')}</p>
                </div>
                {c.distance !== null && (
                  <span className="text-xs font-semibold text-muted tabular-nums">{formatDistance(c.distance)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="relative min-w-0 flex-1">
        <Suspense
          fallback={
            <div className="absolute inset-0 grid place-items-center bg-soft">
              <Spinner className="size-7 text-brand-600" />
            </div>
          }
        >
          <ClientMap
            ref={mapRef}
            clientes={visibles}
            me={position}
            selectedKey={selectedKey}
            onSelect={(key) => setParam('c', key)}
            bottomInset={isDesktop ? 0 : bottomHeight}
            compass={compass}
            className="absolute inset-0"
          />
        </Suspense>

        {/* Filtro (móvil) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
          <div className="pointer-events-auto rounded-2xl border border-line bg-card/95 p-1 shadow-float backdrop-blur">
            <SegmentedControl<Filtro>
              label="Filtrar mapa"
              value={filtro}
              onChange={(v) => setParam('f', v === 'pendientes' ? null : v)}
              className="bg-transparent p-0"
              options={[
                { value: 'pendientes', label: 'Pendientes', count: clientes ? pendientesDelDia : undefined },
                { value: 'todos', label: 'Todos', count: clientes ? delDia.length : undefined },
              ]}
            />
            {filtroDias('px-1 pt-1.5 pb-0.5')}
          </div>
        </div>

        {/* Botones flotantes + tarjeta inferior */}
        <div
          ref={bottomRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-end gap-3 p-3 lg:items-center lg:pb-6"
        >
          <div className="pointer-events-auto flex flex-col gap-2 lg:absolute lg:right-3 lg:bottom-6">
            <Fab onClick={() => mapRef.current?.fitAll()} label="Ver todos los clientes">
              <Maximize2 className="size-5" />
            </Fab>
            <Fab onClick={onLocate} label="Mi ubicación" active={Boolean(position)}>
              <LocateFixed className="size-5" />
            </Fab>
          </div>
          <div className="pointer-events-auto w-full lg:max-w-md">
            {error ? (
              <div className="rounded-3xl border border-line bg-card shadow-float">
                <ErrorState error={error} onRetry={refetch} />
              </div>
            ) : isPending ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-card p-4 text-sm text-muted shadow-float">
                <Spinner className="size-4" /> Cargando clientes…
              </div>
            ) : selected ? (
              <SelectedCard key={selected.key} cliente={selected} onClose={() => setParam('c', null)} />
            ) : (
              <HintCard nearest={nearest} sinUbicacion={sinUbicacion} onSelect={(key) => setParam('c', key)} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
