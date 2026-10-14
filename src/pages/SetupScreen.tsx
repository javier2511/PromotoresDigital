import { LogoMark } from '../components/Logo'

/** Se muestra si faltan las variables de entorno de Supabase. */
export function SetupScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-line bg-card p-6 shadow-float sm:p-8">
        <LogoMark className="size-12" />
        <h1 className="mt-5 text-2xl font-bold tracking-tight">Falta conectar Supabase</h1>
        <p className="mt-2 text-sm text-muted">
          Agrega estas variables de entorno en tu proyecto de Vercel (Settings → Environment Variables) o en un archivo{' '}
          <code className="rounded bg-soft px-1 font-mono">.env.local</code> y vuelve a desplegar:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-900 p-4 text-[13px] leading-relaxed text-slate-100">
          {`VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key`}
        </pre>
        <p className="mt-4 text-sm text-muted">
          Ambos valores están en Supabase → Project Settings → API. La anon key es pública por diseño; la seguridad la dan
          las políticas RLS de tus tablas.
        </p>
      </div>
    </div>
  )
}
