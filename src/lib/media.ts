import { useSyncExternalStore } from 'react'

/** ¿La pantalla cumple la media query? Se actualiza al girar el teléfono o cambiar el tamaño de la ventana. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', avisar)
      return () => m.removeEventListener('change', avisar)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
