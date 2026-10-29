import { useQueryClient } from '@tanstack/react-query'
import { CircleCheck, ClipboardPaste, Eye, EyeOff, TriangleAlert, Upload, UserPlus } from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Navigate } from 'react-router'
import { TopBar } from '../components/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Spinner } from '../components/ui/Spinner'
import { useSchema } from '../data/hooks'
import { crearUsuarios, FaltaCrearUsuarios, type ResultadoUsuario } from '../data/usuarios'
import { friendlyError } from '../lib/errors'
import { esAdmin } from '../lib/schema-resolver'
import { plural } from '../lib/text'
import { leerUsuarios, type UsuarioPorCrear } from '../lib/usuarios-masivos'

const EJEMPLO = 'Nombre\tCorreo\tContraseña\nLuis Pérez\tluis.perez@empresa.com\tLuis2026'

/** Lee un CSV guardado desde Excel: UTF-8 o, si no lo es, Windows-1252 (el "CSV" normal de Excel en Windows). */
async function leerArchivo(archivo: File): Promise<string> {
  const bytes = await archivo.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

function Estado({ u, resultado }: { u: UsuarioPorCrear; resultado?: ResultadoUsuario }) {
  if (u.error || resultado?.estado === 'error') return <Badge tone="danger">Revisar</Badge>
  if (resultado?.estado === 'creado') return <Badge tone="success">Creado</Badge>
  if (resultado?.estado === 'ya_existe') return <Badge tone="info">Ya tenía cuenta</Badge>
  return <Badge>Listo</Badge>
}

/** Solo administradores: crea varias cuentas de promotores a la vez, pegando la lista de Excel. */
export function CrearUsuariosPage() {
  const { data: ctx, isPending } = useSchema()
  const queryClient = useQueryClient()
  const archivoRef = useRef<HTMLInputElement>(null)
  const [texto, setTexto] = useState('')
  const [verContrasenas, setVerContrasenas] = useState(false)
  const [cambiar, setCambiar] = useState(false)
  // Por correo: lo que respondió la base al crearlo.
  const [resultados, setResultados] = useState<Record<string, ResultadoUsuario>>({})
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null)
  const [terminado, setTerminado] = useState(false)
  const [faltaSql, setFaltaSql] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { usuarios } = useMemo(() => leerUsuarios(texto), [texto])

  if (isPending) {
    return (
      <div className="grid min-h-[60dvh] place-items-center">
        <Spinner className="size-7 text-brand-600" />
      </div>
    )
  }
  if (!esAdmin(ctx)) return <Navigate to="/" replace />

  const resultadoDe = (u: UsuarioPorCrear) => (u.error ? undefined : resultados[u.correo])
  const porCrear = usuarios.filter((u) => !u.error && !['creado', 'ya_existe'].includes(resultadoDe(u)?.estado ?? ''))
  const conError = usuarios.filter((u) => u.error).length
  const cuantos = (estado: ResultadoUsuario['estado']) => usuarios.filter((u) => resultadoDe(u)?.estado === estado).length
  const creados = cuantos('creado')
  const yaExistian = cuantos('ya_existe')
  const fallaron = cuantos('error')

  const crear = async () => {
    setError(null)
    setFaltaSql(false)
    setTerminado(false)
    setAvance({ hechos: 0, total: porCrear.length })
    try {
      await crearUsuarios(porCrear, cambiar, (correo, resultado) => {
        setResultados((prev) => ({ ...prev, [correo]: resultado }))
        setAvance((a) => (a ? { ...a, hechos: a.hechos + 1 } : a))
      })
      setTerminado(true)
    } catch (e) {
      if (e instanceof FaltaCrearUsuarios) setFaltaSql(true)
      else setError(friendlyError(e))
    } finally {
      setAvance(null)
      void queryClient.invalidateQueries({ queryKey: ['equipo'] })
    }
  }

  const subirArchivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (archivo) setTexto(await leerArchivo(archivo))
  }

  const borrar = () => {
    setTexto('')
    setResultados({})
    setTerminado(false)
  }

  const resumen = [
    creados && plural(creados, 'creado'),
    yaExistian && `${yaExistian} ya ${yaExistian === 1 ? 'tenía' : 'tenían'} cuenta`,
    fallaron && `${fallaron} con error`,
  ].filter(Boolean)

  return (
    <>
      <TopBar title="Crear usuarios" subtitle="Cuentas de promotores con su contraseña" backTo="/equipo" />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 pb-10 sm:px-6">
        <Card className="p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            <ClipboardPaste className="size-5 text-brand-600 dark:text-brand-300" /> Pega la lista desde Excel
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            Pon en Excel tres columnas: <strong className="text-fg">Nombre</strong>, <strong className="text-fg">Correo</strong>{' '}
            y <strong className="text-fg">Contraseña</strong> (la fila de títulos es opcional). Selecciona las celdas, cópialas y
            pégalas aquí.
          </p>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-label="Lista de usuarios"
            placeholder={EJEMPLO}
            rows={7}
            spellCheck={false}
            autoComplete="off"
            disabled={avance !== null}
            className="mt-3 w-full resize-y rounded-xl border border-line bg-card p-3 font-mono text-sm text-fg outline-none placeholder:text-muted/70 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<Upload className="size-4" />}
              onClick={() => archivoRef.current?.click()}
              disabled={avance !== null}
            >
              Subir archivo CSV
            </Button>
            {texto && avance === null && (
              <Button variant="ghost" size="sm" onClick={borrar}>
                Borrar lista
              </Button>
            )}
            <input
              ref={archivoRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={subirArchivo}
              aria-label="Archivo CSV"
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            El correo es con el que entran a la app. No se les envía ningún correo, así que puedes inventarles uno (por ejemplo
            luis.perez@tuempresa.com). Si un correo ya tiene cuenta, no se le cambia la contraseña.
          </p>
        </Card>

        {usuarios.length > 0 && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold">Revisa la lista</h2>
                <p className="text-sm text-muted">
                  {plural(usuarios.length, 'usuario')}
                  {conError > 0 && ` · ${conError} con errores`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={verContrasenas ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                onClick={() => setVerContrasenas((v) => !v)}
              >
                {verContrasenas ? 'Ocultar contraseñas' : 'Ver contraseñas'}
              </Button>
            </div>
            <ul id="usuarios-por-crear" className="divide-y divide-line">
              {usuarios.map((u) => {
                const resultado = resultadoDe(u)
                const mensaje = u.error ?? (resultado?.estado === 'error' ? resultado.mensaje : null)
                const contrasena = verContrasenas ? u.contrasena : '•'.repeat(Math.min(u.contrasena.length, 12))
                return (
                  <li key={u.renglon} data-usuario={u.correo} className="flex items-start gap-3 px-4 py-3">
                    <span className="w-5 shrink-0 pt-0.5 text-right text-xs text-muted tabular-nums">{u.renglon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{u.nombre || '—'}</p>
                      <p className="text-sm break-words text-muted">
                        {u.correo || 'sin correo'} · <span className="font-mono">{contrasena || '—'}</span>
                      </p>
                      {mensaje && <p className="mt-0.5 text-sm text-red-600 dark:text-red-400">{mensaje}</p>}
                    </div>
                    <Estado u={u} resultado={resultado} />
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        {usuarios.length > 0 && (
          <Card className="space-y-3 p-4 sm:p-5">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={cambiar}
                onChange={(e) => setCambiar(e.target.checked)}
                disabled={avance !== null}
                className="mt-0.5 size-5 shrink-0 accent-brand-600"
              />
              <span>Pedirles que elijan su propia contraseña la primera vez que entren</span>
            </label>
            {conError > 0 && (
              <p className="text-sm text-muted">
                Los renglones con errores no se crean. Corrígelos en Excel y vuelve a pegar la lista: los que ya se crearon no se
                duplican.
              </p>
            )}
            <Button
              size="lg"
              className="w-full"
              icon={<UserPlus className="size-5" />}
              loading={avance !== null}
              disabled={porCrear.length === 0}
              onClick={crear}
            >
              {avance
                ? `Creando ${avance.hechos} de ${avance.total}…`
                : porCrear.length
                  ? `Crear ${plural(porCrear.length, 'usuario')}`
                  : 'No hay usuarios por crear'}
            </Button>
            {avance && (
              <div className="h-2 overflow-hidden rounded-full bg-soft" aria-hidden>
                <div
                  className="h-full rounded-full bg-brand-600 transition-[width]"
                  style={{ width: `${(avance.hechos / Math.max(1, avance.total)) * 100}%` }}
                />
              </div>
            )}
            {faltaSql && (
              <Alert icon={<TriangleAlert />}>
                Falta un paso en Supabase: ejecuta una vez <code className="font-mono">supabase/13_crear_usuarios.sql</code> (SQL
                Editor → New query → pega el archivo → Run) y vuelve a intentarlo.
              </Alert>
            )}
            {error && <Alert icon={<TriangleAlert />}>{error}</Alert>}
            {terminado && resumen.length > 0 && (
              <>
                <Alert tone={fallaron ? 'warning' : 'success'} icon={<CircleCheck />}>
                  <p className="font-semibold">Listo: {resumen.join(' · ')}.</p>
                  {creados > 0 && (
                    <p className="mt-0.5">
                      Ya pueden entrar a la app con su correo y la contraseña de la lista
                      {cambiar ? '; al entrar, la app les pedirá elegir una nueva.' : '.'}
                    </p>
                  )}
                </Alert>
                <ButtonLink to="/equipo" variant="outline" className="w-full">
                  Ver equipo
                </ButtonLink>
              </>
            )}
          </Card>
        )}
      </div>
    </>
  )
}
