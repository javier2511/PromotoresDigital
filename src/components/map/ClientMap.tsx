import type { FeatureCollection, Point } from 'geojson'
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { RotateCw } from 'lucide-react'
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { DEFAULT_CENTER, MAP_LABEL_FONT, MAP_STYLE_URL } from '../../config/app'
import type { ClienteConDistancia } from '../../data/hooks'
import { circlePolygon, distanceMeters, type LatLng } from '../../lib/geo'
import type { GeoPosition } from '../../providers/GeoProvider'
import { cn } from '../ui/cn'
import { useCompass } from './useCompass'

setWorkerUrl(workerUrl)

export interface ClientMapHandle {
  /** Centra el mapa en el punto azul. Devuelve false si aún no hay ubicación. */
  locateMe: () => boolean
  /** Encuadra todos los clientes. */
  fitAll: () => void
}

interface ClientMapProps {
  clientes: ClienteConDistancia[]
  me: GeoPosition | null
  selectedKey?: string | null
  onSelect?: (key: string | null) => void
  /** full: mapa principal con grupos. mini: mapa pequeño de la ficha del cliente. */
  variant?: 'full' | 'mini'
  /** Espacio (px) que tapa la tarjeta inferior, para centrar bien el punto seleccionado. */
  bottomInset?: number
  /** Activa la brújula (orientación del teléfono) en el punto azul. */
  compass?: boolean
  className?: string
  ref?: Ref<ClientMapHandle>
}

const COLORS = { pending: '#ea4335', visited: '#16a34a', brand: '#4f46e5', me: '#1a73e8' }

const LOCALE_ES: Record<string, string> = {
  'AttributionControl.ToggleAttribution': 'Mostrar créditos del mapa',
  'Map.Title': 'Mapa',
  'Marker.Title': 'Marcador',
  'NavigationControl.ZoomIn': 'Acercar',
  'NavigationControl.ZoomOut': 'Alejar',
  'NavigationControl.ResetBearing': 'Apuntar al norte',
  'CooperativeGesturesHandler.WindowsHelpText': 'Usa Ctrl + rueda del mouse para hacer zoom',
  'CooperativeGesturesHandler.MacHelpText': 'Usa ⌘ + rueda del mouse para hacer zoom',
  'CooperativeGesturesHandler.MobileHelpText': 'Usa dos dedos para mover el mapa',
}
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }
const PIN_PATH = 'M15 37C15 37 4 26.2 4 15.5A11 11 0 0 1 26 15.5C26 26.2 15 37 15 37Z'

