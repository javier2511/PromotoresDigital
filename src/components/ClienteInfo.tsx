import { Coins } from 'lucide-react'
import { useMemo } from 'react'
import { TITULO_METRICAS } from '../config/schema'
import type { Cliente } from '../data/clientes'
import { columnasInternas, resolverInfoCliente, type CampoEncontrado } from '../lib/info-cliente'
import type { SchemaContext } from '../lib/schema-resolver'
import { formatValue } from '../lib/text'
import { Card, SectionTitle } from './ui/Card'

interface Dato {
  etiqueta: string
  valor: string
}

export function useInfoCliente(cliente: Cliente | undefined, ctx: SchemaContext | undefined): CampoEncontrado[] {
  const columnas = cliente ? Object.keys(cliente.raw).join('|') : ''
  return useMemo(
    () => (ctx && columnas ? resolverInfoCliente(columnas.split('|'), columnasInternas(ctx)) : []),
    [columnas, ctx],
  )
}

/** "Información del cliente": solo los datos configurados en INFO_CLIENTE (src/config/schema.ts). */
export function ClienteInfo({ cliente, ctx }: { cliente: Cliente; ctx: SchemaContext }) {
  const campos = useInfoCliente(cliente, ctx)
  const grupos = useMemo(() => {
    const out: Record<'destacado' | 'metrica' | 'dato', Dato[]> = { destacado: [], metrica: [], dato: [] }
    for (const campo of campos) {
      if (!campo.columna) continue
      out[campo.tipo].push({ etiqueta: campo.etiqueta, valor: formatValue(cliente.raw[campo.columna]) })
    }
    return out
  }, [campos, cliente])

  if (grupos.destacado.length + grupos.metrica.length + grupos.dato.length === 0) return null

  return (
    <section className="space-y-2">
      <SectionTitle>Información del cliente</SectionTitle>

      {grupos.destacado.map((d) => (
        <Card key={d.etiqueta} className="flex items-center gap-4 p-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
            <Coins className="size-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted">{d.etiqueta}</p>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{d.valor}</p>
          </div>
        </Card>
      ))}

      {grupos.metrica.length > 0 && (
        <Card className="p-4">
          <p className="text-sm font-semibold">{TITULO_METRICAS}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {grupos.metrica.map((m) => (
              <div key={m.etiqueta} className="rounded-xl bg-soft px-3 py-2.5">
                <p className="text-2xl font-bold tabular-nums">{m.valor}</p>
                <p className="text-xs text-muted">{m.etiqueta}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {grupos.dato.length > 0 && (
        <Card>
          <dl className="divide-y divide-line">
            {grupos.dato.map((d) => (
              <div key={d.etiqueta} className="flex items-start justify-between gap-4 px-4 py-3">
                <dt className="text-sm text-muted">{d.etiqueta}</dt>
                <dd className="min-w-0 text-right text-sm font-medium break-words">{d.valor}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </section>
  )
}
