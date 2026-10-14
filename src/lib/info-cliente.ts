import { INFO_CLIENTE, type CampoInfoCliente } from '../config/schema'
import type { SchemaContext } from './schema-resolver'

/** "Status_cuponera" → "statuscuponera": sin mayúsculas, acentos, espacios ni guiones. */
export function claveColumna(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export interface CampoEncontrado extends CampoInfoCliente {
  /** Columna real de la tabla, o null si no se encontró. */
  columna: string | null
}

/**
 * Busca la columna de cada dato configurado: primero por nombre exacto y después por palabras clave
 * (los datos más específicos primero, p. ej. "status cuponera" antes que "cuponera"). Una columna solo
 * se usa una vez y nunca se toman las columnas excluidas (id, nombre, ubicación, usuario…).
 */
export function resolverInfoCliente(
  columnas: string[],
  excluir: Iterable<string> = [],
  campos: CampoInfoCliente[] = INFO_CLIENTE,
): CampoEncontrado[] {
  const excluidas = new Set(excluir)
  const disponibles = columnas.filter((c) => !excluidas.has(c))
  const usadas = new Set<string>()
  const encontradas: (string | null)[] = campos.map(() => null)

  campos.forEach((campo, i) => {
    const exactas = new Set((campo.columnas ?? []).map(claveColumna))
    const columna = disponibles.find((c) => !usadas.has(c) && exactas.has(claveColumna(c)))
    if (columna) {
      encontradas[i] = columna
      usadas.add(columna)
    }
  })

  const porPalabras = campos
    .map((campo, i) => ({ campo, i, peso: Math.max(0, ...(campo.palabras ?? []).map((g) => g.length)) }))
    .filter(({ i, peso }) => encontradas[i] === null && peso > 0)
    .sort((a, b) => b.peso - a.peso)
  for (const { campo, i } of porPalabras) {
    const columna = disponibles.find(
      (c) =>
        !usadas.has(c) &&
        campo.palabras!.some((grupo) => grupo.every((palabra) => claveColumna(c).includes(claveColumna(palabra)))),
    )
    if (columna) {
      encontradas[i] = columna
      usadas.add(columna)
    }
  }

  return campos.map((campo, i) => ({ ...campo, columna: encontradas[i] }))
}

/** Columnas que la app ya usa para otra cosa (id, nombre, ubicación, usuario…) y nunca se muestran como dato. */
export function columnasInternas(ctx: Pick<SchemaContext, 'tables'>): string[] {
  const c = ctx.tables.clientes.columns
  return [c.id, c.nombre, c.direccion, c.latitud, c.longitud, c.ubicacion, c.asignadoA, c.visitado].filter(
    (x): x is string => Boolean(x),
  )
}
