import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileClock,
  FileSpreadsheet,
  MapPin,
  RefreshCw,
  ShoppingCart,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { toast } from 'sonner'
import { ErrorState } from '../components/ErrorState'
import { PageTitle } from '../components/PageHeader'
import { EncabezadoTablero } from '../components/tablero/Encabezado'
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
  fetchRespuestasTablero,
  fetchTablero,
  porBarra,
  porPromotor,
  resumenCuestionario,
  type FilaPromotor,
  type FuentesTablero,
  type Indicadores,
  type PreguntaResumen,
  type RespuestaTablero,
  type VisitaTablero,
} from '../data/tablero'
import { aCsv, descargarArchivo } from '../lib/csv'
import { friendlyError } from '../lib/errors'
import { formatoDecimal, formatoEntero, formatoFechaHora, formatoMetros, formatoMinutos, porcentaje } from '../lib/formato'
import {
  deIso,
  DIAS_CORTOS,
  diasDelRango,
  etiquetaPeriodo,
  hoyLocal,
  moverPeriodo,
  partesPeriodo,
  rangoDe,
  type Periodo,
} from '../lib/periodos'
import { useMediaQuery } from '../lib/media'
import { esAdmin, type ResolvedTable, type SchemaContext } from '../lib/schema-resolver'
import { plural } from '../lib/text'
import { useUser } from '../providers/AuthProvider'

/** Valor del filtro para las visitas sin promotor. */
const SIN_PROMOTOR = '__sin__'

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
]

/** "9.01 min"; sin dato, solo "—". */
const conUnidad = (valor: string, unidad: string) => (valor === '—' ? valor : `${valor} ${unidad}`)

/** Filas que se dibujan en la tabla de detalle (el resto está en la descarga). */
const MAX_FILAS_DETALLE = 500

function Chip({ activo, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { activo: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition disabled:cursor-default disabled:opacity-40',
        activo ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-fg hover:bg-soft disabled:hover:bg-card',
        className,
      )}
      {...props}
    >
      {activo && <Check className="size-4" strokeWidth={2.5} />}
      {children}
    </button>
  )
}

/** Tarjeta de indicador como en el reporte: ícono a la izquierda, título arriba y el número abajo. */
function TarjetaKpi({
  icono: Icono,
  insignia: Insignia,
  titulo,
  valor,
  ayuda,
}: {
  icono: LucideIcon
  /** Iconito sobre el principal (p. ej. un reloj sobre el carrito). */
  insignia?: LucideIcon
  titulo: string
  valor: string
  /** Cómo se calculó (se ve al pasar el mouse). */
  ayuda?: string
}) {
  // El número va en la última fila: así los de una misma fila de tarjetas se alinean aunque el título ocupe más
  // líneas. En el teléfono va debajo del ícono, a todo lo ancho; en pantallas grandes, a la derecha del ícono.
  return (
    <Card
      className="grid h-full grid-cols-[auto_minmax(0,1fr)] grid-rows-[1fr_auto] gap-x-3 gap-y-2 p-3.5 sm:p-4"
      title={ayuda}
    >
      <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 sm:row-span-2 sm:size-14 sm:self-center dark:bg-brand-950/60 dark:text-brand-300">
        <Icono className="size-5 sm:size-7" strokeWidth={1.8} />
        {Insignia && (
          <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-card ring-2 ring-card">
            <Insignia className="size-3.5" strokeWidth={2.5} />
          </span>
        )}
      </span>
      <p className="text-right text-[12px] leading-tight font-semibold sm:text-[13px]">{titulo}</p>
      <p className="col-span-2 self-end text-[26px] leading-none font-bold tracking-tight sm:col-span-1 sm:text-[28px]">{valor}</p>
    </Card>
  )
}

