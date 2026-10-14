import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
  tone = 'brand',
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
  tone?: 'brand' | 'success' | 'danger' | 'warning'
}) {
  const tones = {
    brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
    success: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
    danger: 'bg-red-500/10 text-red-600 dark:text-red-300',
    warning: 'bg-amber-500/12 text-amber-600 dark:text-amber-300',
  }
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className={cn('mb-4 grid size-16 place-items-center rounded-2xl', tones[tone])}>
        <Icon className="size-8" strokeWidth={1.8} />
      </div>
      <h3 className="text-lg font-semibold text-fg">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-sm text-pretty text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
