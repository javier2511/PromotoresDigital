import { ArrowDownAZ, CalendarDays, Navigation, PartyPopper, RefreshCw, Search, Store, X } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { ClienteCard } from '../components/ClienteCard'
import { ErrorState } from '../components/ErrorState'
import { FiltroDias } from '../components/FiltroDias'
import { JornadaCard } from '../components/JornadaCard'
import { LocationBanner } from '../components/LocationBanner'
import { LogoutButton } from '../components/LogoutButton'
import { cn } from '../components/ui/cn'
import { EmptyState } from '../components/ui/EmptyState'
import { ProgressRing } from '../components/ui/ProgressRing'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Skeleton } from '../components/ui/Skeleton'
import { RADIO_VISITA_M } from '../config/app'
import { semanaDeAsignaciones } from '../data/clientes'
import { useClientes, useSchema, type ClienteConDistancia, type Progreso } from '../data/hooks'
import { DIAS } from '../lib/dias'
import { filtrarPorDia, SIN_DIA, useFiltroDia } from '../lib/filtro-dia'
import { hoyLocal, partesPeriodo } from '../lib/periodos'
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

function ProgressHero({ progreso, semana }: { progreso: Progreso; semana: string | null }) {
  const pct = Math.round(progreso.ratio * 100)
  return (
    <div className="rounded-3xl border border-line bg-card p-5 shadow-float shadow-brand-900/10">
      <div className="flex items-center gap-5">
        <ProgressRing value={progreso.ratio} size={92} stroke={9} className="text-brand-600" trackClassName="opacity-15">
          <div className="text-center leading-none">
            <span className="text-2xl font-bold tabular-nums">{pct}</span>
            <span className="text-sm font-semibold">%</span>
          </div>
        </ProgressRing>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{semana ? 'Avance de la semana' : 'Avance de visitas'}</p>
          {semana && <p className="text-xs text-muted">{semana}</p>}
          <p className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">
            {progreso.visitados} <span className="text-lg font-semibold text-muted">de {progreso.total}</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            {progreso.pendientes === 0 ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">¡Completaste todos tus clientes!</span>
            ) : (
              <>
                <strong className="font-semibold text-brand-600 dark:text-brand-400">{progreso.pendientes}</strong>{' '}
                {progreso.pendientes === 1 ? 'cliente pendiente' : 'clientes pendientes'}
              </>
            )}
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
  // Solo se cuentan las asignaciones de esta semana (lunes a domingo): "26 oct – 1 nov".
  const semana = ctx ? semanaDeAsignaciones(ctx) : null
  const textoSemana = semana ? partesPeriodo(semana, hoyLocal()).titulo : null
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
  const [dia, setDia] = useFiltroDia()
  const delDia = useMemo(() => filtrarPorDia(clientes ?? [], dia), [clientes, dia])
  const conteos = useMemo(() => {
    const visitados = delDia.filter((c) => c.visitado).length
    return { pendientes: delDia.length - visitados, visitados, todos: delDia.length }
  }, [delDia])
  const nombreDia = dia === null ? null : dia === SIN_DIA ? 'sin día' : DIAS[dia - 1].largo.toLowerCase()

  const lista = useMemo(() => {
    const term = normalize(q)
    const filtered = delDia.filter((c) => {
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
  }, [delDia, filtro, q, orden])

  const nombre =
    ctx?.perfil?.nombre?.split(' ')[0] ??
    (user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ??
    user.email?.split('@')[0].split(/[._-]/)[0]

  const masCercanoKey =
    orden === 'cercania' && filtro !== 'visitados' && !q && dia === null
      ? lista.find((c) => !c.visitado && c.distance !== null)?.key
      : undefined

  return (
    <div>
      {/* Encabezado rojo de la marca */}
      <header className="relative overflow-hidden bg-linear-to-br from-brand-600 via-brand-600 to-brand-800 pt-safe text-white">
        <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-black/10 blur-2xl" />
        <div className="relative mx-auto flex max-w-3xl items-start justify-between gap-3 px-4 pt-6 pb-24 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-[26px] leading-tight font-bold tracking-tight">
              {saludo()}
              {nombre ? <span className="capitalize">, {nombre}</span> : null}
            </h1>
            <p className="mt-1 text-sm text-white/80">{fechaHoy()}</p>
          </div>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => refetch()}
              aria-label="Actualizar"
              className="grid size-10 shrink-0 place-items-center rounded-full text-white/90 transition hover:bg-white/15"
            >
              <RefreshCw className={cn('size-5', isFetching && 'animate-spin')} />
            </button>
            <LogoutButton variant="icono" className="lg:hidden" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="relative -mt-[4.5rem] space-y-3">
          {isPending && !error ? (
            <Skeleton className="h-[132px] rounded-3xl shadow-float" />
          ) : progreso && progreso.total > 0 ? (
            <ProgressHero progreso={progreso} semana={textoSemana} />
          ) : (
            <div className="h-12" />
          )}
          <JornadaCard />
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
                placeholder="Buscar nombre o número…"
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
              { value: 'pendientes', label: 'Pendientes', count: clientes ? conteos.pendientes : undefined },
              { value: 'visitados', label: 'Visitados', count: clientes ? conteos.visitados : undefined },
              { value: 'todos', label: 'Todos', count: clientes ? conteos.todos : undefined },
            ]}
          />
          {clientes && (
            <FiltroDias
              clientes={clientes}
              conteoDe={(clientes ?? []).filter((c) => (filtro === 'pendientes' ? !c.visitado : filtro === 'visitados' ? c.visitado : true))}
              dia={dia}
              onChange={setDia}
              className="-mx-4 px-4 sm:-mx-6 sm:px-6"
            />
          )}
        </div>

        <div className="pb-6">
          {error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : isPending ? (
            <ListSkeleton />
          ) : progreso?.total === 0 ? (
            textoSemana ? (
              <EmptyState icon={CalendarDays} title="No tienes clientes asignados esta semana">
                Semana del {textoSemana}. Cuando tu administrador te asigne clientes para esta semana aparecerán aquí.
              </EmptyState>
            ) : (
              <EmptyState icon={Store} title="Aún no tienes clientes asignados">
                Cuando tu administrador te asigne clientes aparecerán aquí.
              </EmptyState>
            )
          ) : lista.length === 0 ? (
            q ? (
              <EmptyState icon={Search} title="Sin resultados">
                No encontramos clientes que coincidan con “{q}”.
              </EmptyState>
            ) : nombreDia ? (
              <EmptyState
                icon={CalendarDays}
                tone={filtro === 'pendientes' && delDia.length > 0 ? 'success' : undefined}
                title={
                  dia === SIN_DIA
                    ? 'No hay clientes sin día en este filtro'
                    : delDia.length === 0
                      ? `No tienes clientes para el ${nombreDia}`
                      : filtro === 'pendientes'
                        ? `¡Terminaste los clientes del ${nombreDia}!`
                        : `Sin visitas del ${nombreDia} todavía`
                }
              >
                <button type="button" onClick={() => setDia(null)} className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
                  Ver todos los días
                </button>
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
    </div>
  )
}
