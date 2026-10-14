import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { distanceMeters } from '../lib/geo'

export type GeoStatus = 'idle' | 'prompt' | 'locating' | 'active' | 'denied' | 'unavailable' | 'unsupported'

export interface GeoPosition {
  lat: number
  lng: number
  /** Radio de precisión en metros. */
  accuracy: number
  /** Rumbo de movimiento (grados), solo cuando el dispositivo se mueve. */
  heading: number | null
  timestamp: number
}

interface GeoState {
  status: GeoStatus
  position: GeoPosition | null
  /** Pide permiso / activa el seguimiento (llamar desde un toque del usuario). */
  request: () => void
}

const GeoContext = createContext<GeoState | null>(null)
const ENABLED_KEY = 'pd.geo.enabled'
const hasGeolocation = typeof navigator !== 'undefined' && 'geolocation' in navigator

function remember(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(ENABLED_KEY, '1')
    else localStorage.removeItem(ENABLED_KEY)
  } catch {
    /* sin almacenamiento */
  }
}

function wasEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

/** Evita re-renderizar toda la app por cambios de centímetros. */
function isMeaningfulChange(prev: GeoPosition, next: GeoPosition): boolean {
  if (distanceMeters(prev, next) >= 3) return true
  if (Math.abs(prev.accuracy - next.accuracy) >= 5) return true
  if (next.timestamp - prev.timestamp >= 10_000) return true
  if ((prev.heading === null) !== (next.heading === null)) return true
  return false
}

export function GeoProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GeoStatus>(hasGeolocation ? 'idle' : 'unsupported')
  const [position, setPosition] = useState<GeoPosition | null>(null)
  const watchId = useRef<number | null>(null)
  const wanted = useRef(false)
  const last = useRef<GeoPosition | null>(null)

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [])

  const start = useCallback(() => {
    if (!hasGeolocation) return
    wanted.current = true
    if (watchId.current !== null) return
    setStatus((s) => (s === 'active' ? s : 'locating'))
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const next: GeoPosition = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          heading:
            p.coords.heading !== null && !Number.isNaN(p.coords.heading) && (p.coords.speed ?? 0) > 0.5
              ? p.coords.heading
              : null,
          timestamp: p.timestamp,
        }
        if (!last.current || isMeaningfulChange(last.current, next)) {
          last.current = next
          setPosition(next)
        }
        setStatus('active')
        remember(true)
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          wanted.current = false
          stop()
          remember(false)
          setStatus('denied')
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setStatus((s) => (s === 'active' ? s : 'unavailable'))
        }
        // TIMEOUT: el seguimiento continúa y llegará la siguiente lectura.
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    )
  }, [stop])

  // Estado inicial del permiso: si ya fue concedido, se empieza a seguir la ubicación sin preguntar.
  useEffect(() => {
    if (!hasGeolocation) return
    let permission: PermissionStatus | null = null
    let cancelled = false
    const onChange = () => {
      if (permission?.state === 'granted') start()
      else if (permission?.state === 'denied') {
        stop()
        setStatus('denied')
      }
    }
    const fallback = () => {
      if (wasEnabled()) start()
      else setStatus('prompt')
    }
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((p) => {
          if (cancelled) return
          permission = p
          if (p.state === 'granted') start()
          else if (p.state === 'denied') setStatus('denied')
          else fallback()
          p.addEventListener('change', onChange)
        })
        .catch(fallback)
    } else {
      fallback()
    }
    return () => {
      cancelled = true
      permission?.removeEventListener('change', onChange)
      stop()
    }
  }, [start, stop])

  // Ahorra batería: pausa el GPS cuando la app no está visible.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stop()
      else if (wanted.current) start()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [start, stop])

  const value = useMemo(() => ({ status, position, request: start }), [status, position, start])
  return <GeoContext.Provider value={value}>{children}</GeoContext.Provider>
}

/** Ubicación del dispositivo (se llama useGeo para no confundirla con useLocation de react-router). */
export function useGeo(): GeoState {
  const ctx = useContext(GeoContext)
  if (!ctx) throw new Error('useGeo debe usarse dentro de <GeoProvider>')
  return ctx
}
