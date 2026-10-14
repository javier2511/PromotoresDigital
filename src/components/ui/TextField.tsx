import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: ReactNode
  trailing?: ReactNode
  error?: string | null
}

export function TextField({ label, icon, trailing, error, className, id, ...props }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-fg">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex h-12 items-center gap-2 rounded-xl border bg-card px-3.5 transition focus-within:ring-4',
          error
            ? 'border-red-400 focus-within:ring-red-500/15'
            : 'border-line focus-within:border-brand-500 focus-within:ring-brand-500/15',
        )}
      >
        {icon && <span className="text-muted [&>svg]:size-5">{icon}</span>}
        <input
          id={inputId}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-muted/70"
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {trailing}
      </div>
      {error && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
