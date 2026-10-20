import { ChartColumn, RefreshCw, Search, Smartphone, Store, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ErrorState } from '../components/ErrorState'
import { PageTitle } from '../components/PageHeader'
import { Card } from '../components/ui/Card'
import { cn } from '../components/ui/cn'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { useClientes, useResultados } from '../data/hooks'
import { resumirResultados, type Resumen } from '../data/resultados'
import type { Row } from '../lib/supabase'
import { ETIQUETA_INDICADOR } from '../config/schema'
import { esVacio, formatValue, humanize, isNumeric, normalize } from '../lib/text'

const OCULTAS = /^(id|uuid|created_at|updated_at|inserted_at|modified_at)$/i
const PORCENTAJE = /porc|pct|percent|cumpl|avance|efectiv|logro/i

interface Tarjeta {
  key: string
  titulo: string
  fecha: string | null
  campos: { label: string; value: unknown; column: string }[]
  texto: string
}

function Valor({ column, value }: { column: string; value: unknown }) {
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

export function ResultadosPage() {
  const { clientes, ctx, error: clientesError } = useClientes()
  const clienteKeys = useMemo(() => (clientes ? new Set(clientes.map((c) => c.key)) : undefined), [clientes])
  const { resultados, isPending, isFetching, error, refetch } = useResultados(clienteKeys)
  const [q, setQ] = useState('')

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
      const usadas = new Set([cols.usuario, cliente ? cols.cliente : undefined, cols.titulo, cols.fecha].filter(Boolean))
      const campos = Object.entries(row)
        .filter(([column, value]) => !usadas.has(column) && !OCULTAS.test(column) && !esVacio(value))
        .map(([column, value]) => ({ column, label: humanize(column), value }))
      const fecha = cols.fecha && row[cols.fecha] ? formatValue(row[cols.fecha]) : null
      const texto = normalize([titulo, fecha, ...campos.map((c) => formatValue(c.value))].join(' '))
      return { key: String(row.id ?? i), titulo, fecha, campos, texto }
    })
  }, [resultados, ctx, clientes])

  const resumen = useMemo(() => {
    if (!resultados || !ctx || resultados.rows.length === 0) return null
    const cols = ctx.tables.resultados.columns
    return resumirResultados(resultados.rows, cols.cliente, cols.indicador)
  }, [resultados, ctx])

  const term = normalize(q)
  const visibles = term ? tarjetas.filter((t) => t.texto.includes(term)) : tarjetas
  const anyError = clientesError ?? error

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
      <PageTitle
        title="Resultados"
        subtitle="Cargados por tu administrador"
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

      {resumen && !anyError && <ResumenCard resumen={resumen} />}

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
        {anyError ? (
          <ErrorState error={anyError} onRetry={refetch} />
        ) : isPending ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : !resultados?.table ? (
          <EmptyState icon={ChartColumn} title="Aún no hay resultados">
            Cuando tu administrador cargue tus resultados aparecerán aquí.
          </EmptyState>
        ) : visibles.length === 0 ? (
          <EmptyState icon={q ? Search : ChartColumn} title={q ? 'Sin coincidencias' : 'Aún no hay resultados'}>
            {q ? `Nada coincide con “${q}”.` : 'Cuando tu administrador cargue tus resultados aparecerán aquí.'}
          </EmptyState>
        ) : (
          <>
            <p className="mb-3 px-1 text-sm text-muted">
              {visibles.length} registro{visibles.length === 1 ? '' : 's'}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {visibles.map((t) => (
                <Card key={t.key} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[16px] leading-snug font-semibold">{t.titulo}</h2>
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
    </div>
  )
}
