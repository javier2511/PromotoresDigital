import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDownAZ, ArrowDownWideNarrow, ClipboardList, Download, MapPin, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FaltaSqlRegiones, fetchAlcance, opcionesRegion, SinRegion } from '../../data/alcance'
import {
  FaltaSqlAsignaciones,
  fetchAsignacionesEquipo,
  filasAsignaciones,
  type OrdenAsignaciones,
} from '../../data/asignaciones-equipo'
import { aCsv, descargarArchivo } from '../../lib/csv'
import { capitalizar, formatoEntero } from '../../lib/formato'
import { hoyLocal, sumarDias } from '../../lib/periodos'
import { esAdmin, type SchemaContext } from '../../lib/schema-resolver'
import { normalize } from '../../lib/text'
import { useUser } from '../../providers/AuthProvider'
import { ErrorState } from '../ErrorState'
import { FiltroRegion, SelectorPeriodo } from '../tablero/Filtros'
import { usePeriodo } from '../tablero/usePeriodo'
import { Card } from '../ui/Card'
import { cn } from '../ui/cn'
import { EmptyState } from '../ui/EmptyState'
import { Skeleton } from '../ui/Skeleton'

const porcentaje = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0)

/**
 * Asignaciones de cada promotor en el periodo (la semana en curso al abrir): asignadas, completadas y pendientes.
 * Un admin ve a todos (con filtro de región); un líder, a los de su región (lo decide la base: supabase/19).
 */
