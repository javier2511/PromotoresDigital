import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createBrowserRouter, Navigate, useLocation } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Toaster } from 'sonner'
import { AppShell, type RouteHandle } from './components/AppShell'
import { FullScreenLoader } from './components/ui/Spinner'
import { SchemaError } from './data/clientes'
import { isNetworkError } from './lib/errors'
import { isSupabaseConfigured } from './lib/supabase'
import { ClienteDetallePage } from './pages/ClienteDetallePage'
import { ClientesPage } from './pages/ClientesPage'
import { DiagnosticoPage } from './pages/DiagnosticoPage'
import { LoginPage } from './pages/LoginPage'
import { MapaPage } from './pages/MapaPage'
import { NotFoundPage, RouteErrorPage } from './pages/NotFoundPage'
import { PerfilPage } from './pages/PerfilPage'
import { EquipoPage } from './pages/EquipoPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { ResultadosPage } from './pages/ResultadosPage'
import { SetupScreen } from './pages/SetupScreen'
import { VisitaFinalizadaPage } from './pages/VisitaFinalizadaPage'
import { VisitaPage } from './pages/VisitaPage'
import { AuthProvider, useAuth } from './providers/AuthProvider'
import { GeoProvider } from './providers/GeoProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reintenta fallas de red; los errores de configuración se muestran de inmediato.
      retry: (count, error) => !(error instanceof SchemaError) && (isNetworkError(error) ? count < 3 : count < 1),
      refetchOnWindowFocus: true,
    },
  },
})

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, recovery, debeCambiarContrasena } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoader />
  if (recovery || debeCambiarContrasena) return <Navigate to="/restablecer" replace />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}

const hideNav: RouteHandle = { hideNav: true }

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
  { path: '/restablecer', element: <ResetPasswordPage />, errorElement: <RouteErrorPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <ClientesPage /> },
      { path: 'mapa', element: <MapaPage />, handle: { fullBleed: true } satisfies RouteHandle },
      { path: 'clientes/:id', element: <ClienteDetallePage />, handle: hideNav },
      { path: 'clientes/:id/visita', element: <VisitaPage />, handle: hideNav },
      { path: 'clientes/:id/visita/finalizada', element: <VisitaFinalizadaPage />, handle: hideNav },
      { path: 'resultados', element: <ResultadosPage /> },
      { path: 'perfil', element: <PerfilPage /> },
      { path: 'equipo', element: <EquipoPage /> },
      { path: 'diagnostico', element: <DiagnosticoPage />, handle: hideNav },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  if (!isSupabaseConfigured) return <SetupScreen />
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GeoProvider>
          <RouterProvider router={router} />
          <Toaster position="top-center" richColors closeButton theme="system" />
        </GeoProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
