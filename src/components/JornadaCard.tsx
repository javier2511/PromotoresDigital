import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, Flag, Play, RotateCw, Sunrise } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { queryKeys, useSchema } from '../data/hooks'
import { fetchJornadaHoy, iniciarJornada, terminarJornada, type Jornada } from '../data/jornada'
import { friendlyError } from '../lib/errors'
import { useUser } from '../providers/AuthProvider'
import { useGeo, type GeoPosition } from '../providers/GeoProvider'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { cn } from './ui/cn'
import { ConfirmDialog } from './ui/Dialog'
import { Skeleton } from './ui/Skeleton'

const horaFormato = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' })
const hora = (iso: string | number | Date) => horaFormato.format(new Date(iso))

function duracion(desde: string, hasta: string | number = Date.now()): string {
  const min = Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000))
  const h = Math.floor(min / 60)
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`
}

/** Re-dibuja cada minuto mientras la jornada está en curso (para la duración). */
function useAhora(activo: boolean): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    if (!activo) return
    const id = window.setInterval(() => setAhora(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [activo])
  return ahora
}

/** Inicio y fin de la jornada del promotor (check-in / check-out del día). */
export function JornadaCard() {
  const user = useUser()
  const { data: ctx } = useSchema()
  const { getFresh } = useGeo()
  const queryClient = useQueryClient()
  const [confirmFin, setConfirmFin] = useState(false)
  const t = ctx?.tables.jornadas
  const habilitada = Boolean(t?.table && t.columns.usuario && t.columns.inicio)
  const key = queryKeys.jornada(user.id)

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchJornadaHoy(ctx!, user),
    enabled: habilitada,
    staleTime: 60_000,
  })
  const jornada = query.data ?? null
  const ahora = useAhora(Boolean(jornada && !jornada.fin))

  const ubicacion = async (): Promise<GeoPosition | null> => {
    try {
      return await getFresh()
    } catch {
      return null
    }
  }
  const avisoSinUbicacion = (pos: GeoPosition | null) => {
    if (!pos) toast.warning('Se registró sin ubicación: activa el GPS para que quede dónde estabas.')
  }

  const iniciar = useMutation({
    mutationFn: async () => {
      const pos = await ubicacion()
      return { jornada: await iniciarJornada(ctx!, user, pos), pos }
    },
    onSuccess: ({ jornada: nueva, pos }) => {
      queryClient.setQueryData<Jornada | null>(key, nueva)
      toast.success(`Jornada iniciada a las ${hora(nueva.inicio)}`)
      avisoSinUbicacion(pos)
    },
    onError: (error) => toast.error(friendlyError(error)),
  })

  const terminar = useMutation({
    mutationFn: async () => {
      const pos = await ubicacion()
      await terminarJornada(ctx!, user, jornada!, pos)
      return pos
    },
    onSuccess: (pos) => {
      setConfirmFin(false)
      queryClient.setQueryData<Jornada | null>(key, (old) => (old ? { ...old, fin: new Date().toISOString() } : old))
      void queryClient.invalidateQueries({ queryKey: key })
      toast.success('Jornada terminada. ¡Buen trabajo!')
      avisoSinUbicacion(pos)
    },
    onError: (error) => {
      setConfirmFin(false)
      toast.error(friendlyError(error))
    },
  })

  if (!habilitada) return null
  if (query.isPending) return <Skeleton className="h-[72px] rounded-2xl" />

  const enCurso = jornada !== null && !jornada.fin
  const icono = 'grid size-11 shrink-0 place-items-center rounded-xl'

  return (
    <Card className="flex items-center gap-3 p-3.5" aria-live="polite">
      {query.isError ? (
        <>
          <div className={cn(icono, 'bg-soft text-muted')}>
            <Sunrise className="size-5" />
          </div>
          <p className="min-w-0 flex-1 text-sm text-muted">No se pudo cargar tu jornada de hoy.</p>
          <Button size="sm" variant="secondary" icon={<RotateCw className="size-4" />} onClick={() => query.refetch()}>
            Reintentar
          </Button>
        </>
      ) : !jornada ? (
        <>
          <div className={cn(icono, 'bg-brand-500/12 text-brand-600 dark:text-brand-300')}>
            <Sunrise className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Jornada de hoy</p>
            <p className="text-sm text-muted">Aún no la inicias</p>
          </div>
          <Button size="sm" icon={<Play className="size-4" />} loading={iniciar.isPending} onClick={() => iniciar.mutate()}>
            Iniciar jornada
          </Button>
        </>
      ) : enCurso ? (
        <>
          <div className={cn(icono, 'relative bg-emerald-500/12 text-emerald-600')}>
            <Play className="size-5" />
            <span aria-hidden className="absolute top-1.5 right-1.5 size-2 animate-pulse rounded-full bg-emerald-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Jornada en curso</p>
            <p className="text-sm text-muted">
              Desde {hora(jornada.inicio)} · <span className="font-medium text-fg tabular-nums">{duracion(jornada.inicio, ahora)}</span>
            </p>
          </div>
          <Button size="sm" variant="secondary" icon={<Flag className="size-4" />} onClick={() => setConfirmFin(true)}>
            Terminar
          </Button>
        </>
      ) : (
        <>
          <div className={cn(icono, 'bg-emerald-500/12 text-emerald-600')}>
            <CircleCheck className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Jornada terminada</p>
            <p className="text-sm text-muted">
              {hora(jornada.inicio)} – {hora(jornada.fin!)} ·{' '}
              <span className="font-medium text-fg tabular-nums">{duracion(jornada.inicio, jornada.fin!)}</span>
            </p>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmFin}
        title="¿Terminar tu jornada?"
        confirmLabel="Terminar jornada"
        loading={terminar.isPending}
        onCancel={() => setConfirmFin(false)}
        onConfirm={() => terminar.mutate()}
      >
        Se registrará la hora de salida ({hora(ahora)}) y tu ubicación.
        {jornada && <> Llevas {duracion(jornada.inicio, ahora)} de jornada.</>}
      </ConfirmDialog>
    </Card>
  )
}
