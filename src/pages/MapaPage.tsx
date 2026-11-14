import { ArrowDownAZ, ChevronRight, List, LocateFixed, MapPinOff, Maximize2, Navigation, Search, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ClienteAvatar } from '../components/ClienteAvatar'
import { ErrorState } from '../components/ErrorState'
import { FiltroDias } from '../components/FiltroDias'
import { LocationBanner } from '../components/LocationBanner'
import type { ClientMapHandle } from '../components/map/ClientMap'
import { requestCompassPermission } from '../components/map/useCompass'
import { Reseteado } from '../components/Reseteado'
import { SaldoBadge } from '../components/SaldoBadge'
import { Badge } from '../components/ui/Badge'
import { buttonClass, Button } from '../components/ui/Button'
import { cn } from '../components/ui/cn'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Spinner } from '../components/ui/Spinner'
import { RADIO_VISITA_M } from '../config/app'
import { coincideCliente, ordenarClientes, type OrdenClientes } from '../data/buscar'
import { useClientes, type ClienteConDistancia } from '../data/hooks'
import { filtrarPorDia, useFiltroDia } from '../lib/filtro-dia'
import { formatDistance, googleMapsDirectionsUrl } from '../lib/geo'
import { normalize } from '../lib/text'
import { useElementHeight } from '../lib/useElementHeight'
import { useGeo } from '../providers/GeoProvider'

const ClientMap = lazy(() => import('../components/map/ClientMap'))

type Filtro = 'pendientes' | 'visitados' | 'todos'

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
          {cliente.reseteado !== null ? (
            <Reseteado valor={cliente.reseteado} />
          ) : (
            cliente.direccion && <p className="line-clamp-2 text-sm text-muted">{cliente.direccion}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cliente.distance !== null && (
              <Badge tone={cerca ? 'success' : 'neutral'} icon={<Navigation className="size-3" />}>
                {formatDistance(cliente.distance)}
              </Badge>
            )}
            {!cliente.location && <Badge icon={<MapPinOff className="size-3" />}>Sin ubicación en el mapa</Badge>}
            {cliente.visitado ? <Badge tone="success">Visitado</Badge> : <Badge tone="danger">Pendiente</Badge>}
            <SaldoBadge saldo={cliente.saldo} />
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

/** Buscador, orden (cercanía o nombre) y, en el teléfono, el botón de la lista. */
function Buscador({
  q,
  onBuscar,
  orden,
  onOrden,
  sinUbicacion,
  lista,
  onLista,
}: {
  q: string
  onBuscar: (q: string) => void
  orden: OrdenClientes
  onOrden: () => void
  /** Sin la ubicación del usuario no se puede ordenar por cercanía. */
  sinUbicacion: boolean
  lista?: boolean
  onLista?: () => void
}) {
  return (
    <div className="flex gap-2">
      <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15">
        <Search className="size-5 shrink-0 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => onBuscar(e.target.value)}
          placeholder="Buscar nombre o número…"
          aria-label="Buscar cliente en el mapa"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted/70 [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" aria-label="Limpiar búsqueda" onClick={() => onBuscar('')}>
            <X className="size-4 text-muted" />
          </button>
        )}
      </label>
      <button
        type="button"
        onClick={onOrden}
        disabled={sinUbicacion && orden === 'nombre'}
        aria-label={orden === 'cercania' ? 'Ordenado por cercanía' : 'Ordenado por nombre'}
        title={orden === 'cercania' ? 'Ordenado por cercanía (toca para ordenar por nombre)' : 'Ordenado por nombre (toca para ordenar por cercanía)'}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg transition hover:bg-soft disabled:opacity-50"
      >
        {orden === 'cercania' ? <Navigation className="size-4 text-brand-600" /> : <ArrowDownAZ className="size-4" />}
        <span className="hidden sm:inline">{orden === 'cercania' ? 'Cercanía' : 'Nombre'}</span>
      </button>
      {onLista && (
        <button
          type="button"
          onClick={onLista}
          aria-pressed={lista}
          aria-label="Ver lista"
          title="Ver lista"
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-xl border transition',
            lista ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-fg hover:bg-soft',
          )}
        >
          <List className="size-5" />
        </button>
      )}
    </div>
  )
}

