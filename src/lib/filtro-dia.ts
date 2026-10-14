import { useCallback, useState } from 'react'
import type { Cliente } from '../data/clientes'

const STORAGE_KEY = 'pd.filtroDia'

/** Valor del filtro para los clientes sin día de visita (celda vacía o que no se reconoce). */
export const SIN_DIA = 0

function leerDia(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null || raw === '') return null
    const n = Number(raw)
    return Number.isInteger(n) && n >= SIN_DIA && n <= 7 ? n : null
  } catch {
    return null
  }
}

/** Día elegido en el filtro (se recuerda en este teléfono y se comparte entre la lista y el mapa). */
export function useFiltroDia(): [number | null, (dia: number | null) => void] {
  const [dia, setDiaState] = useState<number | null>(leerDia)
  const setDia = useCallback((nuevo: number | null) => {
    setDiaState(nuevo)
    try {
      if (nuevo !== null) localStorage.setItem(STORAGE_KEY, String(nuevo))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* sin almacenamiento */
    }
  }, [])
  return [dia, setDia]
}

export function filtrarPorDia<T extends Pick<Cliente, 'dias'>>(clientes: T[], dia: number | null): T[] {
  if (dia === null) return clientes
  return clientes.filter((c) => (dia === SIN_DIA ? c.dias.length === 0 : c.dias.includes(dia)))
}
