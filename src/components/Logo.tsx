import { cn } from './ui/cn'

/** Marca: pin de mapa con palomita, en degradado de la marca. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('size-10', className)} aria-hidden>
      <defs>
        <linearGradient id="pd-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#pd-logo)" />
      <path
        d="M24 10.5c-6.1 0-11 4.8-11 10.8 0 7.6 9.3 15.4 10.1 16a1.4 1.4 0 0 0 1.8 0c.8-.6 10.1-8.4 10.1-16 0-6-4.9-10.8-11-10.8Z"
        fill="#fff"
      />
      <path
        d="m19.4 21.4 3.3 3.3 6.1-6.3"
        fill="none"
        stroke="#4f46e5"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="size-9" />
      <div className="leading-tight">
        <p className="text-[15px] font-bold tracking-tight">Promotores</p>
        <p className="text-xs font-medium text-muted">Digital</p>
      </div>
    </div>
  )
}
