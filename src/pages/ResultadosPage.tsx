import { useQuery } from '@tanstack/react-query'
import { ChartColumn, MapPin, RefreshCw, Search, Smartphone, Store, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { ErrorState } from '../components/ErrorState'
import { PageTitle } from '../components/PageHeader'
import { Card } from '../components/ui/Card'
import { cn } from '../components/ui/cn'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { FaltaSqlRegiones, fetchAlcance, idsDe, SinRegion } from '../data/alcance'
import { useClientes, useResultados, useSchema } from '../data/hooks'
import { fetchResultadosEquipo, MAX_RESULTADOS, resumirResultados, type Resumen } from '../data/resultados'
import { formatoEntero } from '../lib/formato'
import { veEquipo, type SchemaContext } from '../lib/schema-resolver'
import type { Row } from '../lib/supabase'
import { ETIQUETA_INDICADOR } from '../config/schema'
import { esVacio, formatValue, humanize, isNumeric, normalize } from '../lib/text'
import { useUser } from '../providers/AuthProvider'

const OCULTAS = /^(id|uuid|created_at|updated_at|inserted_at|modified_at)$/i
const PORCENTAJE = /porc|pct|percent|cumpl|avance|efectiv|logro/i
/** Ids (id_cliente, cliente_id…): se muestran tal cual, sin separador de miles. */
const ID = /^id_|_id$/i

interface Tarjeta {
  key: string
  titulo: string
  /** Quién (en los resultados del equipo: el promotor). */
  subtitulo?: string | null
  fecha: string | null
  campos: { label: string; value: unknown; column: string }[]
  texto: string
}

function Valor({ column, value }: { column: string; value: unknown }) {
  if (ID.test(column)) return <p className="text-sm font-medium break-all tabular-nums">{String(value)}</p>
  if (isNumeric(value) && PORCENTAJE.test(column)) {
    const n = Number(value)
    const pct = n >= 0 && n <= 1 && !Number.isInteger(n) ? n * 100 : n
    const width = Math.max(0, Math.min(100, pct))
    return (
      <div className="w-full">
        <p className="text-lg font-bold tabular-nums">{Math.round(pct * 10) / 10}%</p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-soft">
          <div
            className={cn('h-full rounded-full', width >= 80 ? 'bg-emerald-500' : width >= 50 ? 'bg-amber-500' : 'bg-red-500')}
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    )
  }
  if (isNumeric(value)) return <p className="text-lg font-bold tabular-nums">{formatValue(Number(value))}</p>
  return <p className="text-sm font-medium break-words">{formatValue(value)}</p>
}

function ResumenCard({ resumen }: { resumen: Resumen }) {
  const { visitados, conIndicador } = resumen
  const pct = conIndicador !== null && visitados > 0 ? Math.round((conIndicador / visitados) * 100) : null
  return (
    <Card className="mt-5 grid grid-cols-2 divide-x divide-line overflow-hidden">
      <div className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Store className="size-4" /> Clientes visitados
        </div>
        <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{formatValue(visitados)}</p>
      </div>
      {conIndicador !== null && pct !== null ? (
        <div className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Smartphone className="size-4" /> {ETIQUETA_INDICADOR}
          </div>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-brand-600 tabular-nums dark:text-brand-400">{pct}%</span>
            <span className="text-sm text-muted tabular-nums">
              {formatValue(conIndicador)} de {formatValue(visitados)}
            </span>
          </p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-soft"
            role="progressbar"
            aria-label={`${ETIQUETA_INDICADOR}: ${pct}%`}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <div className="p-4 text-sm text-muted">Sin columna de {ETIQUETA_INDICADOR.toLowerCase()} en la tabla de resultados.</div>
      )}
    </Card>
  )
}

/** Los datos de la fila que no van en el título: todas sus columnas, sin ids internos ni vacías. */
function tarjeta(row: Row, key: string, titulo: string, usadas: (string | undefined)[], fecha: string | undefined, subtitulo?: string | null): Tarjeta {
  const fuera = new Set(usadas)
  const campos = Object.entries(row)
    .filter(([column, value]) => !fuera.has(column) && !OCULTAS.test(column) && !esVacio(value))
    .map(([column, value]) => ({ column, label: humanize(column), value }))
  const cuando = fecha && row[fecha] ? formatValue(row[fecha]) : null
  const texto = normalize([titulo, subtitulo, cuando, ...campos.map((c) => formatValue(c.value))].join(' '))
  return { key, titulo, subtitulo, fecha: cuando, campos, texto }
}

function BotonActualizar({ onClick, girando }: { onClick: () => void; girando: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Actualizar"
      className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-card hover:text-fg"
    >
      <RefreshCw className={cn('size-5', girando && 'animate-spin')} />
    </button>
  )
}

/** Buscador y tarjetas (iguales en los resultados propios y en los del equipo). */
function ListaResultados({ tarjetas, vacio, nota }: { tarjetas: Tarjeta[]; vacio: string; nota?: ReactNode }) {
  const [q, setQ] = useState('')
  const term = normalize(q)
  const visibles = term ? tarjetas.filter((t) => t.texto.includes(term)) : tarjetas
  return (
    <>
      {tarjetas.length > 3 && (
        <label className="mt-5 flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15">
          <Search className="size-5 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en resultados"
            aria-label="Buscar en resultados"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted/70"
          />
          {q && (
            <button type="button" aria-label="Limpiar" onClick={() => setQ('')}>
              <X className="size-4 text-muted" />
            </button>
          )}
        </label>
      )}
      <div className="mt-5">
        {visibles.length === 0 ? (
          <EmptyState icon={q ? Search : ChartColumn} title={q ? 'Sin coincidencias' : 'Aún no hay resultados'}>
            {q ? `Nada coincide con “${q}”.` : vacio}
          </EmptyState>
        ) : (
          <>
            <p className="mb-3 px-1 text-sm text-muted">
              {visibles.length} registro{visibles.length === 1 ? '' : 's'}
              {nota}
            </p>
            <div id="lista-resultados" className="grid gap-3 md:grid-cols-2">
              {visibles.map((t) => (
                <Card key={t.key} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-[16px] leading-snug font-semibold">{t.titulo}</h2>
                      {t.subtitulo && <p className="truncate text-sm text-muted">{t.subtitulo}</p>}
                    </div>
                    {t.fecha && <span className="shrink-0 text-xs text-muted">{t.fecha}</span>}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                    {t.campos.map((c) => (
                      <div key={c.column} className="min-w-0 rounded-xl bg-soft/60 p-2.5">
                        <dt className="truncate text-xs text-muted">{c.label}</dt>
                        <dd className="mt-0.5">
                          <Valor column={c.column} value={c.value} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

const esqueleto = (
  <div className="mt-5 grid gap-3 md:grid-cols-2">
    {Array.from({ length: 4 }, (_, i) => (
      <Skeleton key={i} className="h-40 rounded-2xl" />
    ))}
  </div>
)

/** Los resultados propios (los de cada promotor). */
function ResultadosPropios() {
  const { clientes, ctx, error: clientesError } = useClientes()
  const clienteKeys = useMemo(() => (clientes ? new Set(clientes.map((c) => c.key)) : undefined), [clientes])
  const { resultados, isPending, isFetching, error, refetch } = useResultados(clienteKeys)

  const tarjetas = useMemo<Tarjeta[]>(() => {
    if (!resultados || !ctx) return []
    const cols = ctx.tables.resultados.columns
    const nombres = new Map(clientes?.map((c) => [c.key, c.nombre]))
    return resultados.rows.map((row: Row, i) => {
      const cliente = cols.cliente ? nombres.get(String(row[cols.cliente])) : undefined
      const titulo =
        cliente ??
        (cols.titulo && row[cols.titulo] ? String(row[cols.titulo]) : undefined) ??
        `Registro ${i + 1}`
      const usadas = [cols.usuario, cliente ? cols.cliente : undefined, cols.titulo, cols.fecha]
      return tarjeta(row, String(row.id ?? i), titulo, usadas, cols.fecha)
    })
  }, [resultados, ctx, clientes])

  const resumen = useMemo(() => {
    if (!resultados || !ctx || resultados.rows.length === 0) return null
    const cols = ctx.tables.resultados.columns
    return resumirResultados(resultados.rows, cols.cliente, cols.indicador)
  }, [resultados, ctx])

  const anyError = clientesError ?? error

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
      <PageTitle
        title="Resultados"
        subtitle="Cargados por tu administrador"
        actions={<BotonActualizar onClick={() => refetch()} girando={isFetching} />}
      />

      {resumen && !anyError && <ResumenCard resumen={resumen} />}

      {anyError ? (
        <div className="mt-5">
          <ErrorState error={anyError} onRetry={refetch} />
        </div>
      ) : isPending ? (
        esqueleto
      ) : !resultados?.table ? (
        <div className="mt-5">
          <EmptyState icon={ChartColumn} title="Aún no hay resultados">
            Cuando tu administrador cargue tus resultados aparecerán aquí.
          </EmptyState>
        </div>
      ) : (
        <ListaResultados tarjetas={tarjetas} vacio="Cuando tu administrador cargue tus resultados aparecerán aquí." />
      )}
    </div>
  )
}

/** Administradores (todos los promotores) y líderes (los de su región): los resultados del equipo. */
function ResultadosEquipo({ ctx }: { ctx: SchemaContext }) {
  const user = useUser()
  const [promotor, setPromotor] = useState('')
  const alcanceQuery = useQuery({
    queryKey: ['alcance', user.id, ctx.perfil?.rol, ctx.perfil?.region],
    queryFn: () => fetchAlcance(ctx),
    staleTime: 5 * 60_000,
  })
  const alcance = alcanceQuery.data
  const query = useQuery({
    queryKey: ['resultados-equipo', user.id, alcance ? idsDe(alcance) : null],
    queryFn: () => fetchResultadosEquipo(ctx, alcance!),
    enabled: Boolean(alcance),
    staleTime: 5 * 60_000,
  })
  const cols = ctx.tables.resultados.columns
  const filas = query.data?.rows
  const nombres = useMemo(() => new Map(alcance?.promotores.map((p) => [p.id, p.nombre])), [alcance])

  // Filtro: los promotores que tienen resultados, por nombre.
  const opciones = useMemo(() => {
    const col = cols.usuario
    if (!filas || !col) return []
    const cuenta = new Map<string, number>()
    for (const r of filas) {
      if (!esVacio(r[col])) cuenta.set(String(r[col]), (cuenta.get(String(r[col])) ?? 0) + 1)
    }
    return [...cuenta]
      .map(([id, n]) => ({ id, n, nombre: nombres.get(id) ?? id }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [filas, cols.usuario, nombres])
  const elegidas = useMemo(
    () => (filas && promotor && cols.usuario ? filas.filter((r) => String(r[cols.usuario!]) === promotor) : (filas ?? [])),
    [filas, promotor, cols.usuario],
  )
  const resumen = useMemo(
    () => (elegidas.length ? resumirResultados(elegidas, cols.cliente, cols.indicador) : null),
    [elegidas, cols.cliente, cols.indicador],
  )
  const tarjetas = useMemo<Tarjeta[]>(
    () =>
      elegidas.map((row, i) => {
        const nombreCliente = cols.nombreCliente && !esVacio(row[cols.nombreCliente]) ? String(row[cols.nombreCliente]) : null
        const idCliente = cols.cliente && !esVacio(row[cols.cliente]) ? String(row[cols.cliente]) : null
        const titulo = nombreCliente ?? (idCliente ? `Cliente ${idCliente}` : `Registro ${i + 1}`)
        const quien = cols.usuario && !esVacio(row[cols.usuario]) ? (nombres.get(String(row[cols.usuario])) ?? String(row[cols.usuario])) : null
        const usadas = [cols.usuario, cols.nombreCliente, cols.fecha, nombreCliente ? undefined : cols.cliente]
        const key = String(row[cols.id ?? ''] ?? row.id ?? i)
        return tarjeta(row, key, titulo, usadas, cols.fecha, quien)
      }),
    [elegidas, cols, nombres],
  )

  const region = alcance?.tipo === 'region' ? alcance.region : null
  const error = alcanceQuery.error ?? query.error
  const actualizar = () => {
    void alcanceQuery.refetch()
    void query.refetch()
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
      <PageTitle
        title="Resultados"
        subtitle={region ? `De los promotores de la región ${region}` : 'De todos los promotores'}
        actions={<BotonActualizar onClick={actualizar} girando={alcanceQuery.isFetching || query.isFetching} />}
      />

      {error instanceof FaltaSqlRegiones || error instanceof SinRegion ? (
        <EmptyState icon={MapPin} title={error instanceof SinRegion ? 'Sin región asignada' : 'Falta un paso en Supabase'}>
          {error.message}
        </EmptyState>
      ) : error ? (
        <div className="mt-5">
          <ErrorState error={error} onRetry={actualizar} />
        </div>
      ) : !query.data ? (
        esqueleto
      ) : !query.data.table ? (
        <div className="mt-5">
          <EmptyState icon={ChartColumn} title="No se encontró la tabla de resultados">
            Revisa en Perfil → Verificar conexión.
          </EmptyState>
        </div>
      ) : (
        <>
          {opciones.length > 1 && (
            <select
              value={promotor}
              onChange={(e) => setPromotor(e.target.value)}
              aria-label="Promotor"
              className="mt-5 h-11 w-full rounded-xl border border-line bg-card px-3 text-[16px] text-fg outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 sm:w-80"
            >
              <option value="">Todos los promotores ({formatoEntero(filas?.length ?? 0)})</option>
              {opciones.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre} ({formatoEntero(o.n)})
                </option>
              ))}
            </select>
          )}
          {resumen && <ResumenCard resumen={resumen} />}
          <ListaResultados
            tarjetas={tarjetas}
            vacio={region ? 'Los promotores de tu región aún no tienen resultados.' : 'Aún no hay resultados cargados.'}
            nota={query.data.limitado ? ` · los ${formatoEntero(MAX_RESULTADOS)} más recientes` : undefined}
          />
        </>
      )}
    </div>
  )
}

export function ResultadosPage() {
  const { data: ctx } = useSchema()
  return ctx && veEquipo(ctx) ? <ResultadosEquipo ctx={ctx} /> : <ResultadosPropios />
}