function Indicadores8({ ind }: { ind: Indicadores }) {
  const divisores = `${plural(ind.dias, 'día')} ÷ ${plural(ind.promotores, 'promotor', 'promotores')}`
  const promedioDe = (n: number) => `Promedio de ${plural(n, 'visita')}`
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <TarjetaKpi icono={Users} titulo="Visitas realizadas" valor={formatoEntero(ind.visitas)} ayuda="Visitas distintas" />
      <TarjetaKpi
        icono={ShoppingCart}
        titulo="Visitas con compra autogestionada"
        valor={formatoEntero(ind.conCompra)}
        ayuda={`${porcentaje(ind.conCompra, ind.visitas)}% de las visitas`}
      />
      <TarjetaKpi
        icono={CalendarDays}
        titulo="Visitas Diarias x Figura"
        valor={formatoDecimal(ind.diarias)}
        ayuda={`${formatoEntero(ind.visitas)} visitas ÷ ${divisores}`}
      />
      <TarjetaKpi
        icono={ShoppingCart}
        insignia={Check}
        titulo="Visitas Diarias x Figura con compra"
        valor={formatoDecimal(ind.diariasConCompra)}
        ayuda={`${formatoEntero(ind.conCompra)} visitas con compra ÷ ${divisores}`}
      />
      <TarjetaKpi
        icono={Clock}
        titulo="Tiempo x Visita (min)"
        valor={formatoMinutos(ind.tiempoVisita.valor)}
        ayuda={promedioDe(ind.tiempoVisita.n)}
      />
      <TarjetaKpi
        icono={ShoppingCart}
        insignia={Clock}
        titulo="Tiempo x Visita con compra (min)"
        valor={formatoMinutos(ind.tiempoVisitaConCompra.valor)}
        ayuda={promedioDe(ind.tiempoVisitaConCompra.n)}
      />
      <TarjetaKpi
        icono={FileClock}
        titulo="Tiempo nueva visita (min)"
        valor={formatoMinutos(ind.tiempoNuevaVisita.valor)}
        ayuda="Promedio entre una visita y la siguiente"
      />
      <TarjetaKpi
        icono={MapPin}
        titulo="Distancia (m) geoeficiencia"
        valor={formatoMetros(ind.distancia.valor)}
        ayuda={
          ind.distancia.n
            ? `Distancia promedio al check-in · ${porcentaje(ind.dentroRadio, ind.distancia.n)}% a ${RADIO_VISITA_M} m o menos`
            : undefined
        }
      />
    </div>
  )
}