/** Dibuja un pin (gota) como imagen para la capa de símbolos. */
function pinImage(color: string, kind: 'pending' | 'visited'): ImageData {
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = 30 * scale
  canvas.height = 40 * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetY = 1.5
  const pin = new Path2D(PIN_PATH)
  ctx.fillStyle = color
  ctx.fill(pin)
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = 2
  ctx.strokeStyle = '#ffffff'
  ctx.stroke(pin)
  if (kind === 'visited') {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(10.2, 15.8)
    ctx.lineTo(13.6, 19.2)
    ctx.lineTo(20, 12.4)
    ctx.stroke()
  } else {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(15, 15.5, 4.6, 0, Math.PI * 2)
    ctx.fill()
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

// MapLibre posiciona cada marcador con `transform` en su elemento raíz: las animaciones y estilos
// propios van en un elemento interior para no pisar esa posición.

function selectedPinElement(visitado: boolean): HTMLElement {
  const color = visitado ? COLORS.visited : COLORS.pending
  const root = document.createElement('div')
  root.style.pointerEvents = 'none'
  const pin = document.createElement('div')
  pin.className = 'pin-selected'
  pin.innerHTML = `
    <svg width="44" height="58" viewBox="0 0 30 40" style="display:block" aria-hidden="true">
      <path d="${PIN_PATH}" fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="15" cy="15.5" r="5.2" fill="#fff"/>
      <circle cx="15" cy="15.5" r="2.6" fill="${color}"/>
    </svg>`
  root.append(pin)
  return root
}

function meElement(): { root: HTMLElement; beam: HTMLElement } {
  const root = document.createElement('div')
  root.setAttribute('aria-label', 'Tu ubicación')
  const dot = document.createElement('div')
  dot.className = 'me-dot'
  const beam = document.createElement('div')
  beam.className = 'me-dot__beam'
  beam.style.display = 'none'
  const pulse = document.createElement('div')
  pulse.className = 'me-dot__pulse'
  const core = document.createElement('div')
  core.className = 'me-dot__core'
  dot.append(beam, pulse, core)
  root.append(dot)
  return { root, beam }
}

function toFeatures(clientes: ClienteConDistancia[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: clientes
      .filter((c) => c.location)
      .map((c) => ({
        type: 'Feature',
        properties: { key: c.key, nombre: c.nombre, visitado: c.visitado },
        geometry: { type: 'Point', coordinates: [c.location!.lng, c.location!.lat] },
      })),
  }
}

/** Firma de los datos que se dibujan: si no cambia, no hace falta redibujar la capa (p. ej. con cada lectura de GPS). */
function signatureOf(clientes: ClienteConDistancia[]): string {
  return clientes
    .filter((c) => c.location)
    .map((c) => `${c.key}:${c.visitado ? 1 : 0}:${c.location!.lat},${c.location!.lng}`)
    .join('|')
}

function showHeading(beam: HTMLElement, heading: number | null) {
  if (heading === null) {
    beam.style.display = 'none'
  } else {
    beam.style.display = 'block'
    beam.style.transform = `rotate(${heading}deg)`
  }
}

/** Incluye al promotor en el encuadre solo si está razonablemente cerca de sus clientes. */
function boundsFor(points: LatLng[], me: GeoPosition | null): LngLatBounds | null {
  const all = [...points]
  if (me && points.some((p) => distanceMeters(me, p) < 25_000)) all.push(me)
  if (all.length === 0) return null
  const bounds = new LngLatBounds()
  for (const p of all) bounds.extend([p.lng, p.lat])
  return bounds
}

export default function ClientMap({
  clientes,
  me,
  selectedKey = null,
  onSelect,
  variant = 'full',
  bottomInset = 0,
  compass = false,
  className,
  ref,
}: ClientMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const meMarker = useRef<{ marker: Marker; beam: HTMLElement } | null>(null)
  const selectedMarker = useRef<Marker | null>(null)
  const fitted = useRef(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Referencias "vivas" para los manejadores registrados una sola vez.
  const live = useRef({ onSelect, clientes, me, bottomInset })
  useEffect(() => {
    live.current = { onSelect, clientes, me, bottomInset }
  })

  const drawn = useRef<string | null>(null)

  const fit = useCallback((animate: boolean) => {
    const map = mapRef.current
    if (!map) return
    const { me: currentMe, bottomInset: inset } = live.current
    const points = live.current.clientes.flatMap((c) => (c.location ? [c.location] : []))
    const bounds = boundsFor(points, currentMe)
    if (!bounds) {
      if (currentMe) map.jumpTo({ center: [currentMe.lng, currentMe.lat], zoom: 15 })
      return
    }
    const pad = variant === 'mini' ? 48 : 64
    map.fitBounds(bounds, {
      padding: { top: pad + (variant === 'full' ? 56 : 0), bottom: pad + inset, left: pad, right: pad },
      maxZoom: 16,
      duration: animate ? 700 : 0,
    })
  }, [variant])

  // Crear el mapa (una vez, o de nuevo al reintentar).
  useEffect(() => {
    if (!container.current) return
    const start = live.current.me ?? live.current.clientes.find((c) => c.location)?.location
    const map = new MapLibreMap({
      container: container.current,
      style: MAP_STYLE_URL,
      center: start ? [start.lng, start.lat] : DEFAULT_CENTER,
      zoom: start ? 13 : 11,
      maxZoom: 19,
      attributionControl: { compact: true },
      locale: LOCALE_ES,
      cooperativeGestures: variant === 'mini',
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    })
    map.touchZoomRotate.disableRotation()
    // Botones +/− solo en computadora (en el teléfono se usa el gesto de pellizcar).
    if (variant === 'full' && window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches) {
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    }

    let loaded = false
    map.on('error', (e) => {
      // Una tesela o fuente que falla no impide usar el mapa; solo cuenta si no cargó el estilo.
      const tileOrSource = 'sourceId' in e || 'tile' in e
      if (!loaded && !tileOrSource && !map.isStyleLoaded()) setFailed(true)
    })

    map.on('load', () => {
      loaded = true
      setFailed(false)
      map.addImage('pin-pending', pinImage(COLORS.pending, 'pending'), { pixelRatio: 2 })
      map.addImage('pin-visited', pinImage(COLORS.visited, 'visited'), { pixelRatio: 2 })

      map.addSource('me-accuracy', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'me-accuracy-fill',
        type: 'fill',
        source: 'me-accuracy',
        paint: { 'fill-color': COLORS.me, 'fill-opacity': 0.12 },
      })
      map.addLayer({
        id: 'me-accuracy-line',
        type: 'line',
        source: 'me-accuracy',
        paint: { 'line-color': COLORS.me, 'line-opacity': 0.35, 'line-width': 1 },
      })

      if (variant === 'mini') {
        map.addSource('route-line', { type: 'geojson', data: EMPTY })
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route-line',
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': COLORS.brand, 'line-width': 2.5, 'line-dasharray': [1.2, 1.8] },
        })
      }

      map.addSource('clientes', {
        type: 'geojson',
        data: EMPTY,
        cluster: variant === 'full',
        clusterMaxZoom: 14,
        clusterRadius: 46,
      })
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'clientes',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': COLORS.brand,
          'circle-radius': ['step', ['get', 'point_count'], 17, 10, 21, 50, 27],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        },
      })
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'clientes',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': MAP_LABEL_FONT,
          'text-size': 13,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff' },
      })
      map.addLayer({
        id: 'pins',
        type: 'symbol',
        source: 'clientes',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['case', ['get', 'visitado'], 'pin-visited', 'pin-pending'],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'symbol-sort-key': ['case', ['get', 'visitado'], 1, 2],
        },
      })
      // Nombres bajo los pines al acercarse (en el mapa pequeño el nombre ya está en la ficha).
      if (variant === 'full') map.addLayer({
        id: 'pin-labels',
        type: 'symbol',
        source: 'clientes',
        filter: ['!', ['has', 'point_count']],
        minzoom: 15,
        layout: {
          'text-field': ['get', 'nombre'],
          'text-font': MAP_LABEL_FONT,
          'text-size': 12,
          'text-anchor': 'top',
          'text-offset': [0, 0.3],
          'text-max-width': 10,
          'text-optional': true,
        },
        paint: { 'text-color': '#1f2937', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
      })

      map.on('click', 'clusters', async (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0]
        if (!feature) return
        const source = map.getSource<GeoJSONSource>('clientes')
        const zoom = await source?.getClusterExpansionZoom(feature.properties.cluster_id as number)
        const [lng, lat] = (feature.geometry as Point).coordinates
        map.easeTo({ center: [lng, lat], zoom: (zoom ?? map.getZoom() + 2) + 0.3, duration: 500 })
      })
      map.on('click', 'pins', (e: MapLayerMouseEvent) => {
        const key = e.features?.[0]?.properties.key
        if (key !== undefined) live.current.onSelect?.(String(key))
      })
      map.on('click', (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ['pins', 'clusters'] })
        if (hits.length === 0) live.current.onSelect?.(null)
      })
      for (const layer of ['pins', 'clusters']) {
        map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
      }
      setReady(true)
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      meMarker.current = null
      selectedMarker.current = null
      fitted.current = false
      drawn.current = null
      setReady(false)
    }
  }, [variant, attempt])

  // Clientes en el mapa.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const signature = signatureOf(clientes)
    if (signature !== drawn.current) {
      drawn.current = signature
      map.getSource<GeoJSONSource>('clientes')?.setData(toFeatures(clientes))
    }
    if (!fitted.current && (signature !== '' || live.current.me)) {
      fitted.current = true
      fit(false)
    }
  }, [clientes, ready, fit])

  // Punto azul + círculo de precisión.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (!me) {
      meMarker.current?.marker.remove()
      meMarker.current = null
      map.getSource<GeoJSONSource>('me-accuracy')?.setData(EMPTY)
      return
    }
    if (!meMarker.current) {
      const { root, beam } = meElement()
      const marker = new Marker({ element: root, anchor: 'center' }).setLngLat([me.lng, me.lat]).addTo(map)
      meMarker.current = { marker, beam }
      if (!fitted.current) {
        fitted.current = true
        fit(false)
      }
    } else {
      meMarker.current.marker.setLngLat([me.lng, me.lat])
    }
    map.getSource<GeoJSONSource>('me-accuracy')?.setData(circlePolygon(me, Math.max(me.accuracy, 5)))
    if (variant === 'mini') {
      const target = live.current.clientes.find((c) => c.location)?.location
      map
        .getSource<GeoJSONSource>('route-line')
        ?.setData(
          target
            ? { type: 'LineString', coordinates: [[me.lng, me.lat], [target.lng, target.lat]] }
            : EMPTY,
        )
    }
  }, [me, ready, variant, fit])

  // Orientación: brújula del teléfono, o el rumbo del GPS al moverse.
  const compassHeading = useCompass(compass)
  const heading = compassHeading ?? me?.heading ?? null
  useEffect(() => {
    const beam = meMarker.current?.beam
    if (beam) showHeading(beam, heading)
  }, [heading, me, ready])

  // Pin seleccionado (más grande, con animación) y centrado. Se recalcula si llegan los datos después del mapa.
  const selected = clientes.find((c) => c.key === selectedKey)
  const selectedSignature = selected?.location
    ? `${selected.key}:${selected.visitado ? 1 : 0}:${selected.location.lat},${selected.location.lng}`
    : ''
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    selectedMarker.current?.remove()
    selectedMarker.current = null
    const cliente = live.current.clientes.find((c) => c.key === selectedKey)
    if (!selectedSignature || !cliente?.location) return
    const { lng, lat } = cliente.location
    selectedMarker.current = new Marker({ element: selectedPinElement(cliente.visitado), anchor: 'bottom' })
      .setLngLat([lng, lat])
      .addTo(map)
    if (variant === 'full') {
      map.easeTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 15),
        padding: { top: 0, left: 0, right: 0, bottom: live.current.bottomInset },
        duration: 600,
      })
    }
  }, [selectedKey, selectedSignature, ready, variant])

  useImperativeHandle(ref, () => ({
    locateMe: () => {
      const map = mapRef.current
      const current = live.current.me
      if (!map || !current) return false
      map.easeTo({
        center: [current.lng, current.lat],
        zoom: Math.max(map.getZoom(), 16),
        padding: { top: 0, left: 0, right: 0, bottom: live.current.bottomInset },
        duration: 700,
      })
      return true
    },
    fitAll: () => fit(true),
  }))

  return (
    <div className={cn('overflow-hidden bg-[#e9ece8] dark:bg-[#1c2230]', className ?? 'relative h-full w-full')}>
      {/* MapLibre fuerza position: relative en este div, por eso se dimensiona con h-full/w-full. */}
      <div ref={container} className="h-full w-full" />
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-soft p-6 text-center">
          <div>
            <p className="font-semibold">No se pudo cargar el mapa</p>
            <p className="mt-1 text-sm text-muted">Revisa tu conexión a internet.</p>
            <button
              type="button"
              onClick={() => {
                setFailed(false)
                setAttempt((n) => n + 1)
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
            >
              <RotateCw className="size-4" /> Reintentar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
