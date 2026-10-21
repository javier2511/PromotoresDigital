import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Database, LocateFixed, Radar, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { LogoutButton } from '../components/LogoutButton'
import { PageTitle } from '../components/PageHeader'
import { Card, SectionTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { APP_NAME, APP_VERSION, RADIO_VISITA_M } from '../config/app'
import { useClientes, useSchema } from '../data/hooks'
import { formatDistance } from '../lib/geo'
import { esAdmin } from '../lib/schema-resolver'
import { initials } from '../lib/text'
import { useUser } from '../providers/AuthProvider'
import { useGeo } from '../providers/GeoProvider'

function Row({ icon, title, detail, action }: { icon: ReactNode; title: string; detail?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-16 items-center gap-3 px-4 py-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft text-muted [&>svg]:size-5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{title}</p>
        {detail && <p className="truncate text-sm text-muted">{detail}</p>}
      </div>
      {action}
    </div>
  )
}

export function PerfilPage() {
  const user = useUser()
  const { data: ctx } = useSchema()
  const { progreso } = useClientes()
  const { status, position, request } = useGeo()
  const queryClient = useQueryClient()

  const nombre = ctx?.perfil?.nombre ?? (user.user_metadata?.full_name as string | undefined) ?? user.email?.split('@')[0] ?? ''

  const ubicacion =
    status === 'active' && position
      ? `Activa · precisión ±${Math.round(position.accuracy)} m`
      : status === 'locating'
        ? 'Buscando señal…'
        : status === 'denied'
          ? 'Bloqueada en el navegador'
          : status === 'unsupported'
            ? 'No disponible en este navegador'
            : 'Desactivada'

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 sm:px-6">
      <PageTitle title="Perfil" />

      <Card className="mt-5 flex items-center gap-4 p-5">
        <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-brand-700 text-xl font-bold text-white">
          {initials(nombre || 'P D')}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold capitalize">{nombre}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
          {ctx?.perfil?.rol && (
            <p className="mt-1">
              <Badge tone={esAdmin(ctx) ? 'brand' : 'neutral'}>{esAdmin(ctx) ? 'Administrador' : ctx.perfil.rol}</Badge>
            </p>
          )}
        </div>
      </Card>

      {progreso && (
        <div className="mt-3 grid grid-cols-3 gap-3">
          {[
            ['Asignados', progreso.total],
            ['Visitados', progreso.visitados],
            ['Pendientes', progreso.pendientes],
          ].map(([label, value]) => (
            <Card key={label} className="p-3.5 text-center">
              <p className="text-2xl font-bold tabular-nums">{value}</p>
              <p className="text-xs text-muted">{label}</p>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle className="mt-7 mb-2">Ajustes</SectionTitle>
      <Card className="divide-y divide-line">
        <Row
          icon={<LocateFixed />}
          title="Ubicación"
          detail={ubicacion}
          action={
            status !== 'active' && status !== 'denied' && status !== 'unsupported' ? (
              <Button size="sm" onClick={request}>
                Activar
              </Button>
            ) : undefined
          }
        />
        <Row icon={<Radar />} title="Radio para iniciar visitas" detail={`Debes estar a menos de ${formatDistance(RADIO_VISITA_M)} del cliente`} />
        <button
          type="button"
          className="w-full text-left transition hover:bg-soft"
          onClick={async () => {
            await queryClient.invalidateQueries()
            toast.success('Datos actualizados')
          }}
        >
          <Row icon={<RefreshCw />} title="Actualizar datos" detail="Vuelve a descargar tus clientes y el formulario" />
        </button>
        <Link to="/diagnostico" className="block transition hover:bg-soft">
          <Row
            icon={<Database />}
            title="Verificar conexión"
            detail="Revisa qué tablas y columnas de Supabase usa la app"
            action={<ChevronRight className="size-5 text-muted" />}
          />
        </Link>
      </Card>

      <LogoutButton className="mt-6" />

      <p className="mt-6 text-center text-xs text-muted">
        {APP_NAME} · versión {APP_VERSION} · {__BUILD__}
      </p>

    </div>
  )
}
