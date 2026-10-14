import type { ReactNode } from 'react'
import { cn } from './cn'

const TONES = {
  error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
}

export function Alert({
  children,
  tone = 'error',
  icon,
  className,
}: {
  children: ReactNode
  tone?: keyof typeof TONES
  icon?: ReactNode
  className?: string
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm', TONES[tone], className)}
    >
      {icon && <span className="mt-px shrink-0 [&>svg]:size-[18px]">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  )
}
