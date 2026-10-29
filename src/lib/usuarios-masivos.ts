import { normalize } from './text'

/** Mínimo de caracteres de una contraseña (el mismo de Supabase y de la pantalla de registro). */
export const MIN_CONTRASENA = 6

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Un usuario por crear, leído de la lista que se pegó de Excel. */
export interface UsuarioPorCrear {
  /** Número de renglón de la lista (1 = el primero después de los títulos). */
  renglon: number
  nombre: string
  correo: string
  contrasena: string
  /** Región (opcional). */
  region: string
  /** Sin contraseña pero con región: solo se le asigna la región (si ya tiene cuenta). */
  soloRegion: boolean
  /** Por qué no se puede crear (null: está listo). */
  error: string | null
}

export interface ListaUsuarios {
  usuarios: UsuarioPorCrear[]
  /** El primer renglón eran los títulos de las columnas. */
  conTitulos: boolean
}

/**
 * Separa en celdas lo que se pegó: de Excel llega con tabuladores; de un archivo CSV, con comas o con punto y coma
 * (Excel en español). Respeta las comillas ("Pérez, Luis") y quita los renglones vacíos.
 */
export function leerCeldas(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '')
  const primera = t.split(/\r\n|\r|\n/).find((l) => l.trim()) ?? ''
  const cuenta = (c: string) => primera.split(c).length
  const separador = primera.includes('\t') ? '\t' : cuenta(';') > cuenta(',') ? ';' : ','
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let comillas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (comillas) {
      if (c !== '"') celda += c
      else if (t[i + 1] === '"') {
        celda += '"'
        i++
      } else comillas = false
    } else if (c === '"' && !celda.trim()) {
      comillas = true
      celda = ''
    } else if (c === separador) {
      fila.push(celda)
      celda = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else celda += c
  }
  fila.push(celda)
  filas.push(fila)
  return filas.map((f) => f.map((x) => x.trim())).filter((f) => f.some(Boolean))
}

// Títulos de cada columna (sin mayúsculas ni acentos). El correo y la contraseña se buscan antes que el nombre:
// "Correo del usuario" es el correo, "Nombre de usuario" es el nombre.
const TITULOS = {
  correo: ['correo', 'email', 'e-mail', 'mail'],
  contrasena: ['contrasena', 'contrasenia', 'password', 'clave', 'pass'],
  region: ['region'],
  nombre: ['nombre', 'name', 'promotor', 'usuario'],
}
const esTitulo = (celda: string, palabras: string[]) => palabras.some((p) => normalize(celda).includes(p))

function columnas(filas: string[][], conTitulos: boolean) {
  const ancho = Math.max(...filas.map((f) => f.length))
  const datos = conTitulos ? filas.slice(1) : filas
  const libres = Array.from({ length: ancho }, (_, i) => i)
  const tomar = (i: number) => {
    if (i >= 0) libres.splice(libres.indexOf(i), 1)
    return i
  }
  const porTitulo = (palabras: string[]) =>
    conTitulos ? tomar(libres.find((i) => esTitulo(filas[0][i] ?? '', palabras)) ?? -1) : -1
  let correo = porTitulo(TITULOS.correo)
  let contrasena = porTitulo(TITULOS.contrasena)
  let region = porTitulo(TITULOS.region)
  let nombre = porTitulo(TITULOS.nombre)
  // Sin título: el correo es la columna que trae arrobas.
  if (correo < 0) {
    const arrobas = (i: number) => datos.filter((f) => (f[i] ?? '').includes('@')).length
    const mejor = [...libres].sort((a, b) => arrobas(b) - arrobas(a))[0]
    if (mejor !== undefined && arrobas(mejor) > 0) correo = tomar(mejor)
  }
  // Lo que falte va en orden (Nombre, Correo, Contraseña); con títulos, solo si no hay columnas de más.
  const adivinar = !conTitulos || ancho <= 3
  if (nombre < 0 && adivinar && libres.length) nombre = tomar(libres[0])
  if (contrasena < 0 && adivinar && libres.length) contrasena = tomar(libres[0])
  // Sin títulos, la región es la cuarta columna; con títulos, solo la que se llama "Región".
  if (region < 0 && !conTitulos && libres.length) region = tomar(libres[0])
  return { nombre, correo, contrasena, region }
}

function errorDe(u: Omit<UsuarioPorCrear, 'error'>, vistos: Map<string, number>, soloRegiones: boolean): string | null {
  // Una lista de solo Correo y Región (sin columna de contraseña) es para asignar regiones.
  if (soloRegiones && !u.region) return 'Falta la región'
  if (!u.soloRegion && !u.nombre) return 'Falta el nombre'
  if (!u.correo) return 'Falta el correo'
  if (!CORREO.test(u.correo)) return 'El correo no es válido'
  if (!u.soloRegion && !u.contrasena) return 'Falta la contraseña'
  if (!u.soloRegion && u.contrasena.length < MIN_CONTRASENA) {
    return `La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres`
  }
  const antes = vistos.get(u.correo)
  if (antes) return `Correo repetido (renglón ${antes})`
  vistos.set(u.correo, u.renglon)
  return null
}

/**
 * Lee la lista de usuarios: Nombre, Correo, Contraseña y Región (opcional); con o sin títulos, en cualquier orden si
 * tiene títulos. Un renglón con correo y región pero sin contraseña solo asigna la región.
 */
export function leerUsuarios(texto: string): ListaUsuarios {
  const filas = leerCeldas(texto)
  if (filas.length === 0) return { usuarios: [], conTitulos: false }
  const primera = filas[0]
  const conTitulos =
    primera.every((c) => !c.includes('@')) &&
    primera.some((c) => esTitulo(c, [...TITULOS.correo, ...TITULOS.contrasena, ...TITULOS.region]))
  const col = columnas(filas, conTitulos)
  const celda = (f: string[], i: number) => (i >= 0 ? (f[i] ?? '') : '')
  const vistos = new Map<string, number>()
  const soloRegiones = col.contrasena < 0 && col.region >= 0
  const usuarios = (conTitulos ? filas.slice(1) : filas).map((f, i) => {
    const contrasena = celda(f, col.contrasena)
    const region = celda(f, col.region)
    const u = {
      renglon: i + 1,
      nombre: celda(f, col.nombre),
      correo: celda(f, col.correo).toLowerCase(),
      contrasena,
      region,
      soloRegion: !contrasena && Boolean(region),
    }
    return { ...u, error: errorDe(u, vistos, soloRegiones) }
  })
  return { usuarios, conTitulos }
}
