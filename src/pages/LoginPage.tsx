import { ArrowLeft, ChartColumn, CircleCheck, Eye, EyeOff, KeyRound, Lock, Mail, MailCheck, MapPinned, ShieldCheck, User } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { LogoMark } from '../components/Logo'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { TextField } from '../components/ui/TextField'
import { APP_NAME, CONTRASENA_TEMPORAL } from '../config/app'
import { friendlyError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { useGeo } from '../providers/GeoProvider'

const FEATURES = [
  { icon: MapPinned, title: 'Tus clientes en el mapa', text: 'Con tu ubicación en tiempo real y los más cercanos primero.' },
  { icon: ShieldCheck, title: 'Visitas verificadas', text: 'Cada visita registra dónde se hizo y a qué distancia del cliente.' },
  { icon: ChartColumn, title: 'Tu avance al día', text: 'Cuántos clientes llevas y tus resultados.' },
]

export function LoginPage() {
  const { user, loading: authLoading, marcarContrasenaTemporal } = useAuth()
  const { request: activarUbicacion } = useGeo()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [mode, setMode] = useState<'login' | 'registro' | 'restablecer'>('login')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendienteConfirmar, setPendienteConfirmar] = useState(false)
  const [confirmarRestablecer, setConfirmarRestablecer] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  if (!authLoading && user) return <Navigate to={from} replace />

  const cambiarModo = (nuevo: 'login' | 'registro' | 'restablecer') => {
    setMode(nuevo)
    setError(null)
    setAviso(null)
    setPendienteConfirmar(false)
    setPassword('')
    setConfirmacion('')
  }

  const onLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    // Con la contraseña temporal, al entrar se le pide elegir una nueva.
    const temporal = password === CONTRASENA_TEMPORAL
    marcarContrasenaTemporal(temporal ? email : null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (err) {
      marcarContrasenaTemporal(null)
      setError(friendlyError(err))
    } else navigate(temporal ? '/restablecer' : from, { replace: true })
  }

  /** Pone la contraseña temporal (función de supabase/08_restablecer_contrasena.sql). */
  const restablecer = async () => {
    setConfirmarRestablecer(false)
    setError(null)
    setLoading(true)
    const { data, error: err } = await supabase.rpc('restablecer_contrasena_temporal', { p_correo: email.trim() })
    setLoading(false)
    if (err) {
      const faltaFuncion = err.code === 'PGRST202' || /could not find the function/i.test(err.message)
      return setError(
        faltaFuncion
          ? 'Esta opción aún no está activada. Pide a tu administrador que restablezca tu contraseña.'
          : friendlyError(err),
      )
    }
    if (data !== true) return setError('No encontramos una cuenta de promotor activa con ese correo.')
    cambiarModo('login')
    setPassword(CONTRASENA_TEMPORAL)
    setAviso(`Listo. Tu contraseña temporal es ${CONTRASENA_TEMPORAL}. Entra y elige una nueva.`)
  }

  const onRegistro = async (e: FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return setError('Escribe tu nombre.')
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.')
    if (password !== confirmacion) return setError('Las contraseñas no coinciden.')
    setError(null)
    setLoading(true)
    // Se pide el GPS al registrarse: su ubicación se guarda en la tabla de promotores.
    activarUbicacion()
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // registro_app: la app crea su fila en la tabla de usuarios al entrar por primera vez.
        data: { full_name: nombre.trim(), registro_app: true },
        emailRedirectTo: window.location.origin,
      },
    })
    setLoading(false)
    if (err) return setError(friendlyError(err))
    if (data.session) return navigate('/', { replace: true })
    // Con "Confirm email" activo, Supabase no inicia sesión hasta confirmar. Si el correo ya existía,
    // responde sin identidades.
    if (data.user && data.user.identities?.length === 0) {
      return setError('Ya existe una cuenta con ese correo. Inicia sesión.')
    }
    setPendienteConfirmar(true)
  }

  const campoCorreo = (
    <TextField
      label="Correo electrónico"
      type="email"
      inputMode="email"
      autoComplete="email"
      autoCapitalize="none"
      placeholder="nombre@empresa.com"
      icon={<Mail />}
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      required
    />
  )
  const verContrasena = (
    <button
      type="button"
      onClick={() => setShowPassword((v) => !v)}
      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      className="grid size-9 place-items-center rounded-lg text-muted hover:bg-soft hover:text-fg"
    >
      {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  )

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Panel de marca */}
      <section className="relative overflow-hidden bg-linear-to-br from-brand-600 via-brand-700 to-brand-900 px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-24 text-white lg:flex lg:flex-col lg:justify-center lg:px-16 lg:pb-12">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-brand-400/30 blur-3xl" />
        <div className="relative mx-auto max-w-md lg:mx-0">
          <div className="flex items-center gap-3">
            <LogoMark className="size-12 rounded-2xl ring-1 ring-white/30" />
            <div>
              <p className="text-xl font-bold tracking-tight">{APP_NAME}</p>
              <p className="text-sm text-white/70">Visitas en campo, sin papel</p>
            </div>
          </div>
          <h1 className="mt-10 hidden text-4xl leading-tight font-bold tracking-tight lg:block">
            Todo tu recorrido del día, en tu bolsillo.
          </h1>
          <ul className="mt-10 hidden space-y-5 lg:block">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/12 ring-1 ring-white/20">
                  <Icon className="size-5" />
                </div>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-white/70">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Formulario */}
      <section className="relative -mt-14 px-4 pb-10 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:px-12">
        <div className="mx-auto w-full max-w-md animate-rise rounded-3xl border border-line bg-card p-6 shadow-float sm:p-8 lg:border-0 lg:shadow-none">
          {mode === 'login' ? (
            <form onSubmit={onLogin} className="space-y-5" noValidate>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Inicia sesión</h2>
                <p className="mt-1 text-sm text-muted">Entra con tu correo y contraseña.</p>
              </div>
              {campoCorreo}
              <TextField
                label="Contraseña"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                icon={<Lock />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                trailing={verContrasena}
              />
              <div className="-mt-2 text-right">
                <button
                  type="button"
                  onClick={() => cambiarModo('restablecer')}
                  className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              {aviso && (
                <Alert tone="success" icon={<CircleCheck />}>
                  {aviso}
                </Alert>
              )}
              {error && <Alert>{error}</Alert>}
              <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!email || !password}>
                Ingresar
              </Button>
              <p className="text-center text-sm text-muted">
                ¿No tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => cambiarModo('registro')}
                  className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
                >
                  Crear cuenta
                </button>
              </p>
            </form>
          ) : mode === 'restablecer' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setConfirmarRestablecer(true)
              }}
              className="space-y-4"
              noValidate
            >
              <button
                type="button"
                onClick={() => cambiarModo('login')}
                className="-ml-1 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"
              >
                <ArrowLeft className="size-4" /> Volver
              </button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Restablecer contraseña</h2>
                <p className="mt-1 text-sm text-muted">
                  Escribe el correo con el que entras. Tu contraseña cambiará a la temporal{' '}
                  <strong className="font-mono text-fg">{CONTRASENA_TEMPORAL}</strong> y al entrar te pediremos elegir
                  una nueva.
                </p>
              </div>
              {campoCorreo}
              {error && <Alert>{error}</Alert>}
              <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!email}>
                Restablecer contraseña
              </Button>
            </form>
          ) : pendienteConfirmar ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="grid size-14 animate-pop place-items-center rounded-2xl bg-emerald-500/12 text-emerald-600">
                <MailCheck className="size-7" />
              </div>
              <p className="text-lg font-semibold">Confirma tu correo</p>
              <p className="text-sm text-muted">
                Te enviamos un enlace a <strong className="text-fg">{email}</strong>. Ábrelo para activar tu cuenta y
                después inicia sesión.
              </p>
              <Button variant="secondary" className="mt-2" onClick={() => cambiarModo('login')}>
                Ir a iniciar sesión
              </Button>
            </div>
          ) : (
            <form onSubmit={onRegistro} className="space-y-4" noValidate>
              <button
                type="button"
                onClick={() => cambiarModo('login')}
                className="-ml-1 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"
              >
                <ArrowLeft className="size-4" /> Volver
              </button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Crea tu cuenta</h2>
                <p className="mt-1 text-sm text-muted">Tu administrador te asignará clientes después de registrarte.</p>
              </div>
              <TextField
                label="Nombre completo"
                autoComplete="name"
                placeholder="Nombre y apellido"
                icon={<User />}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
              {campoCorreo}
              <TextField
                label="Contraseña"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Mínimo 6 caracteres"
                icon={<Lock />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                trailing={verContrasena}
              />
              <TextField
                label="Confirma la contraseña"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repite la contraseña"
                icon={<KeyRound />}
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                required
              />
              {error && <Alert>{error}</Alert>}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={loading}
                disabled={!nombre || !email || !password || !confirmacion}
              >
                Crear cuenta
              </Button>
            </form>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-muted lg:absolute lg:bottom-6 lg:left-0 lg:w-full">
          {APP_NAME} · Uso interno
        </p>
      </section>

      <ConfirmDialog
        open={confirmarRestablecer}
        title="¿Restablecer tu contraseña?"
        confirmLabel="Sí, restablecer"
        onCancel={() => setConfirmarRestablecer(false)}
        onConfirm={() => void restablecer()}
      >
        La contraseña de <strong className="text-fg">{email.trim()}</strong> cambiará a{' '}
        <strong className="font-mono text-fg">{CONTRASENA_TEMPORAL}</strong> y la actual dejará de funcionar. Al entrar te
        pediremos elegir una nueva.
      </ConfirmDialog>
    </div>
  )
}
