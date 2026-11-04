import { useQuery } from '@tanstack/react-query'
import { CalendarClock, MapPin, RefreshCw, ShoppingCart, Trophy, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { ErrorState } from '../components/ErrorState'
import { PageTitle } from '../components/PageHeader'
import { EncabezadoTablero } from '../components/tablero/Encabezado'
import { FiltroRegion, SelectorPeriodo } from '../components/tablero/Filtros'
import { TarjetaKpi } from '../components/tablero/TarjetaKpi'
import { usePeriodo } from '../components/tablero/usePeriodo'
import { Card } from '../components/ui/Card'
import { cn } from '../components/ui/cn'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { FaltaSqlRegiones, fetchAlcance, idsDe, opcionesRegion, SinRegion } from '../data/alcance'
import { fetchConcurso, rankingConcurso, type FilaConcurso, type VisitaConcurso } from '../data/concurso'
import { useSchema } from '../data/hooks'
import { aCsv, descargarArchivo } from '../lib/csv'
import { capitalizar, formatoEntero, formatoFechaHora } from '../lib/formato'
import { hoyLocal, sumarDias } from '../lib/periodos'
import { esAdmin, veEquipo } from '../lib/schema-resolver'
import { normalize, plural } from '../lib/text'
import { useUser } from '../providers/AuthProvider'

const ENCABEZADO_TABLA = 'sticky top-0 z-10 bg-soft text-xs font-semibold text-fg shadow-[inset_0_-1px_0_var(--line)]'
/** Filas que se dibujan en el detalle de compras (el ranking muestra a todos). */
const MAX_FILAS_COMPRAS = 500
/** Color del lugar en el ranking: oro, plata y bronce. */
const MEDALLA = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-900', 'bg-orange-300 text-orange-950']

/**
 * Administradores (todos) y líderes (su región): las visitas con compra autogestionada contadas por su fecha de
 * actualización (para el concurso), con el ranking por promotor.
 */
export function ConcursoPage() {
  const user = useUser()
  const { data: ctx, isPending: ctxPending } = useSchema()
  const hoy = hoyLocal()
  const permitido = veEquipo(ctx)
  const admin = esAdmin(ctx)
  /** Regiones elegidas (sin mayúsculas ni acentos; '' = sin región; vacío: todas). */
  const [regiones, setRegiones] = useState<string[]>([])
  const periodo = usePeriodo(hoy)
  const { rango } = periodo

  const alcanceQuery = useQuery({
    queryKey: ['alcance', user.id, ctx?.perfil?.rol, ctx?.perfil?.region],
    queryFn: () => fetchAlcance(ctx!),
    enabled: Boolean(ctx && permitido),
    staleTime: 5 * 60_000,
  })
  const alcance = alcanceQuery.data
  const query = useQuery({
    queryKey: ['concurso', user.id, alcance ? idsDe(alcance) : null],
    queryFn: () => fetchConcurso(ctx!, alcance!),
    enabled: Boolean(ctx && permitido && alcance && ctx.tables.resultados.table),
    staleTime: 2 * 60_000,
  })
  const datos = query.data

  const primerDia = useMemo(
    () =>
      datos?.visitas.reduce<string | null>(
        (min, v) => (v.conCompra && v.diaActualizacion && (!min || v.diaActualizacion < min) ? v.diaActualizacion : min),
        null,
      ) ?? null,
    [datos],
  )
  // Las compras por la fecha en que se actualizaron (aunque la visita sea de antes). En Total, todas (también las
  // que no tienen fecha).
  const delPeriodo = useMemo(
    () =>
      datos?.visitas.filter(
        (v) =>
          v.conCompra &&
          (rango.periodo === 'total' ||
            (v.diaActualizacion !== null && v.diaActualizacion >= rango.desde && v.diaActualizacion < rango.hasta)),
      ) ?? [],
    [datos, rango],
  )
  const regionPorPromotor = useMemo(() => new Map((datos?.promotores ?? []).map((p) => [p.id, normalize(p.region)])), [datos])
  const regionDe = (v: VisitaConcurso) => regionPorPromotor.get(v.promotor ?? '') ?? ''
  // Filtro de región: solo el admin (el líder ya solo ve su región).
  const regionesOpciones = useMemo(
    () =>
      admin
        ? opcionesRegion(datos?.promotores ?? [], [...delPeriodo.map((v) => regionPorPromotor.get(v.promotor ?? '') ?? ''), ...regiones])
        : [],
    [admin, datos, delPeriodo, regionPorPromotor, regiones],
  )
  const compras = (regiones.length ? delPeriodo.filter((v) => regiones.includes(regionDe(v))) : delPeriodo).sort(
    (a, b) => (b.actualizado ?? -Infinity) - (a.actualizado ?? -Infinity),
  )
  const ranking = rankingConcurso(compras, datos?.promotores ?? [])
  const nombres = useMemo(() => new Map((datos?.promotores ?? []).map((p) => [p.id, p.nombre])), [datos])

  if (ctxPending) return null
  if (!permitido) return <Navigate to="/" replace />

  const sinFecha = datos?.visitas.filter((v) => v.conCompra && v.diaActualizacion === null).length ?? 0
  const error = alcanceQuery.error ?? query.error
  const region = alcance?.tipo === 'region' ? alcance.region : null

  const descargarRanking = () => {
    const filas = ranking.map((f) => ({
      Lugar: f.lugar,
      Promotor: f.nombre,
      Región: f.region ? capitalizar(f.region) : '',
      'Visitas con compra': f.conCompra,
    }))
    const cuando = rango.periodo === 'total' ? 'total' : `${rango.desde}_a_${sumarDias(rango.hasta, -1)}`
    descargarArchivo(`concurso_${cuando}.csv`, aCsv(filas))
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
      <PageTitle
        title="Resultados concurso"
        subtitle={`Compras autogestionadas por fecha de actualización${region ? ` · Región ${region}` : ''}`}
        actions={
          <button
            type="button"
            onClick={() => {
              void alcanceQuery.refetch()
              void query.refetch()
            }}
            aria-label="Actualizar"
            className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-card hover:text-fg"
          >
            <RefreshCw className={cn('size-5', query.isFetching && 'animate-spin')} />
          </button>
        }
      />

      <div className="mt-5 space-y-3">
        <FiltroRegion opciones={regionesOpciones} elegidas={regiones} onElegir={setRegiones} />
        <SelectorPeriodo p={periodo} hoy={hoy} primerDia={primerDia} todo="Todas las compras" />
      </div>

      {error instanceof FaltaSqlRegiones || error instanceof SinRegion ? (
        <EmptyState icon={MapPin} title={error instanceof SinRegion ? 'Sin región asignada' : 'Falta un paso en Supabase'}>
          {error.message}
        </EmptyState>
      ) : error ? (
        <div className="mt-5">
          <ErrorState error={error} onRetry={() => (alcanceQuery.isError ? alcanceQuery.refetch() : query.refetch())} />
        </div>
      ) : !ctx?.tables.resultados.table ? (
        <EmptyState icon={Trophy} title="No se encontró la tabla de resultados">
          El concurso lee la tabla resultados_visitas de Supabase. Revisa en Perfil → Verificar conexión.
        </EmptyState>
      ) : !datos ? (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:max-w-3xl">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : !datos.columnaActualizado ? (
        <EmptyState icon={CalendarClock} title="Falta la fecha de actualización">
          La tabla resultados_visitas no tiene la columna fecha_actualizacion, que es con la que se cuenta el concurso.
        </EmptyState>
      ) : (
        <div className="mt-5">
          <EncabezadoTablero className="rounded-xl">Concurso de compras</EncabezadoTablero>
          {compras.length === 0 ? (
            <Card className="mt-3">
              <EmptyState icon={Trophy} title="Sin compras en este periodo">
                Prueba con otro periodo{admin ? ' o con otra región' : ''}.
              </EmptyState>
            </Card>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3 lg:max-w-3xl">
                <TarjetaKpi
                  icono={ShoppingCart}
                  titulo="Visitas con compra autogestionada"
                  valor={formatoEntero(compras.length)}
                  ayuda="Compras actualizadas en el periodo (por fecha_actualizacion)"
                />
                <TarjetaLugar titulo="Primer lugar" icono={Trophy} filas={ranking.filter((f) => f.lugar === 1)} />
              </div>
              {rango.periodo === 'total' && sinFecha > 0 && (
                <p className="mt-2 px-1 text-xs text-muted">
                  {plural(sinFecha, 'compra no tiene', 'compras no tienen')} fecha de actualización: solo cuentan en Total.
                </p>
              )}

              <Card id="ranking" className="mt-3 overflow-hidden">
                <EncabezadoTablero
                  accion={
                    <button
                      type="button"
                      onClick={descargarRanking}
                      className="h-8 shrink-0 rounded-lg px-2 text-sm font-semibold text-white/90 hover:bg-white/10"
                    >
                      Descargar
                    </button>
                  }
                >
                  Ranking por promotor
                </EncabezadoTablero>
                <div className="max-h-[32rem] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className={ENCABEZADO_TABLA}>
                      <tr>
                        <th className="w-14 py-2.5 pr-2 pl-4 text-left">Lugar</th>
                        <th className="px-2 py-2.5 text-left">Promotor</th>
                        <th className="py-2.5 pr-4 pl-2 text-right">Con compra</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {ranking.map((f) => (
                        <tr key={f.id ?? '__sin__'} className="border-b border-line last:border-0">
                          <td className="py-2.5 pr-2 pl-4">
                            <span
                              className={cn(
                                'grid size-7 place-items-center rounded-full text-xs font-bold',
                                f.lugar <= 3 ? MEDALLA[f.lugar - 1] : 'bg-soft text-muted',
                              )}
                            >
                              {f.lugar}
                            </span>
                          </td>
                          <td className="px-2 py-2.5">
                            <p className="font-semibold">{f.nombre}</p>
                            {f.region && <p className="text-xs text-muted">{capitalizar(f.region)}</p>}
                          </td>
                          <td className="py-2.5 pr-4 pl-2 text-right font-bold">{formatoEntero(f.conCompra)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <DetalleCompras compras={compras} nombres={nombres} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Primer lugar: sus compras y quién (si hay empate, el primero y cuántos más; todos al pasar el mouse). */
function TarjetaLugar({ titulo, icono, filas }: { titulo: string; icono: LucideIcon; filas: FilaConcurso[] }) {
  return (
    <TarjetaKpi
      icono={icono}
      titulo={titulo}
      extra={
        <p className="mt-1 truncate text-xs font-semibold text-muted">
          {filas.length ? `${filas[0].nombre}${filas.length > 1 ? ` y ${filas.length - 1} más` : ''}` : 'Nadie todavía'}
        </p>
      }
      valor={filas.length ? formatoEntero(filas[0].conCompra) : '—'}
      ayuda={filas.length ? `${filas.map((f) => f.nombre).join(', ')}: ${plural(filas[0].conCompra, 'compra')}` : undefined}
    />
  )
}

/** Las visitas con compra del periodo, de la actualización más reciente a la más vieja. */
function DetalleCompras({ compras, nombres }: { compras: VisitaConcurso[]; nombres: Map<string, string> }) {
  if (compras.length === 0) return null
  return (
    <Card id="compras" className="mt-3 overflow-hidden">
      <EncabezadoTablero accion={<span className="text-sm text-white/85">{plural(compras.length, 'visita')}</span>}>
        Visitas con compra
      </EncabezadoTablero>
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className={ENCABEZADO_TABLA}>
            <tr>
              <th className="py-2.5 pr-2 pl-4 text-left">Cliente</th>
              <th className="px-2 py-2.5 text-left">Promotor</th>
              <th className="px-2 py-2.5 text-left">Actualización</th>
              <th className="py-2.5 pr-4 pl-2 text-left">Visita</th>
            </tr>
          </thead>
          <tbody>
            {compras.slice(0, MAX_FILAS_COMPRAS).map((v) => (
              <tr key={v.key} data-compra={v.key} className="border-b border-line align-top last:border-0">
                <td className="py-2.5 pr-2 pl-4">
                  <p className="font-semibold tabular-nums">{v.cliente ?? '—'}</p>
                  {v.nombreCliente && <p className="text-xs text-muted">{v.nombreCliente}</p>}
                </td>
                <td className="px-2 py-2.5">{v.promotor ? (nombres.get(v.promotor) ?? v.promotor) : 'Sin promotor'}</td>
                <td className="px-2 py-2.5 whitespace-nowrap tabular-nums">{formatoFechaHora(v.actualizado)}</td>
                <td className="py-2.5 pr-4 pl-2 whitespace-nowrap text-muted tabular-nums">{formatoFechaHora(v.fechaVisita)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {compras.length > MAX_FILAS_COMPRAS && (
        <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
          Se muestran las {formatoEntero(MAX_FILAS_COMPRAS)} más recientes de {formatoEntero(compras.length)}.
        </p>
      )}
    </Card>
  )
}
