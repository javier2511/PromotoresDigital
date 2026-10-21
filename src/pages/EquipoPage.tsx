import { useQuery } from '@tanstack/react-query'
import { CircleCheck, Clock, MapPin, RefreshCw, Sunrise, TriangleAlert, Users } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { ErrorState } from '../components/ErrorState'
import { PageTitle } from '../components/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { cn } from '../components/ui/cn'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { Spinner } from '../components/ui/Spinner'
import { enlaceMapa, fetchEquipo, type MiembroEquipo } from '../data/equipo'
import { useSchema, type ClienteConDistancia } from '../data/hooks'
import { fechaLocal } from '../data/jornada'
import type { LatLng } from '../lib/geo'
import { esAdmin } from '../lib/schema-resolver'
import { useUser } from '../providers/AuthProvider'

const ClientMap = lazy(() => import('../components/map/ClientMap'))

const horaFormato = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' })
const hora = (iso: string) => horaFormato.format(new Date(iso))

function duracion(desde: string, hasta: string | number): string {
  const min = Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000))
  const h = Math.floor(min / 60)
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`
}

function Ubicacion({ punto, precision, etiqueta }: { punto: LatLng | null; precision: number | null; etiqueta: string }) {
  if (!punto) return <span className="text-sm text-muted">{etiqueta}: sin ubicación</span>
  return (
    <a
      href={enlaceMapa(punto)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
    >
      <MapPin className="size-4" /> {etiqueta}
      {precision !== null && <span className="font-normal text-muted">(±{precision} m)</span>}
    </a>
  )
}

function MiembroCard({ m, esHoy, seleccionado, ahora }: { m: MiembroEquipo; esHoy: boolean; seleccionado: boolean; ahora: number }) {
  const j = m.jornada
  return (
    <Card
      id={`m-${m.id}`}
      className={cn('scroll-mt-24 p-4 transition', seleccionado && 'ring-2 ring-brand-500')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold">{m.nombre}</p>
          {m.correo && m.correo !== m.nombre && <p className="truncate text-sm text-muted">{m.correo}</p>}
        </div>
        {!j ? (
          <Badge>Sin iniciar</Badge>
        ) : j.fin ? (
          <Badge tone="success">Terminó</Badge>
        ) : (
          <Badge tone="warning">{esHoy ? 'En curso' : 'Sin salida'}</Badge>
        )}
      </div>
      {j && (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-soft px-2 py-2">
              <dt className="text-xs text-muted">Entrada</dt>
              <dd className="font-semibold tabular-nums">{hora(j.inicio)}</dd>
            </div>
            <div className="rounded-xl bg-soft px-2 py-2">
              <dt className="text-xs text-muted">Salida</dt>
              <dd className="font-semibold tabular-nums">{j.fin ? hora(j.fin) : '—'}</dd>
            </div>
            <div className="rounded-xl bg-soft px-2 py-2">
              <dt className="text-xs text-muted">Duración</dt>
              <dd className="font-semibold tabular-nums">
                {j.fin ? duracion(j.inicio, j.fin) : esHoy ? duracion(j.inicio, ahora) : '—'}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <Ubicacion punto={j.entrada} precision={j.precisionEntrada} etiqueta="Ver entrada" />
            {j.fin && <Ubicacion punto={j.salida} precision={j.precisionSalida} etiqueta="Ver salida" />}
          </div>
        </>
      )}
    </Card>
  )
}

/** Solo administradores: jornadas del día de todos los promotores. */
export function EquipoPage() {
  const user = useUser()
  const { data: ctx, isPending: ctxPending } = useSchema()
  const hoy = fechaLocal()
  const [fecha, setFecha] = useState(hoy)
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  // Para la duración de las jornadas en curso.
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const admin = esAdmin(ctx)
  const tabla = ctx?.tables.jornadas.table

  const query = useQuery({
    queryKey: ['equipo', user.id, fecha],
    queryFn: () => fetchEquipo(ctx!, fecha),
    enabled: Boolean(ctx && admin && tabla),
    staleTime: 60_000,
    refetchInterval: fecha === hoy ? 2 * 60_000 : false,
  })

  const miembros = query.data?.miembros
  const resumen = useMemo(() => {
    const lista = miembros ?? []
    const iniciaron = lista.filter((m) => m.jornada).length
    const terminaron = lista.filter((m) => m.jornada?.fin).length
    return { total: lista.length, iniciaron, terminaron, enCurso: iniciaron - terminaron, sinIniciar: lista.length - iniciaron }
  }, [miembros])

  // Puntos de entrada en el mapa: rojo = en curso, verde = terminó.
  const puntos = useMemo<ClienteConDistancia[]>(
    () =>
      (miembros ?? [])
        .filter((m) => m.jornada?.entrada)
        .map((m) => ({
          id: m.id,
          key: String(m.id),
          nombre: m.nombre,
          direccion: null,
          telefono: null,
          codigo: null,
          location: m.jornada!.entrada,
          visitado: Boolean(m.jornada!.fin),
          reseteado: null,
          saldo: null,
          dias: [],
          asignacion: null,
          raw: {},
          distance: null,
        })),
    [miembros],
  )

  if (ctxPending) return null
  if (!admin) return <Navigate to="/" replace />

  const seleccionar = (key: string | null) => {
    setSeleccionado(key)
    if (key) document.getElementById(`m-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
      <PageTitle
        title="Equipo"
        subtitle="Jornadas de los promotores"
        actions={
          <button
            type="button"
            onClick={() => query.refetch()}
            aria-label="Actualizar"
            className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-card hover:text-fg"
          >
            <RefreshCw className={cn('size-5', query.isFetching && 'animate-spin')} />
          </button>
        }
      />

      <div className="mt-5 flex items-center gap-2">
        <input
          type="date"
          value={fecha}
          max={hoy}
          onChange={(e) => e.target.value && setFecha(e.target.value)}
          aria-label="Fecha"
          className="h-11 rounded-xl border border-line bg-card px-3 text-[16px] text-fg outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
        />
        {fecha !== hoy && (
          <button
            type="button"
            onClick={() => setFecha(hoy)}
            className="h-11 rounded-xl border border-line bg-card px-4 text-sm font-semibold hover:bg-soft"
          >
            Hoy
          </button>
        )}
      </div>

      {!tabla ? (
        <EmptyState icon={Sunrise} title="Aún no hay jornadas">
          Ejecuta supabase/06_jornadas.sql en Supabase para que los promotores registren su jornada.
        </EmptyState>
      ) : query.isError ? (
        <div className="mt-5">
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </div>
      ) : query.isPending ? (
        <div className="mt-5 space-y-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : (
        <>
          {query.data.promotoresVisibles <= 1 && (
            <Alert tone="warning" icon={<TriangleAlert />} className="mt-5">
              Solo puedes ver tu propia fila de promotores. Ejecuta supabase/10_admin_jornadas.sql para que los
              administradores vean las jornadas de todo el equipo.
            </Alert>
          )}

          <Card className="mt-5 grid grid-cols-3 divide-x divide-line overflow-hidden text-center">
            <div className="p-3.5">
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
                <Clock className="size-3.5" /> Iniciaron
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {resumen.iniciaron}
                <span className="text-base font-semibold text-muted"> de {resumen.total}</span>
              </p>
            </div>
            <div className="p-3.5">
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
                <CircleCheck className="size-3.5" /> Terminaron
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">{resumen.terminaron}</p>
            </div>
            <div className="p-3.5">
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
                <Users className="size-3.5" /> Sin iniciar
              </p>
              <p className="mt-1 text-2xl font-bold text-brand-600 tabular-nums dark:text-brand-400">{resumen.sinIniciar}</p>
            </div>
          </Card>

          {puntos.length > 0 && (
            <Card className="mt-3 overflow-hidden">
              <div className="relative h-72">
                <Suspense
                  fallback={
                    <div className="absolute inset-0 grid place-items-center bg-soft">
                      <Spinner className="size-6 text-brand-600" />
                    </div>
                  }
                >
                  <ClientMap
                    clientes={puntos}
                    me={null}
                    selectedKey={seleccionado}
                    onSelect={seleccionar}
                    className="absolute inset-0"
                  />
                </Suspense>
              </div>
              <p className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-muted">
                Dónde iniciaron:
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-brand-600" /> En curso
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-emerald-500" /> Terminó
                </span>
              </p>
            </Card>
          )}

          {query.data.miembros.length === 0 ? (
            <EmptyState icon={Users} title="No hay promotores">
              Los usuarios con rol "promotor" en la tabla promotores aparecerán aquí.
            </EmptyState>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {query.data.miembros.map((m) => (
                <MiembroCard key={String(m.id)} m={m} esHoy={fecha === hoy} seleccionado={seleccionado === String(m.id)} ahora={ahora} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
