import { Check } from 'lucide-react'
import type { CSSProperties } from 'react'
import { hueFrom, initials } from '../lib/text'
import { cn } from './ui/cn'

export function ClienteAvatar({
  nombre,
  visitado,
  className,
}: {
  nombre: string
  visitado?: boolean
  className?: string
}) {
  if (visitado) {
    return (
      <div
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
          className,
        )}
      >
        <Check className="size-6" strokeWidth={2.6} />
      </div>
    )
  }
  return (
    <div
      style={{ '--h': hueFrom(nombre) } as CSSProperties}
      className={cn(
        'grid size-12 shrink-0 place-items-center rounded-2xl text-[15px] font-bold',
        'bg-[hsl(var(--h)_80%_55%/0.14)] text-[hsl(var(--h)_60%_36%)] dark:text-[hsl(var(--h)_75%_74%)]',
        className,
      )}
    >
      {initials(nombre)}
    </div>
  )
}
