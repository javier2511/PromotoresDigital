import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, Download, FileSpreadsheet, RefreshCw, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { toast } from 'sonner'
import { ErrorState } from '../components/ErrorState'
import { PageTitle } from '../components/PageHeader'
import { GraficaVisitas } from '../components/tablero/GraficaVisitas'
import { Alert } from '../components/ui/Alert'
import { Card } from '../components/ui/Card'
import { cn } from '../components/ui/cn'
import { EmptyState } from '../components/ui/EmptyState'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Skeleton } from '../components/ui/Skeleton'
import { Spinner } from '../components/ui/Spinner'
import { RADIO_VISITA_M } from '../config/app'
import { leerTablaCompleta } from '../data/descargas'
import { useSchema } from '../data/hooks'
import {
  calcularIndicadores,
  columnaLlave,
  fetchTablero,
  porBarra,
  porPromotor,
  type FilaPromotor,
  type Indicadores,
} from '../data/tablero'
import { aCsv, descargarArchivo } from '../lib/csv'
import { friendlyError } from '../lib/errors'
import { formatoDecimal, formatoEntero, formatoMetros, formatoMinutos, porcentaje } from '../lib/formato'
import { etiquetaPeriodo, hoyLocal, moverPeriodo, partesPeriodo, rangoDe, type Periodo } from '../lib/periodos'
import { esAdmin, type ResolvedTable, type SchemaContext } from '../lib/schema-resolver'
import { plural } from '../lib/text'
import { useUser } from '../providers/AuthProvider'

/** Valor del filtro para las visitas sin promotor. */
const SIN_PROMOTOR = '__sin__'

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
]

function Indicador({
  titulo,
  valor,
  detalle,
  medidor,
}: {
  titulo: string
  valor: string
  detalle: ReactNode
  /** Porcentaje para la barrita (opcional). */
  medidor?: number
}) {
  return (
    <Card className="p-4">
      {/* Título de dos líneas fijas: así los números de una misma fila quedan alineados. */}
      <p className="line-clamp-2 min-h-9 text-[13px] leading-[18px] font-medium text-muted">{titulo}</p>
      <p className="mt-2 text-[28px] leading-none font-bold tracking-tight">{valor}</p>
      {medidor !== undefined && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-soft" aria-hidden>
          <div className="h-full rounded-full bg-viz-compra" style={{ width: `${medidor}%` }} />
        </div>
      )}
      <p className="mt-2 text-xs leading-snug text-muted">{detalle}</p>
    </Card>
  )
}

function Indicadores8({ ind }: { ind: Indicadores }) {
  const pctCompra = porcentaje(ind.conCompra, ind.visitas)
  const divisores = `${plural(ind.dias, 'día')} ÷ ${plural(ind.promotores, 'promotor', 'promotores')}`
  const promedioDe = (n: number) => (n ? `Promedio de ${plural(n, 'visita')}` : 'Sin hora de inicio y fin')
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Indicador titulo="Visitas realizadas" valor={formatoEntero(ind.visitas)} detalle="Visitas distintas" />
      <Indicador
        titulo="Visitas con compra autogestionada"
        valor={formatoEntero(ind.conCompra)}
        detalle={`${pctCompra}% de las visitas`}
        medidor={pctCompra}
      />
      <Indicador
        titulo="Visitas diarias por figura"
        valor={formatoDecimal(ind.diarias)}
        detalle={`${formatoEntero(ind.visitas)} ÷ ${divisores}`}
      />
      <Indicador
        titulo="Visitas diarias por figura con compra"
        valor={formatoDecimal(ind.diariasConCompra)}
        detalle={`${formatoEntero(ind.conCompra)} ÷ ${divisores}`}
      />
      <Indicador
        titulo="Tiempo visita"
        valor={formatoMinutos(ind.tiempoVisita.valor)}
        detalle={promedioDe(ind.tiempoVisita.n)}
      />
      <Indicador
        titulo="Tiempo visita con compra"
        valor={formatoMinutos(ind.tiempoVisitaConCompra.valor)}
        detalle={promedioDe(ind.tiempoVisitaConCompra.n)}
      />
      <Indicador
        titulo="Tiempo nueva visita"
        valor={formatoMinutos(ind.tiempoNuevaVisita.valor)}
        detalle={ind.tiempoNuevaVisita.n ? 'De que termina una visita a que empieza la siguiente' : 'Sin visitas seguidas con hora de fin'}
      />
      <Indicador
        titulo="Geoeficiencia"
        valor={formatoMetros(ind.distancia.valor)}
        detalle={
          ind.distancia.n
            ? `Distancia promedio al check-in · ${porcentaje(ind.dentroRadio, ind.distancia.n)}% a ${RADIO_VISITA_M} m o menos`
            : 'Sin distancia de check-in'
        }
      />
    </div>
  )
}

