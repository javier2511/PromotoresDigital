import { useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, ClipboardCopy, RotateCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ErrorState } from '../components/ErrorState'
import { TopBar } from '../components/PageHeader'
import { UbicacionPerfil } from '../components/UbicacionPerfil'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { cn } from '../components/ui/cn'
import { Skeleton } from '../components/ui/Skeleton'
import { schema, VALOR_ASIGNACION_COMPLETADA, type Schema } from '../config/schema'
import { columnaReseteado, semanaDeAsignaciones } from '../data/clientes'
import type { Formulario } from '../data/formulario'
import { queryKeys, useClientes, useFormulario, useSchema } from '../data/hooks'
import { columnasInternas, resolverInfoCliente } from '../lib/info-cliente'
import { leerUltimoError } from '../lib/errors'
import { hoyLocal, partesPeriodo } from '../lib/periodos'
import { describirRegla } from '../lib/rules'
import { clearSchemaCache, esAdmin, esLider, loadSchema, type ResolvedTable } from '../lib/schema-resolver'
import { useUser } from '../providers/AuthProvider'
import { useGeo } from '../providers/GeoProvider'

const TITULOS: Record<keyof Schema, string> = {
  clientes: 'Clientes',
  preguntas: 'Preguntas',
  reglas: 'Reglas de preguntas',
  visitas: 'Visitas',
  respuestas: 'Respuestas',
  resultados: 'Resultados',
  perfiles: 'Usuarios (opcional)',
  asignaciones: 'Asignaciones (opcional)',
  jornadas: 'Jornadas (opcional)',
}

const CAMPOS: Record<string, string> = {
  id: 'Id',
  nombre: 'Nombre',
  direccion: 'Dirección',
  latitud: 'Latitud',
  longitud: 'Longitud',
  ubicacion: 'Ubicación (una columna)',
  asignadoA: 'Usuario asignado',
  visitado: 'Marca de visitado',
  telefono: 'Teléfono',
  codigo: 'Código',
  texto: 'Texto de la pregunta',
  tipo: 'Tipo',
  opciones: 'Opciones',
  orden: 'Orden',
  obligatoria: 'Obligatoria',
  activa: 'Activa',
  ayuda: 'Ayuda',
  pregunta: 'Pregunta',
  dependeDe: 'Depende de la pregunta',
  valor: 'Valor esperado',
  operador: 'Operador',
  accion: 'Acción',
  cliente: 'Cliente',
  usuario: 'Usuario',
  inicio: 'Inicio',
  fin: 'Fin / fecha',
  distancia: 'Distancia',
  precision: 'Precisión GPS',
  estado: 'Estado',
  duracion: 'Duración',
  realizada: 'Visita realizada',
  diaVisita: 'Día de visita',
  reseteado: 'Reseteado (Sí/No)',
  rol: 'Rol (admin ve Equipo)',
  activo: 'Activo',
  asignacion: 'Asignación',
  finHora: 'Hora de fin',
  checkin: 'Check-in realizado',
  fechaCheckin: 'Fecha de check-in',
  latitudCheckin: 'Latitud check-in',
  longitudCheckin: 'Longitud check-in',
  ubicacionCheckin: 'Ubicación check-in',
  estatus: 'Estatus',
  latitudInicio: 'Latitud al iniciar',
  longitudInicio: 'Longitud al iniciar',
  precisionInicio: 'Precisión al iniciar',
  latitudFin: 'Latitud al terminar',
  longitudFin: 'Longitud al terminar',
  precisionFin: 'Precisión al terminar',
  visita: 'Visita',
  preguntaTexto: 'Texto de la pregunta',
  respuesta: 'Respuesta',
  fecha: 'Fecha',
  titulo: 'Título',
  indicador: 'Indicador del resumen (Sí/No)',
  authId: 'Id de usuario (auth)',
  email: 'Correo',
  registro: 'Fecha de registro (día en el Tablero)',
  minutosVisita: 'Minutos de visita (Tablero)',
  minutosNuevaVisita: 'Minutos a la siguiente visita (Tablero)',
  nombreCliente: 'Nombre del cliente',
  actualizado: 'Fecha de actualización',
}

