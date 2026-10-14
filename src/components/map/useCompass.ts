import { useEffect, useState } from 'react'

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number }

/** Pide permiso para la brújula (iOS lo exige y debe llamarse desde un toque del usuario). */
export async function requestCompassPermission(): Promise<boolean> {
  const ctor = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } })
    .DeviceOrientationEvent
  if (typeof ctor?.requestPermission !== 'function') return true
  try {
    return (await ctor.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** Rumbo de la brújula del teléfono en grados (0 = norte), o null si no hay brújula. */
export function useCompass(enabled: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
    let last = -1000
    let frame = 0
    const handler = (event: Event) => {
      const e = event as OrientationEvent
      let value: number | null = null
      if (typeof e.webkitCompassHeading === 'number') value = e.webkitCompassHeading
      else if (e.absolute && e.alpha !== null) value = 360 - e.alpha
      if (value === null) return
      const angle = (value + (screen.orientation?.angle ?? 0) + 360) % 360
      const delta = Math.abs(((angle - last + 540) % 360) - 180)
      if (delta < 4) return
      last = angle
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setHeading(angle))
    }
    window.addEventListener(eventName, handler, true)
    return () => {
      window.removeEventListener(eventName, handler, true)
      cancelAnimationFrame(frame)
      setHeading(null)
    }
  }, [enabled])

  return heading
}
