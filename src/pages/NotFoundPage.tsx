import { Compass } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Página no encontrada"
      className="min-h-[70dvh] justify-center"
      action={<ButtonLink to="/">Ir a mis clientes</ButtonLink>}
    >
      La dirección que abriste no existe.
    </EmptyState>
  )
}

/** Error inesperado al mostrar una pantalla (p. ej. falló la descarga de una parte de la app tras una actualización). */
export function RouteErrorPage() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error) ? error.statusText : error instanceof Error ? error.message : String(error)
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold">Algo salió mal</h1>
        <p className="mt-2 text-sm break-words text-muted">{message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Recargar la app
        </button>
      </div>
    </div>
  )
}
