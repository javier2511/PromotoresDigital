import { CircleCheck, KeyRound, Lock } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { LogoMark } from '../components/Logo'
import { Alert } from '../components/ui/Alert'
import { Button, ButtonLink } from '../components/ui/Button'
import { FullScreenLoader } from '../components/ui/Spinner'
import { TextField } from '../components/ui/TextField'
import { friendlyError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { CONTRASENA_TEMPORAL } from '../config/app'
import { useAuth } from '../providers/AuthProvider'

export function ResetPasswordPage() {
  const { user, loading: authLoading, finishRecovery, debeCambiarContrasena, contrasenaCambiada, signOut } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (authLoading) return <FullScreenLoader />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.')
    if (password !== confirm) return setError('Las contraseñas no coinciden.')
    if (password === CONTRASENA_TEMPORAL) return setError('Elige una contraseña distinta de la temporal.')
    setError(null)
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password, data: { debe_cambiar_contrasena: false } })
    setLoading(false)
    if (err) return setError(friendlyError(err))
    contrasenaCambiada()
    finishRecovery()
    toast.success('Contraseña actualizada')
    navigate('/', { replace: true })
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-md animate-rise rounded-3xl border border-line bg-card p-6 shadow-float sm:p-8">
        <LogoMark className="size-12" />
        {user ? (
          <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {debeCambiarContrasena ? 'Elige tu nueva contraseña' : 'Crea una contraseña nueva'}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {debeCambiarContrasena
                  ? `Entraste con una contraseña temporal. Crea una nueva para ${user.email} y sigue trabajando.`
                  : `Para ${user.email}`}
              </p>
            </div>
            <TextField
              label="Nueva contraseña"
              type="password"
              autoComplete="new-password"
              icon={<Lock />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <TextField
              label="Confirma la contraseña"
              type="password"
              autoComplete="new-password"
              icon={<KeyRound />}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {error && <Alert>{error}</Alert>}
            <Button type="submit" size="lg" className="w-full" loading={loading} icon={<CircleCheck className="size-5" />}>
              Guardar contraseña
            </Button>
          </form>
        ) : (
          <div className="mt-6 space-y-4">
            <h1 className="text-2xl font-bold tracking-tight">Enlace no válido</h1>
            <p className="text-sm text-muted">
              El enlace para restablecer la contraseña expiró o ya se usó. Pide a tu administrador que te envíe uno nuevo.
            </p>
            <ButtonLink to="/login" size="lg" className="w-full">
              Ir a iniciar sesión
            </ButtonLink>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-muted">
          {debeCambiarContrasena ? (
            <button type="button" onClick={() => void signOut()} className="hover:underline">
              Cerrar sesión
            </button>
          ) : (
            <Link to="/login" className="hover:underline">
              Volver al inicio
            </Link>
          )}
        </p>
      </div>
    </div>
  )
}
