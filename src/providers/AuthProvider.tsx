import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  /** El usuario llegó desde el correo de "restablecer contraseña". */
  recovery: boolean
  /** Su cuenta tiene la contraseña temporal (user_metadata.debe_cambiar_contrasena): debe elegir una nueva. */
  debeCambiarContrasena: boolean
  signOut: () => Promise<void>
  finishRecovery: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

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
    await supabase.auth.signOut()
    queryClient.clear()
  }, [queryClient])

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovery,
      debeCambiarContrasena: session?.user?.user_metadata?.debe_cambiar_contrasena === true,
      signOut,
      finishRecovery: () => setRecovery(false),
    }),
    [session, loading, recovery, signOut],
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
