import { useMemo, useState } from 'react'
import { rangoDe, rangoEntre, sumarDias, type Periodo } from '../../lib/periodos'

/** Periodo elegido: todo (al abrir), un mes, una semana o de una fecha a otra. `alCambiar` se avisa con cada cambio. */
export function usePeriodo(hoy: string, alCambiar?: () => void) {
  const [periodo, setPeriodo] = useState<Periodo>('total')
  const [ancla, setAncla] = useState(hoy)
  /** Rango: de una fecha a otra (las dos incluidas). */
  const [desde, setDesde] = useState(() => sumarDias(hoy, -13))
  const [hasta, setHasta] = useState(hoy)
  const rango = useMemo(
    () => (periodo === 'rango' ? rangoEntre(desde, hasta) : rangoDe(periodo, ancla)),
    [periodo, ancla, desde, hasta],
  )
  return {
    periodo,
    ancla,
    rango,
    desde,
    hasta,
    irA: (fecha: string) => {
      setAncla(fecha)
      alCambiar?.()
    },
    /** `primerDia` (la primera fecha con datos) es donde empieza el rango al pasar de Total a Rango. */
    cambiarPeriodo: (p: Periodo, primerDia: string | null = null) => {
      // El rango empieza con lo que se estaba viendo: desde la primera fecha (total) o el mes o la semana elegidos.
      if (p === 'rango' && periodo !== 'rango') {
        setDesde(periodo === 'total' ? (primerDia ?? sumarDias(hoy, -13)) : rango.desde)
        const fin = sumarDias(rango.hasta, -1)
        setHasta(periodo === 'total' || fin > hoy ? hoy : fin)
      }
      setPeriodo(p)
      alCambiar?.()
    },
    cambiarDesde: (fecha: string) => {
      setDesde(fecha)
      if (fecha > hasta) setHasta(fecha)
      alCambiar?.()
    },
    cambiarHasta: (fecha: string) => {
      setHasta(fecha)
      if (fecha < desde) setDesde(fecha)
      alCambiar?.()
    },
  }
}
