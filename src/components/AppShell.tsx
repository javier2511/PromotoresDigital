import { ChartColumn, CircleUserRound, Map as MapIcon, Store, type LucideIcon } from 'lucide-react'
import { NavLink, Outlet, ScrollRestoration, useMatches } from 'react-router'
import { useClientes } from '../data/hooks'
import { useAsegurarPerfil } from '../data/perfil'
import { useAuth } from '../providers/AuthProvider'
import { Logo } from './Logo'
import { LogoutButton } from './LogoutButton'
import { cn } from './ui/cn'
import { ProgressRing } from './ui/ProgressRing'

export interface RouteHandle {
  /** Oculta la barra inferior (pantallas de detalle y visita). */
  hideNav?: boolean
  /** La página ocupa todo el alto disponible (mapa). */
  fullBleed?: boolean
}

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Clientes', icon: Store, end: true },
  { to: '/mapa', label: 'Mapa', icon: MapIcon },
  { to: '/resultados', label: 'Resultados', icon: ChartColumn },
  { to: '/perfil', label: 'Perfil', icon: CircleUserRound },
]

function useRouteHandle(): RouteHandle {
  const matches = useMatches()
  return matches.reduce<RouteHandle>((acc, m) => ({ ...acc, ...(m.handle as RouteHandle | undefined) }), {})
}

function SidebarProgress() {
  const { progreso } = useClientes()
  if (!progreso || progreso.total === 0) return null
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-soft p-3">
      <ProgressRing value={progreso.ratio} size={44} stroke={5} className="text-brand-600">
        <span className="text-[11px] font-bold tabular-nums">{Math.round(progreso.ratio * 100)}%</span>
      </ProgressRing>
      <div className="text-sm">
        <p className="font-semibold tabular-nums">
          {progreso.visitados} de {progreso.total}
        </p>
        <p className="text-xs text-muted">clientes visitados</p>
      </div>
    </div>
  )
}

export function AppShell() {
  const handle = useRouteHandle()
  const { user } = useAuth()
  useAsegurarPerfil()

  return (
    <div className="min-h-dvh">
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-card px-4 py-5 lg:flex">
        <Logo className="px-2" />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition',
                  isActive ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-muted hover:bg-soft hover:text-fg',
                )
              }
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <SidebarProgress />
          <p className="truncate px-2 text-xs text-muted" title={user?.email ?? ''}>
            {user?.email}
          </p>
          <LogoutButton variant="lateral" />
        </div>
      </aside>

      <main
        className={cn(
          'lg:pl-64',
          handle.fullBleed ? 'h-dvh' : 'min-h-dvh',
          !handle.hideNav &&
            (handle.fullBleed
              ? 'pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0'
              : 'pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0'),
        )}
      >
        <Outlet />
      </main>

      {/* Barra inferior (móvil) */}
      {!handle.hideNav && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/90 pb-safe backdrop-blur-xl lg:hidden">
          <div className="mx-auto grid h-16 max-w-lg grid-cols-4">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'group flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition',
                    isActive ? 'text-brand-700 dark:text-brand-300' : 'text-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'grid h-8 w-14 place-items-center rounded-full transition',
                        isActive && 'bg-brand-500/12',
                      )}
                    >
                      <Icon className="size-[22px]" strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
      <ScrollRestoration />
    </div>
  )
}
