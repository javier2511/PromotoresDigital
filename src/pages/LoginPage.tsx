import { ArrowLeft, ChartColumn, Eye, EyeOff, Lock, Mail, MailCheck, MapPinned, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { LogoMark } from '../components/Logo'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { APP_NAME } from '../config/app'
import { friendlyError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

const FEATURES = [
  { icon: MapPinned, title: 'Tus clientes en el mapa', text: 'Con tu ubicación en tiempo real y los más cercanos primero.' },
  { icon: ShieldCheck, title: 'Visitas verificadas', text: 'El formulario se desbloquea al llegar al punto de venta.' },
  { icon: ChartColumn, title: 'Tu avance al día', text: 'Cuántos clientes llevas y tus resultados.' },
]

export function LoginPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [mode, setMode] = useState<'login' | 'recover'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  if (!authLoading && user) return <Navigate to={from} replace />

  const onLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (err) setError(friendlyError(err))
    else navigate(from, { replace: true })
  }

  const onRecover = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/restablecer`,
    })
    setLoading(false)
    if (err) setError(friendlyError(err))
    else setSent(true)
  }

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
                <p className="mt-1 text-sm text-muted">Usa el correo y la contraseña que te dio tu administrador.</p>
              </div>
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
              <TextField
                label="Contraseña"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                icon={<Lock />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="grid size-9 place-items-center rounded-lg text-muted hover:bg-soft hover:text-fg"
                  >
                    {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                }
              />
              {error && <Alert>{error}</Alert>}
              <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!email || !password}>
                Ingresar
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMode('recover')
                  setError(null)
                  setSent(false)
                }}
                className="mx-auto block text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          ) : (
            <form onSubmit={onRecover} className="space-y-5" noValidate>
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setError(null)
                }}
                className="-ml-1 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"
              >
                <ArrowLeft className="size-4" /> Volver
              </button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Recupera tu acceso</h2>
                <p className="mt-1 text-sm text-muted">Te enviaremos un enlace para crear una contraseña nueva.</p>
              </div>
              {sent ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="grid size-14 animate-pop place-items-center rounded-2xl bg-emerald-500/12 text-emerald-600">
                    <MailCheck className="size-7" />
                  </div>
                  <p className="font-semibold">Revisa tu correo</p>
                  <p className="text-sm text-muted">
                    Si <strong className="text-fg">{email}</strong> tiene una cuenta, recibirás el enlace en unos minutos.
                  </p>
                </div>
              ) : (
                <>
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
                  {error && <Alert>{error}</Alert>}
                  <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!email}>
                    Enviar enlace
                  </Button>
                </>
              )}
            </form>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-muted lg:absolute lg:bottom-6 lg:left-0 lg:w-full">
          {APP_NAME} · Uso interno
        </p>
      </section>
    </div>
  )
}
