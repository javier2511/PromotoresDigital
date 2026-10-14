import type { ReactNode } from 'react'
import { cn } from './cn'

export interface Segment<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: Segment<T>[]
  className?: string
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex rounded-xl bg-soft p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition',
              active ? 'bg-card text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] tabular-nums',
                  active ? 'bg-brand-600 text-white' : 'bg-line text-muted',
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
