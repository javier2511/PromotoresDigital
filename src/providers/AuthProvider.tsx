import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { guardarCorreoTemporal, leerCorreoTemporal } from '../lib/contrasena-temporal'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  /** El usuario llegó desde el correo de "restablecer contraseña". */
  recovery: boolean
  /** Entró con la contraseña temporal (o su cuenta lo pide): debe elegir una nueva antes de seguir. */
  debeCambiarContrasena: boolean
  signOut: () => Promise<void>
  finishRecovery: () => void
  /** Antes de iniciar sesión con la contraseña temporal: al entrar se le pedirá una nueva (null = no). */
  marcarContrasenaTemporal: (email: string | null) => void
  /** Ya eligió su contraseña nueva: deja de pedírsela. */
  contrasenaCambiada: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)
  const [correoTemporal, setCorreoTemporal] = useState<string | null>(leerCorreoTemporal)
  const marcarContrasenaTemporal = useCallback((email: string | null) => {
    guardarCorreoTemporal(email)
    setCorreoTemporal(email ? email.trim().toLowerCase() : null)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(next)
      setLoading(false)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signOut = useCallback(async () => {
    marcarContrasenaTemporal(null)
    await supabase.auth.signOut()
    queryClient.clear()
  }, [queryClient, marcarContrasenaTemporal])

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovery,
      debeCambiarContrasena: Boolean(
        session?.user &&
          (session.user.user_metadata?.debe_cambiar_contrasena === true ||
            (correoTemporal !== null && session.user.email?.toLowerCase() === correoTemporal)),
      ),
      signOut,
      finishRecovery: () => setRecovery(false),
      marcarContrasenaTemporal,
      contrasenaCambiada: () => marcarContrasenaTemporal(null),
    }),
    [session, loading, recovery, signOut, correoTemporal, marcarContrasenaTemporal],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

/** Usuario con sesión iniciada (solo en pantallas protegidas). */
export function useUser(): User {
  const { user } = useAuth()
  if (!user) throw new Error('No hay sesión iniciada')
  return user
}
