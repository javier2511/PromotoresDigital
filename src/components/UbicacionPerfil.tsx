import { useQueryClient } from '@tanstack/react-query'
import { LocateFixed } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { queryKeys } from '../data/hooks'
import { guardarUbicacionPerfil } from '../data/perfil'
import { friendlyError } from '../lib/errors'
import { clearSchemaCache, type SchemaContext } from '../lib/schema-resolver'
import { useUser } from '../providers/AuthProvider'
import { useGeo } from '../providers/GeoProvider'
import { Button } from './ui/Button'

/** Estado de la ubicación del usuario en su tabla (promotores) y botón para guardarla a mano. */
export function UbicacionPerfil({ ctx }: { ctx: SchemaContext }) {
  const user = useUser()
  const { getFresh } = useGeo()
  const queryClient = useQueryClient()
  const [guardando, setGuardando] = useState(false)
  const t = ctx.tables.perfiles
  if (!t.table || !(t.columns.latitud || t.columns.ubicacion)) return null

  const columnas = [t.columns.latitud, t.columns.longitud].filter(Boolean).join(' / ') || t.columns.ubicacion

  const guardar = async () => {
    setGuardando(true)
    try {
      const pos = await getFresh()
      await guardarUbicacionPerfil(ctx, pos)
      clearSchemaCache()
      await queryClient.invalidateQueries({ queryKey: queryKeys.schema(user.id) })
      toast.success(`Ubicación guardada (±${Math.round(pos.accuracy)} m)`)
    } catch (error) {
      const code = (error as GeolocationPositionError | null)?.code
      toast.error(
        code === 1
          ? 'El navegador no dio permiso de ubicación. Actívalo en los ajustes del sitio.'
          : code === 2 || code === 3
            ? 'No se pudo obtener la ubicación. Revisa que el GPS esté encendido.'
            : friendlyError(error),
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex items-center gap-3 border-t border-line pt-2.5">
      <p className="min-w-0 flex-1 text-muted">
        Tu ubicación en <code className="rounded bg-soft px-1 font-mono text-fg">{t.table}</code> ({columnas}):{' '}
        {!ctx.perfil ? (
          <strong className="text-amber-600">aún no tienes fila</strong>
        ) : ctx.perfil.conUbicacion === false ? (
          <strong className="text-amber-600">vacía</strong>
        ) : (
          <strong className="text-emerald-600">guardada</strong>
        )}
      </p>
      {ctx.perfil && ctx.perfil.conUbicacion === false && (
        <Button size="sm" variant="secondary" loading={guardando} icon={<LocateFixed className="size-4" />} onClick={guardar}>
          Guardar ahora
        </Button>
      )}
    </div>
  )
}