/** Lista de clientes del mapa (los del filtro o, al buscar, los que coinciden). */
function ListaMapa({
  clientes,
  selectedKey,
  onElegir,
  vacio,
  className,
}: {
  clientes: ClienteConDistancia[]
  selectedKey: string | null
  onElegir: (key: string) => void
  vacio: string
  className?: string
}) {
  if (clientes.length === 0) return <p className="px-3 py-6 text-center text-sm text-muted">{vacio}</p>
  return (
    <ul aria-label="Clientes" className={className}>
      {clientes.map((c) => (
        <li key={c.key}>
          <button
            type="button"
            onClick={() => onElegir(c.key)}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-soft',
              c.key === selectedKey && 'bg-brand-500/10',
            )}
          >
            <ClienteAvatar nombre={c.nombre} visitado={c.visitado} className="size-10 rounded-xl text-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{c.nombre}</p>
              <p className="truncate text-xs text-muted">{c.location ? (c.direccion ?? '') : 'Sin ubicación'}</p>
            </div>
            <div className="shrink-0 text-right">
              {c.distance !== null && <p className="text-xs font-semibold text-muted tabular-nums">{formatDistance(c.distance)}</p>}
              <p
                className={cn(
                  'text-[11px] font-semibold',
                  c.visitado ? 'text-emerald-600 dark:text-emerald-400' : 'text-brand-600 dark:text-brand-300',
                )}
              >
                {c.visitado ? 'Visitado' : 'Pendiente'}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
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
  /** Lista abierta en el teléfono (en escritorio siempre se ve a un lado). */
  const [lista, setLista] = useState(false)

  const f = params.get('f')
  const filtro: Filtro = f === 'visitados' || f === 'todos' ? f : 'pendientes'
  const q = params.get('q') ?? ''
  const o = params.get('o')
  const orden: OrdenClientes = o === 'nombre' || o === 'cercania' ? o : position ? 'cercania' : 'nombre'
  const selectedKey = params.get('c')

  const setParam = (cambios: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(cambios)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )

  const [dia, setDia] = useFiltroDia()
  const delDia = useMemo(() => filtrarPorDia(clientes ?? [], dia), [clientes, dia])
  const conteos = useMemo(() => {
    const visitados = delDia.filter((c) => c.visitado).length
    return { pendientes: delDia.length - visitados, visitados, todos: delDia.length }
  }, [delDia])
  const visibles = useMemo(
    () => delDia.filter((c) => filtro === 'todos' || (filtro === 'visitados' ? c.visitado : !c.visitado)),
    [delDia, filtro],
  )
  // Al buscar se busca en todos los clientes, aunque el filtro o el día los oculten en el mapa.
  const term = useMemo(() => normalize(q.trim()), [q])
  const encontrados = useMemo(
    () => (term && clientes ? clientes.filter((c) => coincideCliente(c, term)) : null),
    [term, clientes],
  )
  const enLista = useMemo(() => ordenarClientes(encontrados ?? visibles, orden), [encontrados, visibles, orden])
  const selected = clientes?.find((c) => c.key === selectedKey)
  // El cliente elegido se ve en el mapa aunque el filtro lo oculte.
  const enMapa = useMemo(
    () => (selected && !visibles.some((c) => c.key === selected.key) ? [...visibles, selected] : visibles),
    [visibles, selected],
  )
  const nearest = useMemo(() => ordenarClientes(visibles, 'cercania').find((c) => !c.visitado && c.distance !== null), [visibles])
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
  // En el teléfono, al elegir se cierra la lista (y la búsqueda) para ver el cliente en el mapa.
  const elegir = (key: string) => {
    setParam(isDesktop ? { c: key } : { c: key, q: null })
    setLista(false)
  }

  const buscador = (enTelefono: boolean) => (
    <Buscador
      q={q}
      onBuscar={(texto) => setParam({ q: texto || null })}
      orden={orden}
      onOrden={() => setParam({ o: orden === 'cercania' ? 'nombre' : 'cercania' })}
      sinUbicacion={!position}
      lista={enTelefono ? lista || Boolean(term) : undefined}
      onLista={enTelefono ? () => (term ? setParam({ q: null }) : setLista((v) => !v)) : undefined}
    />
  )
  const filtros = (className: string | undefined, diasClassName: string) => (
    <>
      <SegmentedControl<Filtro>
        label="Filtrar mapa"
        value={filtro}
        onChange={(v) => setParam({ f: v === 'pendientes' ? null : v })}
        className={className}
        options={[
          { value: 'pendientes', label: 'Pendientes', count: clientes ? conteos.pendientes : undefined },
          { value: 'visitados', label: 'Visitados', count: clientes ? conteos.visitados : undefined },
          { value: 'todos', label: 'Todos', count: clientes ? conteos.todos : undefined },
        ]}
      />
      {clientes && (
        <FiltroDias
          clientes={clientes}
          conteoDe={clientes.filter((c) => filtro === 'todos' || (filtro === 'visitados' ? c.visitado : !c.visitado))}
          dia={dia}
          onChange={setDia}
          className={diasClassName}
        />
      )}
    </>
  )
  const nota = term ? (
    <p className="px-1 text-xs text-muted">
      {enLista.length === 1 ? '1 cliente encontrado' : `${enLista.length} clientes encontrados`} · se busca en todos, sin filtros
    </p>
  ) : null
  const vacio = term ? `No encontramos clientes que coincidan con “${q.trim()}”.` : 'No hay clientes con este filtro.'

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
          {buscador(false)}
          {term ? nota : filtros(undefined, 'flex-wrap')}
        </div>
        <ListaMapa
          clientes={enLista}
          selectedKey={selectedKey}
          onElegir={elegir}
          vacio={vacio}
          className="flex-1 overflow-y-auto p-2"
        />
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
            clientes={enMapa}
            me={position}
            selectedKey={selectedKey}
            onSelect={(key) => setParam({ c: key })}
            bottomInset={isDesktop ? 0 : bottomHeight}
            compass={compass}
            className="absolute inset-0"
          />
        </Suspense>

        {/* Buscador, filtros y lista (móvil) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
          <div className="pointer-events-auto space-y-2 rounded-2xl border border-line bg-card/95 p-2 shadow-float backdrop-blur">
            {buscador(true)}
            {term ? nota : filtros('bg-soft/70', 'px-1 pb-0.5')}
            {(term || lista) && (
              <ListaMapa
                clientes={enLista}
                selectedKey={selectedKey}
                onElegir={elegir}
                vacio={vacio}
                className="max-h-[45dvh] overflow-y-auto border-t border-line pt-1"
              />
            )}
          </div>
        </div>

        {/* Botones flotantes + tarjeta inferior */}
        <div
          ref={bottomRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-end gap-3 p-3 lg:items-center lg:pb-6"
        >
          {/* En el teléfono se ocultan mientras está abierta la lista (para no taparla). */}
          <div
            className={cn(
              'pointer-events-auto flex flex-col gap-2 lg:absolute lg:right-3 lg:bottom-6',
              (term || lista) && 'max-lg:hidden',
            )}
          >
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
              <SelectedCard key={selected.key} cliente={selected} onClose={() => setParam({ c: null })} />
            ) : (
              <HintCard nearest={nearest} sinUbicacion={sinUbicacion} onSelect={(key) => setParam({ c: key })} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
