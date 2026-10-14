import { ArrowDownAZ, Navigation, PartyPopper, RefreshCw, Search, Store, X } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { ClienteCard } from '../components/ClienteCard'
import { ErrorState } from '../components/ErrorState'
import { LocationBanner } from '../components/LocationBanner'
import { PageTitle } from '../components/PageHeader'
import { cn } from '../components/ui/cn'
import { EmptyState } from '../components/ui/EmptyState'
import { ProgressRing } from '../components/ui/ProgressRing'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Skeleton } from '../components/ui/Skeleton'
import { RADIO_VISITA_M } from '../config/app'
import { useClientes, useSchema, type ClienteConDistancia, type Progreso } from '../data/hooks'
import { draftClienteKeys } from '../lib/draft'
import { normalize } from '../lib/text'
import { useUser } from '../providers/AuthProvider'
import { useGeo } from '../providers/GeoProvider'

type Filtro = 'pendientes' | 'visitados' | 'todos'
type Orden = 'cercania' | 'nombre'

const fechaFormato = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

function fechaHoy(): string {
  const texto = fechaFormato.format(new Date())
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function saludo(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function ProgressHero({ progreso }: { progreso: Progreso }) {
  const pct = Math.round(progreso.ratio * 100)
  return (
    <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-brand-600 via-brand-700 to-brand-900 p-5 text-white shadow-float shadow-brand-900/20">
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/10 blur-xl" />
      <div className="relative flex items-center gap-5">
        <ProgressRing value={progreso.ratio} size={92} stroke={9} className="text-white" trackClassName="opacity-25">
          <div className="text-center leading-none">
            <span className="text-2xl font-bold tabular-nums">{pct}</span>
            <span className="text-sm font-semibold">%</span>
          </div>
        </ProgressRing>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white/75">Avance de visitas</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">
            {progreso.visitados} <span className="text-lg font-semibold text-white/70">de {progreso.total}</span>
          </p>
          <p className="mt-1 text-sm text-white/80">
            {progreso.pendientes === 0
              ? '¡Completaste todos tus clientes!'
              : `${progreso.pendientes} ${progreso.pendientes === 1 ? 'cliente pendiente' : 'clientes pendientes'}`}
          </p>
        </div>
      </div>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3.5 rounded-2xl border border-line bg-card p-3.5">
          <Skeleton className="size-12 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ClientesPage() {
  const user = useUser()
  const { data: ctx } = useSchema()
  const { clientes, progreso, isPending, isFetching, error, refetch } = useClientes()
  const { position } = useGeo()
  const [params, setParams] = useSearchParams()

  const filtro = (params.get('f') as Filtro) || 'pendientes'
  const q = params.get('q') ?? ''
  const orden: Orden = (params.get('o') as Orden) || (position ? 'cercania' : 'nombre')

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

  const enCurso = useMemo(() => draftClienteKeys(user.id), [user.id])

  const lista = useMemo(() => {
    if (!clientes) return []
    const term = normalize(q)
    const filtered = clientes.filter((c) => {
      if (filtro === 'pendientes' && c.visitado) return false
      if (filtro === 'visitados' && !c.visitado) return false
      if (!term) return true
      return [c.nombre, c.direccion, c.codigo, c.telefono].some((v) => v && normalize(v).includes(term))
    })
    const byName = (a: ClienteConDistancia, b: ClienteConDistancia) => a.nombre.localeCompare(b.nombre, 'es')
    return filtered.sort((a, b) => {
      if (orden === 'cercania') {
        if (a.distance === null && b.distance === null) return byName(a, b)
        if (a.distance === null) return 1
        if (b.distance === null) return -1
        return a.distance - b.distance
      }
      return byName(a, b)
    })
  }, [clientes, filtro, q, orden])

  const nombre =
    ctx?.perfil?.nombre?.split(' ')[0] ??
    (user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ??
    user.email?.split('@')[0].split(/[._-]/)[0]

  const masCercanoKey =
    orden === 'cercania' && filtro !== 'visitados' && !q
      ? lista.find((c) => !c.visitado && c.distance !== null)?.key
      : undefined

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6">
      <PageTitle
        title={
          <>
            {saludo()}
            {nombre ? <span className="capitalize">, {nombre}</span> : null}
          </>
        }
        subtitle={fechaHoy()}
        actions={
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Actualizar"
            className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-card hover:text-fg"
          >
            <RefreshCw className={cn('size-5', isFetching && 'animate-spin')} />
          </button>
        }
      />

      <div className="mt-5 space-y-3">
        {progreso && progreso.total > 0 && <ProgressHero progreso={progreso} />}
        <LocationBanner />
      </div>

      {/* Barra de búsqueda y filtros (fija al desplazar) */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 space-y-2.5 bg-bg/90 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="flex gap-2">
          <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15">
            <Search className="size-5 text-muted" />
            <input
              type="search"
              value={q}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder="Buscar cliente, dirección…"
              aria-label="Buscar clientes"
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted/70"
            />
            {q && (
              <button type="button" aria-label="Limpiar búsqueda" onClick={() => setParam('q', null)}>
                <X className="size-4 text-muted" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setParam('o', orden === 'cercania' ? 'nombre' : 'cercania')}
            disabled={!position && orden === 'nombre'}
            title={orden === 'cercania' ? 'Ordenado por cercanía' : 'Ordenado por nombre'}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg transition hover:bg-soft disabled:opacity-50"
          >
            {orden === 'cercania' ? <Navigation className="size-4 text-brand-600" /> : <ArrowDownAZ className="size-4" />}
            <span className="hidden sm:inline">{orden === 'cercania' ? 'Cercanía' : 'Nombre'}</span>
          </button>
        </div>
        <SegmentedControl<Filtro>
          label="Filtrar clientes"
          value={filtro}
          onChange={(v) => setParam('f', v === 'pendientes' ? null : v)}
          options={[
            { value: 'pendientes', label: 'Pendientes', count: progreso?.pendientes },
            { value: 'visitados', label: 'Visitados', count: progreso?.visitados },
            { value: 'todos', label: 'Todos', count: progreso?.total },
          ]}
        />
      </div>

      <div className="pb-6">
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isPending ? (
          <ListSkeleton />
        ) : progreso?.total === 0 ? (
          <EmptyState icon={Store} title="Aún no tienes clientes asignados">
            Cuando tu administrador te asigne clientes aparecerán aquí.
          </EmptyState>
        ) : lista.length === 0 ? (
          q ? (
            <EmptyState icon={Search} title="Sin resultados">
              No encontramos clientes que coincidan con “{q}”.
            </EmptyState>
          ) : filtro === 'pendientes' ? (
            <EmptyState icon={PartyPopper} tone="success" title="¡Terminaste!">
              Visitaste a todos tus clientes. Excelente trabajo.
            </EmptyState>
          ) : (
            <EmptyState icon={Store} title="Todavía no hay visitas">
              Los clientes que visites aparecerán aquí.
            </EmptyState>
          )
        ) : (
          <ul className="space-y-2.5">
            {lista.map((c) => (
              <li key={c.key}>
                <ClienteCard
                  cliente={c}
                  enCurso={enCurso.has(c.key)}
                  destacado={c.key === masCercanoKey}
                  radio={RADIO_VISITA_M}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
