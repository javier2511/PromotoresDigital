import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../providers/AuthProvider'
import { Button } from './ui/Button'
import { cn } from './ui/cn'
import { ConfirmDialog } from './ui/Dialog'

/**
 * Botón de cerrar sesión (con confirmación).
 * - 'boton': botón ancho (Perfil) · 'icono': ícono en el encabezado rojo · 'lateral': fila de la barra lateral.
 */
export function LogoutButton({ variant = 'boton', className }: { variant?: 'boton' | 'icono' | 'lateral'; className?: string }) {
  const { signOut } = useAuth()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState(false)

  const abrir = () => setConfirm(true)
  const boton =
    variant === 'icono' ? (
      <button
        type="button"
        onClick={abrir}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        className={cn('grid size-10 shrink-0 place-items-center rounded-full text-white/90 transition hover:bg-white/15', className)}
      >
        <LogOut className="size-5" />
      </button>
    ) : variant === 'lateral' ? (
      <button
        type="button"
        onClick={abrir}
        className={cn(
          'flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-muted transition hover:bg-red-500/10 hover:text-red-600',
          className,
        )}
      >
        <LogOut className="size-5" />
        Cerrar sesión
      </button>
    ) : (
      <Button variant="outline" size="lg" className={cn('w-full text-red-600', className)} onClick={abrir} icon={<LogOut className="size-5" />}>
        Cerrar sesión
      </Button>
    )

  return (
    <>
      {boton}
      <ConfirmDialog
        open={confirm}
        title="¿Cerrar sesión?"
        confirmLabel="Cerrar sesión"
        confirmVariant="danger"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false)
          void signOut().then(() => queryClient.clear())
        }}
      >
        Las visitas en curso que no hayas finalizado se quedan guardadas en este teléfono.
      </ConfirmDialog>
    </>
  )
}
