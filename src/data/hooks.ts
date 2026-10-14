import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { distanceMeters } from '../lib/geo'
import { loadSchema } from '../lib/schema-resolver'
import { useUser } from '../providers/AuthProvider'
import { useGeo, type GeoPosition } from '../providers/GeoProvider'
import { fetchClientes, type Cliente } from './clientes'
import { fetchFormulario } from './formulario'
import { fetchResultados } from './resultados'

export const queryKeys = {
  schema: (userId: string) => ['schema', userId] as const,
  clientes: (userId: string) => ['clientes', userId] as const,
  formulario: (userId: string) => ['formulario', userId] as const,
  resultados: (userId: string) => ['resultados', userId] as const,
  jornada: (userId: string) => ['jornada', userId] as const,
}

export function useSchema() {
  const user = useUser()
  return useQuery({
    queryKey: queryKeys.schema(user.id),
    queryFn: () => loadSchema(user),
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export interface ClienteConDistancia extends Cliente {
  /** Metros desde la ubicación actual (null si no hay ubicación o el cliente no tiene coordenadas). */
  distance: number | null
}

export function withDistance(clientes: Cliente[], position: GeoPosition | null): ClienteConDistancia[] {
  return clientes.map((c) => ({
    ...c,
    distance: position && c.location ? distanceMeters(position, c.location) : null,
  }))
}

export interface Progreso {
  total: number
  visitados: number
  pendientes: number
  /** 0 a 1 */
  ratio: number
}

export function progresoDe(clientes: Cliente[]): Progreso {
  const total = clientes.length
  const visitados = clientes.filter((c) => c.visitado).length
  return { total, visitados, pendientes: total - visitados, ratio: total ? visitados / total : 0 }
}

/** Clientes del usuario con distancia en vivo y progreso. */
export function useClientes() {
  const user = useUser()
  const schema = useSchema()
  const { position } = useGeo()
  const query = useQuery({
    queryKey: queryKeys.clientes(user.id),
    queryFn: () => fetchClientes(schema.data!, user),
    enabled: Boolean(schema.data),
    staleTime: 60_000,
  })
  const clientes = useMemo(
    () => (query.data ? withDistance(query.data, position) : undefined),
    [query.data, position],
  )
  const progreso = useMemo(() => (query.data ? progresoDe(query.data) : undefined), [query.data])
  return {
    clientes,
    progreso,
    ctx: schema.data,
    isPending: schema.isPending || query.isPending,
    isFetching: schema.isFetching || query.isFetching,
    error: schema.error ?? query.error,
    refetch: () => (schema.error ? schema.refetch() : query.refetch()),
    updatedAt: query.dataUpdatedAt,
  }
}

export function useFormulario() {
  const user = useUser()
  const schema = useSchema()
  const query = useQuery({
    queryKey: queryKeys.formulario(user.id),
    queryFn: () => fetchFormulario(schema.data!),
    enabled: Boolean(schema.data),
    staleTime: 10 * 60_000,
  })
  return {
    formulario: query.data,
    isPending: schema.isPending || query.isPending,
    error: schema.error ?? query.error,
    refetch: () => (schema.error ? schema.refetch() : query.refetch()),
  }
}

export function useResultados(clienteKeys: Set<string> | undefined) {
  const user = useUser()
  const schema = useSchema()
  const query = useQuery({
    queryKey: queryKeys.resultados(user.id),
    queryFn: () => fetchResultados(schema.data!, user, clienteKeys ?? new Set()),
    enabled: Boolean(schema.data && clienteKeys),
    staleTime: 5 * 60_000,
  })
  return {
    resultados: query.data,
    isPending: schema.isPending || query.isPending,
    isFetching: query.isFetching,
    error: schema.error ?? query.error,
    refetch: () => (schema.error ? schema.refetch() : query.refetch()),
  }
}
