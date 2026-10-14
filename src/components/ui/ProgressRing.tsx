import type { ReactNode } from 'react'
import { cn } from './cn'

export function ProgressRing({
  value,
  size = 72,
  stroke = 8,
  className,
  trackClassName,
  children,
}: {
  /** 0 a 1 */
  value: number
  size?: number
  stroke?: number
  className?: string
  trackClassName?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="currentColor"
          className={cn('opacity-20', trackClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="currentColor"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className={cn('transition-[stroke-dashoffset] duration-1000 ease-out', className)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}
