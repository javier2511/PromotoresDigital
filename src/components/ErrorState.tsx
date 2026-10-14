import { CircleAlert, RotateCw, WifiOff } from 'lucide-react'
import { Link } from 'react-router'
import { friendlyError, isNetworkError } from '../lib/errors'
import { Button } from './ui/Button'
import { EmptyState } from './ui/EmptyState'

export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const offline = isNetworkError(error)
  return (
    <EmptyState
      icon={offline ? WifiOff : CircleAlert}
      tone={offline ? 'warning' : 'danger'}
      title={title ?? (offline ? 'Sin conexión' : 'No se pudo cargar la información')}
      action={
        <div className="flex flex-col items-center gap-3">
          {onRetry && (
            <Button onClick={onRetry} icon={<RotateCw className="size-4" />}>
              Reintentar
            </Button>
          )}
          {!offline && (
            <Link to="/diagnostico" className="text-sm font-semibold text-brand-600 dark:text-brand-300">
              Verificar conexión con la base de datos
            </Link>
          )}
        </div>
      }
    >
      {friendlyError(error)}
    </EmptyState>
  )
}
