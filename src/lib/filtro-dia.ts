import { useCallback, useState } from 'react'
import type { Cliente } from '../data/clientes'

const STORAGE_KEY = 'pd.filtroDia'

function leerDia(): number | null {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY))
    return n >= 1 && n <= 7 ? n : null
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
      if (nuevo) localStorage.setItem(STORAGE_KEY, String(nuevo))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* sin almacenamiento */
    }
  }, [])
  return [dia, setDia]
}

export function filtrarPorDia<T extends Pick<Cliente, 'dias'>>(clientes: T[], dia: number | null): T[] {
  return dia ? clientes.filter((c) => c.dias.includes(dia)) : clientes
}