/** Una fila por visita (como "Tabla Detalle Visita" del reporte). Tocar una muestra sus respuestas. */
function TablaDetalle({
  visitas,
  nombres,
  seleccionada,
  onSeleccionar,
}: {
  visitas: VisitaTablero[]
  nombres: Map<string, string>
  seleccionada: string | null
  onSeleccionar: (key: string | null) => void
}) {
  const filas = useMemo(
    () => [...visitas].sort((a, b) => (b.momento ?? -Infinity) - (a.momento ?? -Infinity)).slice(0, MAX_FILAS_DETALLE),
    [visitas],
  )
  const ancha = useMediaQuery('(min-width: 1024px)')
  const promotorDe = (v: VisitaTablero) => (v.promotor ? (nombres.get(v.promotor) ?? v.promotor) : '—')
  const compra = (v: VisitaTablero) =>
    v.conCompra ? (
      <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Sí</span>
    ) : (
      <span className="text-xs text-muted">No</span>
    )
  const th = 'px-3 py-2 font-medium'
  const td = 'px-3 py-2 whitespace-nowrap'
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <EncabezadoTablero accion={<span className="shrink-0 text-xs text-white/80">{plural(visitas.length, 'visita')}</span>}>
        Tabla Detalle Visita
      </EncabezadoTablero>
      <div className="max-h-[440px] overflow-auto">
        {ancha ? (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card text-xs text-muted shadow-[inset_0_-1px_0_var(--line)]">
              <tr>
                <th className={cn(th, 'text-left')}>Cliente</th>
                <th className={cn(th, 'text-left')}>Promotor</th>
                <th className={cn(th, 'text-left')}>Fecha visita</th>
                <th className={cn(th, 'text-center')}>Compra</th>
                <th className={cn(th, 'text-right')}>Tiempo (min)</th>
                <th className={cn(th, 'text-right')}>Nueva visita (min)</th>
                <th className={cn(th, 'text-right')}>Distancia (m)</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {filas.map((v) => {
                const activa = v.key === seleccionada
                // Fecha arriba y hora abajo, para que la tabla quepa junto al cuestionario.
                const texto = formatoFechaHora(v.momento)
                const corte = texto.indexOf(' ')
                return (
                  <tr
                    key={v.key}
                    data-visita={v.key}
                    onClick={() => onSeleccionar(activa ? null : v.key)}
                    aria-selected={activa}
                    className={cn(
                      'cursor-pointer border-b border-line last:border-0',
                      activa ? 'bg-brand-50 dark:bg-brand-950/40' : 'hover:bg-soft',
                    )}
                  >
                    <td className={td}>
                      <button
                        type="button"
                        className="block max-w-44 text-left"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSeleccionar(activa ? null : v.key)
                        }}
                      >
                        <span className="block font-semibold">{v.cliente ?? '—'}</span>
                        {v.nombreCliente && <span className="block truncate text-xs text-muted">{v.nombreCliente}</span>}
                      </button>
                    </td>
                    <td className={cn(td, 'max-w-36 truncate')}>{promotorDe(v)}</td>
                    <td className={td}>
                      <span className="block">{corte > 0 ? texto.slice(0, corte) : texto}</span>
                      {corte > 0 && <span className="block text-xs text-muted">{texto.slice(corte + 1)}</span>}
                    </td>
                    <td className={cn(td, 'text-center')}>{compra(v)}</td>
                    <td className={cn(td, 'text-right')}>{formatoMinutos(v.duracion)}</td>
                    <td className={cn(td, 'text-right')}>{formatoMinutos(v.minutosNueva ?? null)}</td>
                    <td className={cn(td, 'text-right')}>{formatoMetros(v.distancia)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <ul className="divide-y divide-line">
            {filas.map((v) => {
              const activa = v.key === seleccionada
              return (
                <li key={v.key}>
                  <button
                    type="button"
                    data-visita={v.key}
                    aria-pressed={activa}
                    onClick={() => onSeleccionar(activa ? null : v.key)}
                    className={cn('block w-full px-4 py-2.5 text-left', activa ? 'bg-brand-50 dark:bg-brand-950/40' : 'active:bg-soft')}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm">
                        <span className="font-semibold">{v.cliente ?? '—'}</span>
                        {v.nombreCliente && <span className="text-muted"> · {v.nombreCliente}</span>}
                      </span>
                      {compra(v)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {promotorDe(v)} · {formatoFechaHora(v.momento)}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted tabular-nums">
                      Tiempo {conUnidad(formatoMinutos(v.duracion), 'min')} · Nueva visita{' '}
                      {conUnidad(formatoMinutos(v.minutosNueva ?? null), 'min')} · {conUnidad(formatoMetros(v.distancia), 'm')}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {visitas.length > MAX_FILAS_DETALLE && (
        <p className="border-t border-line px-4 py-2 text-xs text-muted">
          Se muestran las {formatoEntero(MAX_FILAS_DETALLE)} más recientes de {formatoEntero(visitas.length)}; la tabla completa está
          en "Descargar tablas completas".
        </p>
      )}
    </Card>
  )
}

function ResumenPregunta({ p }: { p: PreguntaResumen }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <p className="text-sm font-semibold">{p.pregunta}</p>
      {p.abierta ? (
        <p className="mt-1 text-sm text-muted">{plural(p.total, 'respuesta escrita', 'respuestas escritas')}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {p.opciones.map((o) => {
            const pct = porcentaje(o.n, p.total)
            return (
              <li key={o.texto} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">{o.texto}</span>
                  <span className="shrink-0 text-muted tabular-nums">
                    {formatoEntero(o.n)} · {pct}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-soft" aria-hidden>
                  <div className="h-full rounded-full bg-viz-compra" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Respuestas del cuestionario: el resumen de las visitas filtradas, o las de la visita elegida. */
function Cuestionario({
  respuestas,
  cargando,
  error,
  visitasFiltradas,
  visita,
  onVerResumen,
}: {
  respuestas: RespuestaTablero[] | undefined
  cargando: boolean
  error: unknown
  visitasFiltradas: VisitaTablero[]
  visita: VisitaTablero | null
  onVerResumen: () => void
}) {
  const ids = useMemo(() => new Set(visitasFiltradas.map((v) => v.key)), [visitasFiltradas])
  const resumen = useMemo(
    () => (respuestas && !visita ? resumenCuestionario(respuestas.filter((r) => ids.has(r.visita))) : []),
    [respuestas, ids, visita],
  )
  const deLaVisita = useMemo(
    () => (respuestas && visita ? respuestas.filter((r) => r.visita === visita.key).sort((a, b) => a.orden - b.orden) : []),
    [respuestas, visita],
  )
  const sinPermiso = (
    <p className="mt-2 text-xs text-muted">
      Si solo ves las respuestas de tus propias visitas, ejecuta una vez supabase/11_admin_tablero.sql en Supabase.
    </p>
  )

  let cuerpo: ReactNode
  if (cargando && !respuestas) {
    cuerpo = (
      <div className="grid place-items-center py-10">
        <Spinner className="size-6 text-brand-600" />
      </div>
    )
  } else if (error && !respuestas) {
    cuerpo = (
      <div className="text-sm">
        <p className="text-red-700 dark:text-red-300">No se pudieron leer las respuestas: {friendlyError(error)}</p>
        {sinPermiso}
      </div>
    )
  } else if (visita) {
    cuerpo = (
      <>
        <p className="text-sm">
          <span className="font-semibold">{visita.nombreCliente ?? visita.cliente ?? 'Visita'}</span>
          <span className="text-muted"> · {formatoFechaHora(visita.momento)}</span>
        </p>
        {deLaVisita.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Esta visita no tiene respuestas guardadas.</p>
        ) : (
          <dl className="mt-2 divide-y divide-line">
            {deLaVisita.map((r, i) => (
              <div key={`${r.pregunta}-${i}`} className="py-2">
                <dt className="text-xs text-muted">{r.pregunta}</dt>
                <dd className="mt-0.5 text-sm font-semibold">{r.respuesta || '—'}</dd>
              </div>
            ))}
          </dl>
        )}
      </>
    )
  } else if (resumen.length === 0) {
    cuerpo = (
      <div className="py-4 text-center text-sm text-muted">
        <p>Sin respuestas para estas visitas.</p>
        {sinPermiso}
      </div>
    )
  } else {
    cuerpo = (
      <>
        <p className="mb-3 text-xs text-muted">
          Resumen de {plural(visitasFiltradas.length, 'visita')} · toca una visita en el detalle para ver sus respuestas
        </p>
        <div className="divide-y divide-line">
          {resumen.map((p) => (
            <ResumenPregunta key={p.pregunta} p={p} />
          ))}
        </div>
      </>
    )
  }

  return (
    <Card id="cuestionario" className="flex min-w-0 scroll-mt-4 flex-col overflow-hidden">
      <EncabezadoTablero
        accion={
          visita && (
            <button
              type="button"
              onClick={onVerResumen}
              className="h-8 shrink-0 rounded-lg px-2 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Ver resumen
            </button>
          )
        }
      >
        Tabla cuestionario
      </EncabezadoTablero>
      <div className="max-h-[440px] overflow-auto p-4">{cuerpo}</div>
    </Card>
  )
}

/** De qué columna de resultados_visitas sale cada dato (para comprobarlo). */
function Fuentes({ tabla, fuentes }: { tabla: string; fuentes: FuentesTablero }) {
  const dato = (etiqueta: string, columna: string | null, sinColumna: string) => (
    <li>
      {etiqueta}:{' '}
      {columna ? (
        <code className="rounded bg-soft px-1 font-mono text-fg">{columna}</code>
      ) : (
        <span className="text-amber-700 dark:text-amber-300">{sinColumna}</span>
      )}
    </li>
  )
  return (
    <div className="mt-3 px-1 text-xs text-muted">
      <p>
        Columnas de <code className="font-mono">{tabla}</code> que usa el tablero:
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {dato('Compra autogestionada', fuentes.compra, 'no se encontró')}
        {dato('Tiempo visita', fuentes.minutosVisita, 'calculado con la tabla visitas')}
        {dato('Tiempo nueva visita', fuentes.minutosNuevaVisita, 'calculado con la tabla visitas')}
        {dato('Geoeficiencia', fuentes.distancia, 'de la tabla visitas')}
      </ul>
    </div>
  )
}

function TablaPromotores({
  filas,
  seleccionados,
  onSeleccionar,
}: {
  filas: FilaPromotor[]
  seleccionados: string[]
  onSeleccionar: (id: string) => void
}) {
  const th = 'px-3 py-2 text-right font-medium whitespace-nowrap'
  const td = 'px-3 py-2.5 text-right whitespace-nowrap'
  return (
    <Card className="overflow-hidden">
      <EncabezadoTablero>Por promotor</EncabezadoTablero>
      <p className="border-b border-line px-4 py-2 text-xs text-muted">
        Toca un nombre para ver solo sus visitas<span className="lg:hidden"> · desliza para ver más</span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="sticky left-0 bg-card px-4 py-2 text-left font-medium">Promotor</th>
              <th className={th}>Visitas</th>
              <th className={th}>Con compra</th>
              <th className={th}>Días</th>
              <th className={th}>Visitas x día</th>
              <th className={th}>Tiempo x visita (min)</th>
              <th className={th}>Tiempo nueva visita (min)</th>
              <th className={th}>Distancia (m)</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {filas.map((f) => {
              const id = f.id ?? SIN_PROMOTOR
              const activo = seleccionados.includes(id)
              const i = f.indicadores
              const fondo = activo ? 'bg-brand-50 dark:bg-brand-950/40' : 'bg-card group-hover:bg-soft'
              return (
                <tr
                  key={id}
                  onClick={() => onSeleccionar(id)}
                  className={cn('group cursor-pointer border-b border-line last:border-0', !i.visitas && 'text-muted')}
                >
                  <td className={cn('sticky left-0 px-4 py-2.5', fondo)}>
                    <button
                      type="button"
                      aria-pressed={activo}
                      className="max-w-44 truncate text-left font-semibold"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSeleccionar(id)
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

/** Solo administradores: desempeño de las visitas (resultados_visitas), como el reporte de Power BI. */
export function TableroPage() {
  const user = useUser()
  const { data: ctx, isPending: ctxPending } = useSchema()
  const hoy = hoyLocal()
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [ancla, setAncla] = useState(hoy)
  /** Días elegidos de la semana (vacío: toda la semana). */
  const [dias, setDias] = useState<string[]>([])
  /** Promotores elegidos (vacío: todos). */
  const [elegidos, setElegidos] = useState<string[]>([])
  /** Visita elegida en el detalle (sus respuestas se ven en el cuestionario). */
  const [visitaKey, setVisitaKey] = useState<string | null>(null)
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

  // Respuestas de las visitas del periodo (aparte: el tablero no las espera).
  const idsPeriodo = useMemo(() => (datos ? datos.visitas.map((v) => v.key).filter((k) => !k.startsWith('#')) : []), [datos])
  const respuestas = useQuery({
    queryKey: ['tablero-respuestas', user.id, datos?.rango.desde, datos?.rango.hasta, idsPeriodo.length],
    queryFn: () => fetchRespuestasTablero(ctx!, idsPeriodo),
    enabled: Boolean(ctx && datos && !query.isPlaceholderData && ctx.tables.respuestas.table),
    staleTime: 2 * 60_000,
  })

  const delPeriodo = useMemo(
    () => datos?.visitas.filter((v) => v.dia !== null && v.dia >= datos.rango.desde && v.dia < datos.rango.hasta) ?? [],
    [datos],
  )
  const enDias = useMemo(
    () => (periodo === 'semana' && dias.length ? delPeriodo.filter((v) => dias.includes(v.dia!)) : delPeriodo),
    [delPeriodo, periodo, dias],
  )
  const filas = useMemo(() => porPromotor(enDias, datos?.promotores ?? []), [enDias, datos])
  const visibles = useMemo(
    () => (elegidos.length ? enDias.filter((v) => elegidos.includes(v.promotor ?? SIN_PROMOTOR)) : enDias),
    [enDias, elegidos],
  )
  const indicadores = useMemo(() => calcularIndicadores(visibles), [visibles])
  const barras = useMemo(() => {
    if (!datos) return []
    if (periodo === 'semana' && dias.length === 1) return porBarra(visibles, rangoDe('dia', dias[0]))
    return porBarra(visibles, datos.rango, { soloDias: periodo === 'semana' ? dias : [] })
  }, [visibles, datos, periodo, dias])
  const rangoGrafica = periodo === 'semana' && dias.length === 1 ? rangoDe('dia', dias[0]) : (datos?.rango ?? rango)
  const nombres = useMemo(() => new Map(filas.filter((f) => f.id).map((f) => [f.id!, f.nombre])), [filas])
  const visita = visibles.find((v) => v.key === visitaKey) ?? null

  // Opciones del filtro de promotor: los de la tabla (con visitas o activos), por nombre; y los elegidos aunque no estén.
  const opciones = useMemo(() => {
    const lista = filas.map((f) => ({ id: f.id ?? SIN_PROMOTOR, nombre: f.nombre }))
    for (const id of elegidos) {
      if (!lista.some((o) => o.id === id)) lista.push({ id, nombre: datos?.promotores.find((p) => p.id === id)?.nombre ?? id })
    }
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [filas, elegidos, datos])

  if (ctxPending) return null
  if (!admin) return <Navigate to="/" replace />

  const irA = (fecha: string) => {
    setAncla(fecha)
    setDias([])
    setVisitaKey(null)
  }
  const cambiarPeriodo = (p: Periodo) => {
    setPeriodo(p)
    setDias([])
    setVisitaKey(null)
  }
  const alternar = <T,>(lista: T[], x: T) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x])
  const elegirVisita = (key: string | null) => {
    setVisitaKey(key)
    // En el teléfono el cuestionario está abajo del detalle.
    if (key && window.innerWidth < 1024) {
      requestAnimationFrame(() => document.getElementById('cuestionario')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  const siguiente = moverPeriodo(periodo, ancla, 1)
  const hayFuturo = rangoDe(periodo, siguiente).desde <= hoy
  const esActual = rango.desde <= hoy && hoy < rango.hasta
  const periodoTexto = partesPeriodo(rango, hoy)
  const cargandoOtro = query.isFetching && query.isPlaceholderData
  const filaScroll = '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0'

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
              onClick={() => {
                query.refetch()
                respuestas.refetch()
              }}
              aria-label="Actualizar"
              className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-card hover:text-fg"
            >
              <RefreshCw className={cn('size-5', query.isFetching && 'animate-spin')} />
            </button>
          </>
        }
      />

      {/* Filtros: arriba de todo lo que cambian (como los del reporte: promotor, semana y días). */}
      <div className="mt-5 space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Promotor</p>
          <div className={filaScroll} role="group" aria-label="Promotor">
            <Chip activo={elegidos.length === 0} onClick={() => setElegidos([])}>
              Todos
            </Chip>
            {opciones.map((o) => (
              <Chip key={o.id} activo={elegidos.includes(o.id)} onClick={() => setElegidos((l) => alternar(l, o.id))}>
                {o.nombre}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SegmentedControl label="Periodo" value={periodo} onChange={cambiarPeriodo} options={PERIODOS} className="sm:w-56" />
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <button
              type="button"
              onClick={() => irA(moverPeriodo(periodo, ancla, -1))}
              aria-label="Periodo anterior"
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg hover:bg-soft"
            >
              <ChevronLeft className="size-5" />
            </button>
            <label
              title={etiquetaPeriodo(rango, hoy)}
              className="relative flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 hover:bg-soft sm:max-w-72"
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
                onChange={(e) => e.target.value && irA(e.target.value)}
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
              onClick={() => irA(siguiente)}
              disabled={!hayFuturo}
              aria-label="Periodo siguiente"
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg hover:bg-soft disabled:opacity-40 disabled:hover:bg-card"
            >
              <ChevronRight className="size-5" />
            </button>
            {!esActual && (
              <button
                type="button"
                onClick={() => irA(hoy)}
                className="h-11 shrink-0 rounded-xl border border-line bg-card px-4 text-sm font-semibold hover:bg-soft"
              >
                Hoy
              </button>
            )}
          </div>
        </div>
        {periodo === 'semana' && (
          <div className={filaScroll} role="group" aria-label="Días">
            <Chip activo={dias.length === 0} onClick={() => setDias([])}>
              Toda la semana
            </Chip>
            {diasDelRango(rango).map((d) => (
              <Chip key={d} activo={dias.includes(d)} disabled={d > hoy} onClick={() => setDias((l) => alternar(l, d))}>
                {DIAS_CORTOS[deIso(d).getDay()]} {deIso(d).getDate()}
              </Chip>
            ))}
          </div>
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
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className={cn('mt-5 transition-opacity', cargandoOtro && 'opacity-50')} aria-busy={cargandoOtro}>
          {!datos.conVisita && (
            <Alert tone="warning" icon={<TriangleAlert />} className="mb-4">
              La tabla de resultados no tiene la columna id_visita: sin ella no se pueden calcular los tiempos ni la distancia.
            </Alert>
          )}
          {datos.sinDetalle > 0 && (
            <Alert tone="warning" icon={<TriangleAlert />} className="mb-4">
              {datos.sinDetalle === 1
                ? '1 visita de resultados_visitas no aparece en la tabla visitas, así que no tiene tiempos ni distancia.'
                : `${formatoEntero(datos.sinDetalle)} visitas de resultados_visitas no aparecen en la tabla visitas, así que no tienen tiempos ni distancia.`}{' '}
              Si aún no lo haces, ejecuta supabase/11_admin_tablero.sql en Supabase.
            </Alert>
          )}

          <EncabezadoTablero className="rounded-xl">Desempeño de Visitas Promotores Digitales</EncabezadoTablero>
          {visibles.length === 0 ? (
            <Card className="mt-3">
              <EmptyState icon={CalendarDays} title="Sin visitas en este periodo">
                {elegidos.length ? 'Prueba con otro promotor u otra fecha.' : 'Prueba con otra fecha.'}
              </EmptyState>
            </Card>
          ) : (
            <>
              <Indicadores8 ind={indicadores} />
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <TablaDetalle visitas={visibles} nombres={nombres} seleccionada={visita?.key ?? null} onSeleccionar={elegirVisita} />
                <Cuestionario
                  respuestas={respuestas.data}
                  cargando={respuestas.isFetching}
                  error={respuestas.error}
                  visitasFiltradas={visibles}
                  visita={visita}
                  onVerResumen={() => setVisitaKey(null)}
                />
              </div>
              <div className="mt-3">
                <GraficaVisitas barras={barras} rango={rangoGrafica} hoy={hoy} />
              </div>
            </>
          )}
          {filas.length > 0 && enDias.length > 0 && (
            <div className="mt-3">
              <TablaPromotores
                filas={filas}
                seleccionados={elegidos}
                onSeleccionar={(id) => setElegidos((l) => (l.length === 1 && l[0] === id ? [] : [id]))}
              />
            </div>
          )}
          <Fuentes tabla={tabla} fuentes={datos.fuentes} />
        </div>
      )}

      {ctx && <Descargas ctx={ctx} />}
    </div>
  )
}
