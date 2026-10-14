import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, CircleAlert, CircleCheck, ClipboardCopy, ClipboardList, MapPin, Navigation, RotateCw, Save, SearchX, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ErrorState } from '../components/ErrorState'
import { TopBar } from '../components/PageHeader'
import { QuestionInput } from '../components/QuestionField'
import { StartVisitButton, useVisitGate, VisitGateCard } from '../components/VisitGate'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { cn } from '../components/ui/cn'
import { ConfirmDialog, Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { RADIO_VISITA_M } from '../config/app'
import type { Cliente } from '../data/clientes'
import { queryKeys, useClientes, useFormulario } from '../data/hooks'
import { borrarVisita, finalizarVisita } from '../data/visitas'
import { clearDraft, loadDraft, rememberFinished, saveDraft, type VisitDraft } from '../lib/draft'
import { detalleDeError, friendlyError, guardarUltimoError, isNetworkError, textoDetalle, type DetalleError } from '../lib/errors'
import { formatDistance } from '../lib/geo'
import { isAnswered, type AnswerValue } from '../lib/questions'
import { visibleQuestions } from '../lib/rules'
import { useUser } from '../providers/AuthProvider'

export interface VisitaFinalizadaState {
  respuestas: number
  warning: string | null
}

/** Le recuerda al promotor a qué distancia del cliente inició la visita (queda registrada). */
function DistanciaInicio({ distancia, conUbicacion }: { distancia: number | null; conUbicacion: boolean }) {
  if (!conUbicacion) return null
  if (distancia === null) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-muted">
        <MapPin className="size-4 shrink-0" /> Se registró tu ubicación al iniciar la visita.
      </div>
    )
  }
  const lejos = distancia > RADIO_VISITA_M
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm',
        lejos
          ? 'border-amber-300/70 bg-amber-500/10 text-amber-900 dark:border-amber-800 dark:text-amber-200'
          : 'border-emerald-300/60 bg-emerald-500/8 text-emerald-900 dark:border-emerald-800 dark:text-emerald-200',
      )}
    >
      <Navigation className="size-4 shrink-0" />
      {lejos
        ? `Iniciaste esta visita a ${formatDistance(distancia)} del cliente. La distancia queda registrada.`
        : `Iniciaste la visita en el punto de venta (a ${formatDistance(distancia)}).`}
    </div>
  )
}

function FormSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </div>
  )
}

