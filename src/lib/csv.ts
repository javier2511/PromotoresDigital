import type { Row } from './supabase'

const NUMERO = /^[-+]?\d+(\.\d+)?$/

/** Una celda de CSV: entre comillas si hace falta; los textos que Excel tomaría como fórmula llevan ' al inicio. */
function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  let texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor)
  // "=HYPERLINK(…)" escrito en una respuesta no debe ejecutarse al abrir el archivo (los números negativos sí quedan igual).
  if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(texto) && !NUMERO.test(texto)) texto = `'${texto}`
  return /[",\r\n]/.test(texto) || texto !== texto.trim() ? `"${texto.replace(/"/g, '""')}"` : texto
}

/** Filas a CSV que Excel abre con acentos (UTF-8 con BOM, coma como separador). */
export function aCsv(filas: Row[]): string {
  const columnas = new Set<string>()
  for (const fila of filas) for (const c of Object.keys(fila)) columnas.add(c)
  const lista = [...columnas]
  const lineas = [lista.map(celda).join(','), ...filas.map((f) => lista.map((c) => celda(f[c])).join(','))]
  return `﻿${lineas.join('\r\n')}\r\n`
}

/** Descarga un texto como archivo (en el teléfono se abre la opción de guardar o compartir). */
export function descargarArchivo(nombre: string, contenido: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
