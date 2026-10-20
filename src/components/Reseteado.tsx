import { cn } from './ui/cn'

/** "Reseteado: Verdadero / Falso" (columna reseteado de clientes). */
export function Reseteado({ valor, className }: { valor: boolean; className?: string }) {
  return (
    <p className={cn('text-sm text-muted', className)}>
      Reseteado:{' '}
      <strong className={cn('font-semibold', valor ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg')}>
        {valor ? 'Verdadero' : 'Falso'}
      </strong>
    </p>
  )
}