export function VisitaPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const user = useUser()
  const queryClient = useQueryClient()
  const { clientes, ctx, isPending: clientesPending, error: clientesError, refetch } = useClientes()
  const { formulario, isPending: formPending, error: formError, refetch: refetchForm } = useFormulario()
  const cliente = clientes?.find((c) => c.key === id)
  const gate = useVisitGate(cliente)

  const [draft, setDraft] = useState<VisitDraft | null>(() => loadDraft(user.id, id))
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const finished = useRef(false)
  const [discarding, setDiscarding] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<DetalleError | null>(null)


  // Autoguardado del borrador en el teléfono.
  useEffect(() => {
    if (draft && !finished.current) saveDraft(user.id, id, draft)
  }, [draft, user.id, id])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const answers = useMemo(() => draft?.answers ?? {}, [draft])
  const visible = useMemo(
    () => (formulario ? visibleQuestions(formulario.questions, formulario.rules, answers) : new Set<string>()),
    [formulario, answers],
  )
  const preguntas = useMemo(() => formulario?.questions.filter((q) => visible.has(q.key)) ?? [], [formulario, visible])
  const faltantes = preguntas.filter((q) => q.required && !isAnswered(answers[q.key]))
  const respondidas = preguntas.filter((q) => isAnswered(answers[q.key])).length

  const mutation = useMutation({
    mutationFn: () =>
      finalizarVisita({
        ctx: ctx!,
        user,
        cliente: cliente!,
        clientes: clientes!,
        questions: formulario?.questions ?? [],
        visible,
        answers,
        startedAt: draft!.startedAt,
        position: draft!.position,
        visitaPrevia: draft!.visita,
        // Si después falla otro paso, el reintento reutiliza esta visita en lugar de crear otra.
        onVisitaGuardada: (visita) => setDraft((prev) => (prev ? { ...prev, visita } : prev)),
      }),
    onSuccess: (result) => {
      finished.current = true
      clearDraft(user.id, id)
      if (result.warning) rememberFinished(user.id, id)
      queryClient.setQueryData<Cliente[]>(queryKeys.clientes(user.id), (old) =>
        old?.map((c) => (c.key === id ? { ...c, visitado: true } : c)),
      )
      void queryClient.invalidateQueries({ queryKey: queryKeys.clientes(user.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.resultados(user.id) })
      const state: VisitaFinalizadaState = { respuestas: result.respuestas, warning: result.warning }
      navigate(`/clientes/${encodeURIComponent(id)}/visita/finalizada`, { replace: true, state })
    },
    onError: (err) => {
      if (isNetworkError(err)) {
        toast.error('Sin conexión. Tus respuestas siguen guardadas en este teléfono; inténtalo de nuevo cuando tengas señal.', {
          duration: 8000,
        })
        return
      }
      const detalle = detalleDeError(err)
      guardarUltimoError(detalle)
      setErrorGuardado(detalle)
    },
  })

  const setAnswer = (key: string, value: AnswerValue) => {
    if (highlight === key) setHighlight(null)
    setDraft((prev) => (prev ? { ...prev, answers: { ...prev.answers, [key]: value } } : prev))
  }

  const onFinish = () => {
    const first = faltantes[0]
    if (first) {
      setHighlight(first.key)
      document.getElementById(`q-${first.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      toast.warning(
        faltantes.length === 1
          ? 'Falta 1 pregunta obligatoria'
          : `Faltan ${faltantes.length} preguntas obligatorias`,
      )
      return
    }
    setConfirmOpen(true)
  }

  const error = clientesError ?? formError
  if (error) {
    return (
      <>
        <TopBar title="Visita" backTo="/" />
        <ErrorState error={error} onRetry={() => (clientesError ? refetch() : refetchForm())} />
      </>
    )
  }
  if (clientesPending || formPending) {
    return (
      <>
        <TopBar title="Visita" backTo="/" />
        <FormSkeleton />
      </>
    )
  }
  if (!cliente) {
    return (
      <>
        <TopBar title="Visita" backTo="/" />
        <EmptyState icon={SearchX} title="Cliente no encontrado" action={<ButtonLink to="/">Ver mis clientes</ButtonLink>} />
      </>
    )
  }
  // Con una visita empezada se muestra el formulario aunque el cliente ya aparezca como visitado
  // (p. ej. la visita se guardó pero faltó un paso): así se puede terminar o descartar.
  if (cliente.visitado && !draft && !mutation.isPending && !mutation.isSuccess) {
    return (
      <>
        <TopBar title={cliente.nombre} backTo="/" />
        <EmptyState
          icon={CircleCheck}
          tone="success"
          title="Este cliente ya fue visitado"
          action={<ButtonLink to="/">Ver mis clientes</ButtonLink>}
        />
      </>
    )
  }
  if (!draft) {
    return (
      <>
        <TopBar title={cliente.nombre} subtitle="Iniciar visita" backTo={`/clientes/${encodeURIComponent(id)}`} />
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
          <VisitGateCard gate={gate} />
          <StartVisitButton cliente={cliente} onStart={(inicio) => setDraft({ ...inicio, updatedAt: Date.now() })} />
          <p className="text-center text-sm text-muted">Al iniciar se registra tu ubicación y la distancia al cliente.</p>
        </div>
      </>
    )
  }

  const minutos = Math.max(0, Math.floor((now - draft.startedAt) / 60_000))
  const progreso = preguntas.length ? respondidas / preguntas.length : 1

  return (
    <div className="pb-[calc(8rem+env(safe-area-inset-bottom))]">
      <TopBar
        title={cliente.nombre}
        subtitle={`Visita en curso · ${minutos < 1 ? 'recién iniciada' : `${minutos} min`}`}
        backTo={`/clientes/${encodeURIComponent(id)}`}
        actions={
          <button
            type="button"
            onClick={() => setDiscardOpen(true)}
            aria-label="Descartar visita"
            className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-soft hover:text-red-600"
          >
            <Trash2 className="size-5" />
          </button>
        }
      >
        <div className="h-1 bg-line">
          <div
            className="h-full bg-emerald-500 transition-[width] duration-500"
            style={{ width: `${Math.round(progreso * 100)}%` }}
          />
        </div>
      </TopBar>

      <div className="mx-auto max-w-2xl space-y-3 px-4 pt-4 sm:px-6">
        <DistanciaInicio distancia={draft.position?.distance ?? null} conUbicacion={Boolean(draft.position)} />
        <p className="flex items-center gap-2 px-1 text-xs text-muted">
          <Save className="size-3.5" /> Tus respuestas se guardan automáticamente en este teléfono.
        </p>

        {preguntas.length === 0 ? (
          <Card>
            <EmptyState icon={ClipboardList} title="Sin preguntas">
              No hay preguntas configuradas para este formulario. Puedes finalizar la visita para registrarla.
            </EmptyState>
          </Card>
        ) : (
          preguntas.map((q, i) => {
            const answered = isAnswered(answers[q.key])
            return (
              <Card
                key={q.key}
                id={`q-${q.key}`}
                className={cn(
                  'animate-rise scroll-mt-28 p-4 transition-shadow',
                  highlight === q.key && 'animate-shake ring-2 ring-red-400',
                )}
              >
                <div className="flex gap-3">
                  <span
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition',
                      answered ? 'bg-emerald-500 text-white' : 'bg-brand-500/12 text-brand-700 dark:text-brand-300',
                    )}
                  >
                    {answered ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] leading-snug font-semibold">
                      {q.text}
                      {q.required && <span className="ml-0.5 text-red-500" aria-label="obligatoria">*</span>}
                    </p>
                    {q.help && <p className="mt-1 text-sm text-muted">{q.help}</p>}
                    <div className="mt-3.5">
                      <QuestionInput question={q} value={answers[q.key]} onChange={(v) => setAnswer(q.key, v)} />
                    </div>
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </div>

      {/* Barra inferior */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:left-64">
        <div className="mx-auto max-w-2xl">
          <p className="mb-2 text-center text-xs text-muted">
            {faltantes.length > 0
              ? `${respondidas} de ${preguntas.length} respondidas · ${faltantes.length} obligatoria${faltantes.length === 1 ? '' : 's'} pendiente${faltantes.length === 1 ? '' : 's'}`
              : preguntas.length > 0
                ? '¡Listo! Ya puedes finalizar la visita'
                : 'Visita sin preguntas'}
          </p>
          <Button
            size="lg"
            variant={faltantes.length ? 'primary' : 'success'}
            className="w-full"
            onClick={onFinish}
            loading={mutation.isPending}
            icon={<CircleCheck className="size-5" />}
          >
            Finalizar visita
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="¿Finalizar la visita?"
        confirmLabel="Sí, finalizar"
        confirmVariant="success"
        loading={mutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => mutation.mutate(undefined, { onSettled: () => setConfirmOpen(false) })}
      >
        Se guardarán {respondidas} respuesta{respondidas === 1 ? '' : 's'} de <strong className="text-fg">{cliente.nombre}</strong>{' '}
        y el cliente se marcará como visitado. Después ya no podrás editarlas.
      </ConfirmDialog>

      <Dialog open={errorGuardado !== null} onClose={() => setErrorGuardado(null)} labelledBy="error-guardar">
        {errorGuardado && (
          <>
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-500/12 text-red-600">
                <CircleAlert className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 id="error-guardar" className="text-lg font-semibold">
                  No se pudo guardar la visita
                </h2>
                <p className="mt-1 text-sm text-muted">{friendlyError({ message: errorGuardado.mensaje, code: errorGuardado.codigo })}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">Tus respuestas siguen guardadas en este teléfono.</p>
            <details className="mt-3 rounded-xl bg-soft px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium">Detalle técnico</summary>
              <pre className="mt-2 max-h-48 overflow-auto font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap text-muted">
                {textoDetalle(errorGuardado)}
              </pre>
            </details>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                icon={<ClipboardCopy className="size-4" />}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(textoDetalle(errorGuardado))
                    toast.success('Detalle copiado')
                  } catch {
                    toast.error('No se pudo copiar')
                  }
                }}
              >
                Copiar detalle
              </Button>
              <Button
                onClick={() => {
                  setErrorGuardado(null)
                  mutation.mutate()
                }}
                icon={<RotateCw className="size-4" />}
              >
                Reintentar
              </Button>
            </div>
          </>
        )}
      </Dialog>

      <ConfirmDialog
        open={discardOpen}
        title="¿Descartar esta visita?"
        confirmLabel="Descartar"
        confirmVariant="danger"
        loading={discarding}
        onCancel={() => setDiscardOpen(false)}
        onConfirm={async () => {
          // Si la visita llegó a guardarse a medias, se intenta borrar para no dejarla huérfana.
          const parcial = draft.visita
          if (parcial && parcial.id !== null && ctx) {
            setDiscarding(true)
            const borrada = await borrarVisita(ctx, parcial.id)
            setDiscarding(false)
            if (!borrada) {
              toast.error('No se pudo borrar la visita guardada a medias. Revisa tu conexión e inténtalo de nuevo.')
              return
            }
          }
          finished.current = true
          clearDraft(user.id, id)
          toast('Visita descartada')
          navigate(`/clientes/${encodeURIComponent(id)}`, { replace: true })
        }}
      >
        Se borrarán las respuestas que llevas. El cliente seguirá pendiente.
      </ConfirmDialog>
    </div>
  )
}
