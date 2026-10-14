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
  /** Última lectura (para mostrar en pantalla; puede tener algunos segundos). */
  position: GeoPosition | null
  /** Pide permiso / activa el seguimiento (llamar desde un toque del usuario). */
  request: () => void
  /** Lectura reciente (máximo 30 s de antigüedad). Para decisiones como iniciar una visita. */
  getFresh: () => Promise<GeoPosition>
}

const GeoContext = createContext<GeoState | null>(null)
/** Antigüedad máxima de una lectura para validar que el promotor está en el punto de venta. */
const FRESH_MS = 30_000
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

function toGeoPosition(p: GeolocationPosition): GeoPosition {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: p.coords.accuracy,
    heading:
      p.coords.heading !== null && !Number.isNaN(p.coords.heading) && (p.coords.speed ?? 0) > 0.5
        ? p.coords.heading
        : null,
    timestamp: p.timestamp,
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
  /** Última lectura recibida (sin el filtro de cambios mínimos que usa la pantalla). */
  const latest = useRef<GeoPosition | null>(null)

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [])

  // Permiso retirado: se olvida la última ubicación para no seguir usándola.
  const denied = useCallback(() => {
    wanted.current = false
    stop()
    remember(false)
    last.current = null
    latest.current = null
    setPosition(null)
    setStatus('denied')
  }, [stop])

  const accept = useCallback((next: GeoPosition) => {
    latest.current = next
    if (!last.current || isMeaningfulChange(last.current, next)) {
      last.current = next
      setPosition(next)
    }
    setStatus('active')
    remember(true)
  }, [])

  const start = useCallback(() => {
    if (!hasGeolocation) return
    wanted.current = true
    if (watchId.current !== null) return
    setStatus((s) => (s === 'active' ? s : 'locating'))
    watchId.current = navigator.geolocation.watchPosition(
      (p) => accept(toGeoPosition(p)),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) denied()
        else if (error.code === error.POSITION_UNAVAILABLE) setStatus((s) => (s === 'active' ? s : 'unavailable'))
        // TIMEOUT: el seguimiento continúa y llegará la siguiente lectura.
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    )
  }, [accept, denied])

  const getFresh = useCallback((): Promise<GeoPosition> => {
    // Con el GPS siguiendo la ubicación, la última lectura suele tener pocos segundos.
    const recent = latest.current
    if (recent && watchId.current !== null && Date.now() - recent.timestamp < FRESH_MS) {
      return Promise.resolve(recent)
    }
    return new Promise<GeoPosition>((resolve, reject) => {
      if (!hasGeolocation) return reject(new Error('Tu navegador no comparte la ubicación.'))
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const next = toGeoPosition(p)
          // Se publica la lectura nueva (aunque sea casi igual) para que la pantalla coincida.
          latest.current = next
          last.current = next
          setPosition(next)
          setStatus('active')
          remember(true)
          if (!wanted.current) start()
          resolve(next)
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) denied()
          reject(error)
        },
        { enableHighAccuracy: true, maximumAge: FRESH_MS, timeout: 15_000 },
      )
    })
  }, [denied, start])

  // Estado inicial del permiso: si ya fue concedido, se empieza a seguir la ubicación sin preguntar.
  useEffect(() => {
    if (!hasGeolocation) return
    let permission: PermissionStatus | null = null
    let cancelled = false
    const onChange = () => {
      if (permission?.state === 'granted') start()
      else if (permission?.state === 'denied') denied()
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
  }, [start, stop, denied])

  // Ahorra batería: pausa el GPS cuando la app no está visible.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stop()
      else if (wanted.current) start()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [start, stop])

  const value = useMemo(() => ({ status, position, request: start, getFresh }), [status, position, start, getFresh])
  return <GeoContext.Provider value={value}>{children}</GeoContext.Provider>
}

/** Ubicación del dispositivo (se llama useGeo para no confundirla con useLocation de react-router). */
export function useGeo(): GeoState {
  const ctx = useContext(GeoContext)
  if (!ctx) throw new Error('useGeo debe usarse dentro de <GeoProvider>')
  return ctx
}