export function AsignacionesEquipo({ ctx }: { ctx: SchemaContext }) {
  const user = useUser()
  const admin = esAdmin(ctx)
  const hoy = hoyLocal()
  const periodo = usePeriodo(hoy, undefined, 'semana')
  const { rango } = periodo
  const total = rango.periodo === 'total'
  /** Regiones elegidas (sin mayúsculas ni acentos; '' = sin región; vacío: todas). */
  const [regiones, setRegiones] = useState<string[]>([])
  const [orden, setOrden] = useState<OrdenAsignaciones>('pendientes')
  const [q, setQ] = useState('')

  const alcanceQuery = useQuery({
    queryKey: ['alcance', user.id, ctx.perfil?.rol, ctx.perfil?.region],
    queryFn: () => fetchAlcance(ctx, user.id),
    staleTime: 5 * 60_000,
  })
  const conteosQuery = useQuery({
    queryKey: ['asignaciones-equipo', user.id, total ? null : rango.desde, total ? null : rango.hasta],
    queryFn: () => fetchAsignacionesEquipo(total ? null : rango.desde, total ? null : rango.hasta),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })

  const promotores = useMemo(() => alcanceQuery.data?.promotores ?? [], [alcanceQuery.data])
  const todas = useMemo(() => filasAsignaciones(conteosQuery.data ?? [], promotores, orden), [conteosQuery.data, promotores, orden])
  const regionesOpciones = useMemo(
    () => (admin ? opcionesRegion(promotores, [...todas.map((f) => normalize(f.region)), ...regiones]) : []),
    [admin, promotores, todas, regiones],
  )
  const term = normalize(q.trim())
  const filas = todas.filter(
    (f) => (regiones.length === 0 || regiones.includes(normalize(f.region))) && (!term || normalize(f.nombre).includes(term)),
  )
  const suma = filas.reduce(
    (s, f) => ({ total: s.total + f.total, completadas: s.completadas + f.completadas, pendientes: s.pendientes + f.pendientes }),
    { total: 0, completadas: 0, pendientes: 0 },
  )
  const conPendientes = filas.filter((f) => f.pendientes > 0).length

  const descargar = () => {
    const datos = filas.map((f) => ({
      Promotor: f.nombre,
      Región: f.region ? capitalizar(f.region) : '',
      Asignadas: f.total,
      Completadas: f.completadas,
      Pendientes: f.pendientes,
      'Avance %': porcentaje(f.completadas, f.total),
    }))
    const cuando = total ? 'total' : `${rango.desde}_a_${sumarDias(rango.hasta, -1)}`
    descargarArchivo(`asignaciones_${cuando}.csv`, aCsv(datos))
  }

  const error = alcanceQuery.error ?? conteosQuery.error
  if (error instanceof FaltaSqlRegiones || error instanceof SinRegion || error instanceof FaltaSqlAsignaciones) {
    return (
      <EmptyState icon={MapPin} title={error instanceof SinRegion ? 'Sin región asignada' : 'Falta un paso en Supabase'}>
        {error.message}
      </EmptyState>
    )
  }

  return (
    <>
      <div className="mt-5 space-y-3">
        <FiltroRegion opciones={regionesOpciones} elegidas={regiones} onElegir={setRegiones} />
        <SelectorPeriodo p={periodo} hoy={hoy} primerDia={null} todo="Todas las asignaciones" futuro />
      </div>

      {error ? (
        <div className="mt-5">
          <ErrorState error={error} onRetry={() => (alcanceQuery.isError ? alcanceQuery.refetch() : conteosQuery.refetch())} />
        </div>
      ) : conteosQuery.isPending || alcanceQuery.isPending ? (
        <div className="mt-5 space-y-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <>
          <Card className="mt-5 grid grid-cols-2 divide-line overflow-hidden text-center sm:grid-cols-4 sm:divide-x">
            <div className="p-3.5">
              <p className="text-xs text-muted">Asignadas</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{formatoEntero(suma.total)}</p>
            </div>
            <div className="p-3.5">
              <p className="text-xs text-muted">Completadas</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">{formatoEntero(suma.completadas)}</p>
            </div>
            <div className="p-3.5">
              <p className="text-xs text-muted">Pendientes</p>
              <p className="mt-1 text-2xl font-bold text-brand-600 tabular-nums dark:text-brand-400">{formatoEntero(suma.pendientes)}</p>
              <p className="text-[11px] text-muted">
                {conPendientes === 1 ? '1 promotor' : `${formatoEntero(conPendientes)} promotores`} con pendientes
              </p>
            </div>
            <div className="p-3.5">
              <p className="text-xs text-muted">Avance</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{porcentaje(suma.completadas, suma.total)}%</p>
            </div>
          </Card>

          <Card className="mt-3 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
              <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15 sm:max-w-72">
                <Search className="size-4 shrink-0 text-muted" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar promotor"
                  aria-label="Buscar promotor"
                  className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted/70 [&::-webkit-search-cancel-button]:hidden"
                />
                {q && (
                  <button type="button" aria-label="Limpiar búsqueda" onClick={() => setQ('')}>
                    <X className="size-4 text-muted" />
                  </button>
                )}
              </label>
              <button
                type="button"
                onClick={() => setOrden(orden === 'pendientes' ? 'nombre' : 'pendientes')}
                aria-label={orden === 'pendientes' ? 'Ordenado por pendientes' : 'Ordenado por nombre'}
                title={orden === 'pendientes' ? 'Más pendientes primero (toca para ordenar por nombre)' : 'Por nombre (toca para ver más pendientes primero)'}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-sm font-semibold hover:bg-soft"
              >
                {orden === 'pendientes' ? <ArrowDownWideNarrow className="size-4 text-brand-600" /> : <ArrowDownAZ className="size-4" />}
                <span className="hidden sm:inline">{orden === 'pendientes' ? 'Más pendientes' : 'Nombre'}</span>
              </button>
              <button
                type="button"
                onClick={descargar}
                disabled={filas.length === 0}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-sm font-semibold hover:bg-soft disabled:opacity-50"
              >
                <Download className="size-4" /> <span className="hidden sm:inline">Descargar</span> CSV
              </button>
            </div>
            {filas.length === 0 ? (
              <EmptyState icon={ClipboardList} title={term ? 'Sin coincidencias' : 'Sin asignaciones'}>
                {term ? `Ningún promotor coincide con “${q.trim()}”.` : 'No hay asignaciones en este periodo.'}
              </EmptyState>
            ) : (
              <ul aria-label="Asignaciones por promotor" className={cn('divide-y divide-line', conteosQuery.isFetching && 'opacity-60')}>
                {filas.map((f) => {
                  const pct = porcentaje(f.completadas, f.total)
                  return (
                    <li key={f.promotor} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{f.nombre}</p>
                        <p className="truncate text-xs text-muted">
                          {admin && f.region ? `${capitalizar(f.region)} · ` : ''}
                          {formatoEntero(f.completadas)} de {formatoEntero(f.total)} completadas
                        </p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-soft">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="w-20 shrink-0 text-right">
                        <p
                          className={cn(
                            'text-xl font-bold tabular-nums',
                            f.pendientes > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-emerald-600 dark:text-emerald-400',
                          )}
                        >
                          {formatoEntero(f.pendientes)}
                        </p>
                        <p className="text-[11px] text-muted">{f.pendientes === 1 ? 'pendiente' : 'pendientes'}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  )
}