function TablaPromotores({
  filas,
  seleccionado,
  onSeleccionar,
}: {
  filas: FilaPromotor[]
  seleccionado: string
  onSeleccionar: (id: string) => void
}) {
  const th = 'px-3 py-2 text-right font-medium whitespace-nowrap'
  const td = 'px-3 py-2.5 text-right whitespace-nowrap'
  return (
    <Card className="mt-3 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line px-4 py-3">
        <h2 className="font-semibold">Por promotor</h2>
        <p className="text-xs text-muted">
          Toca un nombre para ver solo sus visitas<span className="lg:hidden"> · desliza para ver más</span>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="sticky left-0 bg-card px-4 py-2 text-left font-medium">Promotor</th>
              <th className={th}>Visitas</th>
              <th className={th}>Con compra</th>
              <th className={th}>Días</th>
              <th className={th}>Visitas por día</th>
              <th className={th}>Tiempo visita</th>
              <th className={th}>Tiempo nueva visita</th>
              <th className={th}>Geoeficiencia</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {filas.map((f) => {
              const id = f.id ?? SIN_PROMOTOR
              const activo = seleccionado === id
              const i = f.indicadores
              const fondo = activo ? 'bg-brand-50 dark:bg-brand-950/40' : 'bg-card group-hover:bg-soft'
              return (
                <tr
                  key={id}
                  onClick={() => onSeleccionar(activo ? '' : id)}
                  className={cn('group cursor-pointer border-b border-line last:border-0', !i.visitas && 'text-muted')}
                >
                  <td className={cn('sticky left-0 px-4 py-2.5', fondo)}>
                    <button
                      type="button"
                      aria-pressed={activo}
                      className="max-w-44 truncate text-left font-semibold"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSeleccionar(activo ? '' : id)
                      }}
                    >
                      {f.nombre}
                    </button>
                  </td>
                  <td className={cn(td, fondo)}>{formatoEntero(i.visitas)}</td>
                  <td className={cn(td, fondo)}>
                    {formatoEntero(i.conCompra)}
                    {i.visitas > 0 && <span className="text-muted"> · {porcentaje(i.conCompra, i.visitas)}%</span>}
                  </td>
                  <td className={cn(td, fondo)}>{i.dias}</td>
                  <td className={cn(td, fondo)}>{formatoDecimal(i.diarias)}</td>
                  <td className={cn(td, fondo)}>{formatoMinutos(i.tiempoVisita.valor)}</td>
                  <td className={cn(td, fondo)}>{formatoMinutos(i.tiempoNuevaVisita.valor)}</td>
                  <td className={cn(td, fondo)}>{formatoMetros(i.distancia.valor)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function BotonDescarga({ tabla, titulo }: { tabla: ResolvedTable; titulo: string }) {
  const [avance, setAvance] = useState<{ leidas: number; total: number | null } | null>(null)
  const nombre = tabla.table

  const descargar = async () => {
    if (!nombre) return
    setAvance({ leidas: 0, total: null })
    try {
      const filas = await leerTablaCompleta(nombre, columnaLlave(tabla), (leidas, total) => setAvance({ leidas, total }))
      if (filas.length === 0) {
        toast.info(`${titulo}: la tabla no tiene filas que puedas ver.`)
        return
      }
      descargarArchivo(`${nombre}_${hoyLocal()}.csv`, aCsv(filas))
      toast.success(`${titulo}: ${plural(filas.length, 'fila')} descargadas`)
    } catch (error) {
      toast.error(`No se pudo descargar ${titulo.toLowerCase()}`, { description: friendlyError(error) })
    } finally {
      setAvance(null)
    }
  }

  return (
    <button
      type="button"
      onClick={descargar}
      disabled={!nombre || avance !== null}
      className="flex items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-3 text-left transition hover:bg-soft disabled:cursor-default disabled:hover:bg-card"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
        <FileSpreadsheet className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{titulo}</span>
        <span className="block truncate text-xs text-muted tabular-nums">
          {!nombre
            ? 'No se encontró la tabla'
            : avance
              ? `Descargando… ${formatoEntero(avance.leidas)}${avance.total !== null ? ` de ${formatoEntero(avance.total)}` : ''} filas`
              : `${nombre}.csv`}
        </span>
      </span>
      {avance ? <Spinner className="size-5 text-muted" /> : <Download className="size-5 shrink-0 text-muted" />}
    </button>
  )
}

function Descargas({ ctx }: { ctx: SchemaContext }) {
  return (
    <Card id="descargas" className="mt-6 scroll-mt-6 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Download className="size-4" /> Descargar tablas completas
      </h2>
      <p className="mt-1 text-sm text-muted">Todas las filas de Supabase, sin filtros, en un archivo que se abre en Excel.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <BotonDescarga tabla={ctx.tables.resultados} titulo="Resultados de visitas" />
        <BotonDescarga tabla={ctx.tables.respuestas} titulo="Respuestas" />
      </div>
      <p className="mt-3 text-xs text-muted">
        Si solo salen tus propias respuestas, ejecuta una vez supabase/11_admin_tablero.sql en Supabase.
      </p>
    </Card>
  )
}

/** Solo administradores: indicadores de las visitas (resultados_visitas + visitas). */
export function TableroPage() {
  const user = useUser()
  const { data: ctx, isPending: ctxPending } = useSchema()
  const hoy = hoyLocal()
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [ancla, setAncla] = useState(hoy)
  const [promotor, setPromotor] = useState('')
  const rango = useMemo(() => rangoDe(periodo, ancla), [periodo, ancla])
  const admin = esAdmin(ctx)
  const tabla = ctx?.tables.resultados.table

  const query = useQuery({
    queryKey: ['tablero', user.id, rango.desde, rango.hasta],
    queryFn: () => fetchTablero(ctx!, rango),
    enabled: Boolean(ctx && admin && tabla),
    staleTime: 2 * 60_000,
    // Al cambiar de periodo se ve el anterior (atenuado) mientras llega el nuevo.
    placeholderData: keepPreviousData,
  })
  const datos = query.data

  const delPeriodo = useMemo(
    () => datos?.visitas.filter((v) => v.dia !== null && v.dia >= datos.rango.desde && v.dia < datos.rango.hasta) ?? [],
    [datos],
  )
  const filas = useMemo(() => porPromotor(delPeriodo, datos?.promotores ?? []), [delPeriodo, datos])
  const visibles = useMemo(
    () => (promotor ? delPeriodo.filter((v) => (v.promotor ?? SIN_PROMOTOR) === promotor) : delPeriodo),
    [delPeriodo, promotor],
  )
  const indicadores = useMemo(() => calcularIndicadores(visibles), [visibles])
  const barras = useMemo(() => (datos ? porBarra(visibles, datos.rango) : []), [visibles, datos])

  // Opciones del filtro: los de la tabla (con visitas o activos), por nombre; y el elegido aunque no esté.
  const opciones = useMemo(() => {
    const lista = filas.map((f) => ({ id: f.id ?? SIN_PROMOTOR, nombre: f.nombre }))
    if (promotor && !lista.some((o) => o.id === promotor)) {
      const p = datos?.promotores.find((x) => x.id === promotor)
      lista.push({ id: promotor, nombre: p?.nombre ?? promotor })
    }
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [filas, promotor, datos])

  if (ctxPending) return null
  if (!admin) return <Navigate to="/" replace />

  const siguiente = moverPeriodo(periodo, ancla, 1)
  const hayFuturo = rangoDe(periodo, siguiente).desde <= hoy
  const esActual = rango.desde <= hoy && hoy < rango.hasta
  const periodoTexto = partesPeriodo(rango, hoy)
  const cargandoOtro = query.isFetching && query.isPlaceholderData

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
      <PageTitle
        title="Tablero"
        subtitle="Resultados de las visitas"
        actions={
          <>
            <button
              type="button"
              onClick={() => document.getElementById('descargas')?.scrollIntoView({ behavior: 'smooth' })}
              aria-label="Descargar tablas"
              className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-card hover:text-fg"
            >
              <Download className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => query.refetch()}
              aria-label="Actualizar"
              className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-card hover:text-fg"
            >
              <RefreshCw className={cn('size-5', query.isFetching && 'animate-spin')} />
            </button>
          </>
        }
      />

      {/* Filtros: arriba de todo lo que cambian. */}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={promotor}
          onChange={(e) => setPromotor(e.target.value)}
          aria-label="Promotor"
          className="h-11 min-w-0 rounded-xl border border-line bg-card px-3 text-[16px] text-fg outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 sm:w-64"
        >
          <option value="">Todos los promotores</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
        <SegmentedControl label="Periodo" value={periodo} onChange={setPeriodo} options={PERIODOS} className="sm:w-72" />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setAncla(moverPeriodo(periodo, ancla, -1))}
          aria-label="Periodo anterior"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg hover:bg-soft"
        >
          <ChevronLeft className="size-5" />
        </button>
        <label
          title={etiquetaPeriodo(rango, hoy)}
          className="relative flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 hover:bg-soft sm:max-w-80"
        >
          <CalendarDays className="size-4 shrink-0 text-muted" />
          <span className="flex min-w-0 flex-col items-start leading-tight">
            {periodoTexto.detalle && <span className="text-[11px] font-medium text-muted">{periodoTexto.detalle}</span>}
            <span className="truncate text-[15px] font-semibold">{periodoTexto.titulo}</span>
          </span>
          <input
            type="date"
            value={ancla}
            max={hoy}
            onChange={(e) => e.target.value && setAncla(e.target.value)}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker()
              } catch {
                /* el navegador abre su selector */
              }
            }}
            aria-label="Elegir fecha"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <button
          type="button"
          onClick={() => setAncla(siguiente)}
          disabled={!hayFuturo}
          aria-label="Periodo siguiente"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg hover:bg-soft disabled:opacity-40 disabled:hover:bg-card"
        >
          <ChevronRight className="size-5" />
        </button>
        {!esActual && (
          <button
            type="button"
            onClick={() => setAncla(hoy)}
            className="h-11 shrink-0 rounded-xl border border-line bg-card px-4 text-sm font-semibold hover:bg-soft"
          >
            Hoy
          </button>
        )}
      </div>

      {!tabla ? (
        <EmptyState icon={FileSpreadsheet} title="No se encontró la tabla de resultados">
          El tablero lee la tabla resultados_visitas de Supabase. Revisa en Perfil → Verificar conexión.
        </EmptyState>
      ) : query.isError && !datos ? (
        <div className="mt-5">
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </div>
      ) : !datos ? (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className={cn('transition-opacity', cargandoOtro && 'opacity-50')} aria-busy={cargandoOtro}>
          {!datos.conVisita && (
            <Alert tone="warning" icon={<TriangleAlert />} className="mt-4">
              La tabla de resultados no tiene la columna id_visita: sin ella no se pueden calcular los tiempos ni la distancia.
            </Alert>
          )}
          {datos.sinDetalle > 0 && (
            <Alert tone="warning" icon={<TriangleAlert />} className="mt-4">
              {datos.sinDetalle === 1
                ? '1 visita de resultados_visitas no aparece en la tabla visitas, así que no tiene tiempos ni distancia.'
                : `${formatoEntero(datos.sinDetalle)} visitas de resultados_visitas no aparecen en la tabla visitas, así que no tienen tiempos ni distancia.`}{' '}
              Si aún no lo haces, ejecuta supabase/11_admin_tablero.sql en Supabase.
            </Alert>
          )}
          {visibles.length === 0 ? (
            <Card className="mt-4">
              <EmptyState icon={CalendarDays} title="Sin visitas en este periodo">
                {promotor ? 'Prueba con otro promotor u otra fecha.' : 'Prueba con otra fecha.'}
              </EmptyState>
            </Card>
          ) : (
            <>
              <Indicadores8 ind={indicadores} />
              <GraficaVisitas barras={barras} rango={datos.rango} hoy={hoy} />
            </>
          )}
          {filas.length > 0 && delPeriodo.length > 0 && (
            <TablaPromotores filas={filas} seleccionado={promotor} onSeleccionar={setPromotor} />
          )}
        </div>
      )}

      {ctx && <Descargas ctx={ctx} />}
    </div>
  )
}
