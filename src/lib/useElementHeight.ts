import { useEffect, useState, type RefObject } from 'react'

/** Alto (px) de un elemento, actualizado cuando cambia de tamaño. */
export function useElementHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => setHeight(Math.round(el.getBoundingClientRect().height)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return height
}
