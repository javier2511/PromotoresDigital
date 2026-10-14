import { LoaderCircle } from 'lucide-react'
import { cn } from './cn'

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cn('animate-spin', className ?? 'size-5')} />
}

export function FullScreenLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-3 text-muted">
        <Spinner className="size-7 text-brand-600" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  )
}