function TableCard({ k, t }: { k: keyof Schema; t: ResolvedTable }) {
  const spec = schema[k]
  const required = new Set<string>(spec.required)
  const fields = Object.keys(spec.fields)
  const sinUbicacion = k === 'clientes' && !(t.columns as Record<string, string>).ubicacion &&
    !((t.columns as Record<string, string>).latitud && (t.columns as Record<string, string>).longitud)
  const ok = t.table && t.missingRequired.length === 0 && !sinUbicacion
  const optional = k === 'resultados' || k === 'perfiles' || k === 'reglas'

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line p-4">
        <div
          className={cn(
            'grid size-9 place-items-center rounded-xl',
            ok ? 'bg-emerald-500/12 text-emerald-600' : t.table || optional ? 'bg-amber-500/15 text-amber-600' : 'bg-red-500/12 text-red-600',
          )}
        >
          {ok ? <CircleCheck className="size-5" /> : t.table || optional ? <TriangleAlert className="size-5" /> : <CircleAlert className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{TITULOS[k]}</p>
          <p className="truncate text-sm text-muted">
            {t.table ? (
              <>
                Tabla <code className="rounded bg-soft px-1 font-mono text-[13px] text-fg">{t.table}</code>
              </>
            ) : (
              <>No se encontró ({spec.table.join(', ')})</>
            )}
          </p>
        </div>
        {t.table && !t.verified && <Badge tone="warning">Sin verificar</Badge>}
      </div>
      {t.table && (
        <dl className="divide-y divide-line text-sm">
          {fields.map((f) => {
            const col = (t.columns as Record<string, string | undefined>)[f]
            return (
              <div key={f} className="flex items-center justify-between gap-3 px-4 py-2">
                <dt className="text-muted">
                  {CAMPOS[f] ?? f}
                  {required.has(f) && <span className="text-red-500"> *</span>}
                </dt>
                <dd>
                  {col ? (
                    <code className="rounded bg-soft px-1.5 py-0.5 font-mono text-[13px]">{col}</code>
                  ) : (
                    <span className={required.has(f) ? 'font-semibold text-red-600' : 'text-muted'}>
                      {required.has(f) ? 'Falta' : '—'}
                    </span>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      )}
      {sinUbicacion && t.table && (
        <p className="border-t border-line bg-red-500/5 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
          No se encontraron columnas de ubicación (latitud/longitud).
        </p>
      )}
      {t.error && (
        <p className="border-t border-line bg-amber-500/5 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">{t.error}</p>
      )}
      {t.allColumns && (
        <details className="border-t border-line px-4 py-2.5 text-sm">
          <summary className="cursor-pointer text-muted">Columnas de la tabla ({t.allColumns.length})</summary>
          <p className="mt-2 font-mono text-[12px] break-words text-muted">{t.allColumns.join(', ')}</p>
        </details>
      )}
    </Card>
  )
}

/** Cómo entiende la app la tabla de reglas: columnas, cuántas reglas aplica y en qué términos. */
function ReglasCard({ formulario }: { formulario: Formulario }) {
  const { diagnostico: d, rules, questions } = formulario
  const numero = new Map(questions.map((q, i) => [q.key, i + 1]))
  const nombre = (key: string) => {
    const q = questions.find((x) => x.key === key)
    const texto = q ? (q.text.length > 48 ? `${q.text.slice(0, 48)}…` : q.text) : key
    return `P${numero.get(key) ?? '?'} «${texto}»`
  }
  const sinFilas = d.tabla !== null && d.leidas === 0
  const ok = d.tabla !== null && d.aplicadas > 0
  const columnas: [string, string | undefined][] = [
    ['Pregunta que se muestra', d.columnas.pregunta],
    ['Depende de la pregunta', d.columnas.dependeDe],
    ['Valor esperado', d.columnas.valor],
    ['Operador', d.columnas.operador],
    ['Acción', d.columnas.accion],
  ]
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line p-4">
        <div className={cn('grid size-9 place-items-center rounded-xl', ok ? 'bg-emerald-500/12 text-emerald-600' : 'bg-amber-500/15 text-amber-600')}>
          {ok ? <CircleCheck className="size-5" /> : <TriangleAlert className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Reglas de las preguntas</p>
          <p className="text-sm text-muted">
            {d.tabla
              ? `${d.leidas} reglas leídas de "${d.tabla}" · ${d.aplicadas} se aplican a ${questions.length} preguntas`
              : 'No se encontró la tabla de reglas: se muestran todas las preguntas.'}
          </p>
        </div>
      </div>
      {d.tabla && (
        <dl className="divide-y divide-line text-sm">
          {columnas.map(([label, col]) => (
            <div key={label} className="flex items-center justify-between gap-3 px-4 py-2">
              <dt className="text-muted">{label}</dt>
              <dd>
                {col ? <code className="rounded bg-soft px-1.5 py-0.5 font-mono text-[13px]">{col}</code> : <span className="text-muted">—</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {sinFilas && (
        <div className="border-t border-line bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-semibold">No se leyó ninguna regla</p>
          <p className="mt-1">
            Si en Supabase la tabla "{d.tabla}" sí tiene reglas, a los usuarios les falta permiso para leerla (política
            RLS de lectura). Ejecuta <code className="font-mono">supabase/05_permiso_leer_preguntas.sql</code> en el SQL
            Editor.
          </p>
        </div>
      )}
      {d.descartadas.length > 0 && (
        <div className="border-t border-line bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-semibold">Reglas que no se pudieron usar</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {d.descartadas.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {rules.length > 0 && (
        <details className="border-t border-line px-4 py-2.5 text-sm" open={rules.length <= 8}>
          <summary className="cursor-pointer text-muted">Cómo se interpretan ({rules.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {rules.slice(0, 30).map((r, i) => (
              <li key={i} className="rounded-lg bg-soft px-2.5 py-1.5 text-[13px]">
                {describirRegla(r, nombre)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}

/** Qué columna se usa para cada dato de la ficha del cliente (INFO_CLIENTE). */
function InfoClienteCard({ columnas, internas }: { columnas: string[] | null; internas: string[] }) {
  if (!columnas) return null
  const campos = resolverInfoCliente(columnas, internas)
  const encontrados = campos.filter((c) => c.columna).length
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line p-4">
        <div
          className={cn(
            'grid size-9 place-items-center rounded-xl',
            encontrados === campos.length ? 'bg-emerald-500/12 text-emerald-600' : 'bg-amber-500/15 text-amber-600',
          )}
        >
          {encontrados === campos.length ? <CircleCheck className="size-5" /> : <TriangleAlert className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Información del cliente</p>
          <p className="text-sm text-muted">
            {encontrados} de {campos.length} datos encontrados (se configuran en INFO_CLIENTE)
          </p>
        </div>
      </div>
      <dl className="divide-y divide-line text-sm">
        {campos.map((c) => (
          <div key={c.etiqueta} className="flex items-center justify-between gap-3 px-4 py-2">
            <dt className="text-muted">{c.etiqueta}</dt>
            <dd>
              {c.columna ? (
                <code className="rounded bg-soft px-1.5 py-0.5 font-mono text-[13px]">{c.columna}</code>
              ) : (
                <span className="font-semibold text-amber-700 dark:text-amber-300">No encontrada</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

export function DiagnosticoPage() {
  const user = useUser()
  const queryClient = useQueryClient()
  const { data: ctx, isPending, error, refetch } = useSchema()
  const { clientes } = useClientes()
  const { formulario } = useFormulario()
  const { position, status } = useGeo()
  const [busy, setBusy] = useState(false)

  const redetectar = async () => {
    setBusy(true)
    try {
      clearSchemaCache()
      const fresh = await loadSchema(user, { force: true })
      queryClient.setQueryData(queryKeys.schema(user.id), fresh)
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'schema' })
      toast.success('Detección actualizada')
    } catch (err) {
      toast.error(String((err as Error).message ?? err))
    } finally {
      setBusy(false)
    }
  }

  const copiar = async () => {
    const reporte = {
      fecha: new Date().toISOString(),
      usuario: { id: user.id, email: user.email },
      tablas: ctx?.tables,
      filtroClientes: ctx?.owner,
      perfil: ctx?.perfil ? { encontrado: true, rol: ctx.perfil.rol ?? null, conUbicacion: ctx.perfil.conUbicacion ?? null } : null,
      version: __BUILD__,
      gps: position ? { precision: Math.round(position.accuracy) } : status,
      conteos: {
        clientes: clientes?.length ?? null,
        clientesConUbicacion: clientes?.filter((c) => c.location).length ?? null,
        preguntas: formulario?.questions.length ?? null,
        reglas: formulario?.rules.length ?? null,
      },
      reglas: formulario?.diagnostico ?? null,
      preguntas: formulario?.questions.map((q) => ({ id: q.id, texto: q.text, tipo: q.type, opciones: q.options })) ?? null,
      ultimoErrorAlGuardar: leerUltimoError(),
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(reporte, null, 2))
      toast.success('Reporte copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <div className="pb-10">
      <TopBar title="Verificar conexión" subtitle="Tablas y columnas detectadas en Supabase" backTo="/perfil" />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 sm:px-6">
        <p className="text-sm text-muted">
          La app se adapta a tu base de datos sin cambiarla. Aquí ves qué tabla y columna usa para cada dato. Si algo está
          mal, edita <code className="rounded bg-soft px-1 font-mono">src/config/schema.ts</code> dejando solo el nombre
          correcto.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={redetectar} loading={busy} icon={<RotateCw className="size-4" />}>
            Volver a detectar
          </Button>
          <Button variant="secondary" onClick={copiar} icon={<ClipboardCopy className="size-4" />}>
            Copiar reporte
          </Button>
        </div>

        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isPending || !ctx ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            <Card className="space-y-2 p-4 text-sm">
              <p className="font-semibold">Tus datos</p>
              <p className="text-muted">
                {ctx.tables.asignaciones.table && ctx.tables.asignaciones.columns.cliente && ctx.tables.asignaciones.columns.usuario ? (
                  <>
                    Clientes asignados en <code className="rounded bg-soft px-1 font-mono text-fg">{ctx.tables.asignaciones.table}</code>{' '}
                    (<code className="rounded bg-soft px-1 font-mono text-fg">{ctx.tables.asignaciones.columns.usuario}</code> = tu
                    usuario). Visitado ={' '}
                    <code className="rounded bg-soft px-1 font-mono text-fg">{ctx.tables.asignaciones.columns.estatus ?? 'estatus'}</code>{' '}
                    "{VALOR_ASIGNACION_COMPLETADA}".
                    {semanaDeAsignaciones(ctx) && (
                      <>
                        {' '}
                        Solo las de esta semana:{' '}
                        <code className="rounded bg-soft px-1 font-mono text-fg">{ctx.tables.asignaciones.columns.fecha}</code> del{' '}
                        {partesPeriodo(semanaDeAsignaciones(ctx)!, hoyLocal()).titulo}.
                      </>
                    )}
                  </>
                ) : ctx.owner?.error ? (
                  <span className="text-red-700 dark:text-red-300">
                    La columna <code className="rounded bg-soft px-1 font-mono text-fg">{ctx.owner.column}</code> de clientes no
                    se pudo comparar con tu usuario ({ctx.owner.error}). Por seguridad no se muestran clientes. Revisa qué valor
                    guardas en esa columna (uuid del usuario, su correo o el id de tu tabla de usuarios).
                  </span>
                ) : ctx.owner ? (
                  <>
                    Clientes filtrados por <code className="rounded bg-soft px-1 font-mono text-fg">{ctx.owner.column}</code>{' '}
                    = tu {ctx.owner.via === 'email' ? 'correo' : ctx.owner.via === 'perfil' ? 'id de usuario (tabla de usuarios)' : 'id de usuario (uuid)'}
                    {ctx.owner.matched ? '.' : ', pero no hay clientes con ese valor.'}
                  </>
                ) : (
                  'No se encontró una columna de usuario en clientes: se muestran los que permitan las políticas RLS.'
                )}
              </p>
              <p className="text-muted">
                Clientes: <strong className="text-fg">{clientes?.length ?? '…'}</strong> · con ubicación:{' '}
                <strong className="text-fg">{clientes?.filter((c) => c.location).length ?? '…'}</strong> · preguntas:{' '}
                <strong className="text-fg">{formulario?.questions.length ?? '…'}</strong> · reglas:{' '}
                <strong className="text-fg">{formulario?.rules.length ?? '…'}</strong>
              </p>
              {(() => {
                const columnas = ctx.tables.clientes.allColumns ?? (clientes?.[0] ? Object.keys(clientes[0].raw) : [])
                const col = columnaReseteado(ctx, columnas)
                return (
                  <p className="text-muted">
                    "Reseteado" debajo del nombre:{' '}
                    {col ? (
                      <code className="rounded bg-soft px-1 font-mono text-fg">{col}</code>
                    ) : (
                      'no se encontró una columna con "reset" en clientes (se muestra la dirección)'
                    )}
                  </p>
                )
              })()}
              <p className="text-muted">
                Tu fila en <code className="rounded bg-soft px-1 font-mono text-fg">{ctx.tables.perfiles.table ?? 'usuarios'}</code>:{' '}
                {!ctx.perfil ? (
                  <strong className="text-amber-600">no se encontró</strong>
                ) : (
                  <>
                    rol <strong className="text-fg">{ctx.perfil.rol ?? '—'}</strong>, región{' '}
                    <strong className="text-fg">{ctx.perfil.region ?? '—'}</strong>
                    {esAdmin(ctx)
                      ? ' → ves Tablero, Resultados y Equipo de todos y puedes crear usuarios'
                      : esLider(ctx)
                        ? ctx.perfil.region
                          ? ` → ves Tablero y Resultados de la región ${ctx.perfil.region}`
                          : ' → como líder necesitas una región para ver a tu equipo'
                        : ' (admin: ve todo; lider: ve su región)'}
                  </>
                )}
              </p>
              <UbicacionPerfil ctx={ctx} />
            </Card>
            {formulario && <ReglasCard formulario={formulario} />}
            <InfoClienteCard
              columnas={ctx.tables.clientes.allColumns ?? (clientes?.[0] ? Object.keys(clientes[0].raw) : null)}
              internas={columnasInternas(ctx)}
            />
            {(Object.keys(ctx.tables) as (keyof Schema)[]).map((k) => (
              <TableCard key={k} k={k} t={ctx.tables[k] as ResolvedTable} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
