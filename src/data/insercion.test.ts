import type { PostgrestError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  columnaNombrada,
  columnaObligatoria,
  columnaPorValor,
  esErrorDeDato,
  esSoloHora,
  insertarConRecuperacion,
  localIso,
  soloHora,
  valorFecha,
} from './insercion'

const err = (message: string, code = '22P02', details = '') =>
  ({ message, code, details, hint: '', name: 'PostgrestError' }) as unknown as PostgrestError

describe('fechas y horas', () => {
  const d = new Date(2026, 9, 14, 9, 5, 7)
  it('formatos', () => {
    expect(localIso(d)).toMatch(/^2026-10-14T09:05:07[+-]\d{2}:\d{2}$/)
    expect(soloHora(d)).toBe('09:05:07')
  })
  it('columnas de solo hora', () => {
    expect(esSoloHora('hora_inicio')).toBe(true)
    expect(esSoloHora('horaFin')).toBe(true)
    expect(esSoloHora('fecha_hora')).toBe(false)
    expect(esSoloHora('fecha_inicio')).toBe(false)
    expect(valorFecha('hora', d)).toBe('09:05:07')
    expect(valorFecha('fecha', d)).toMatch(/^2026-10-14T/)
  })
})

describe('identificar la columna del error', () => {
  const fila = { cliente_id: 101, usuario_id: 'abc-uuid', estado: 'finalizada', hora_inicio: '2026-10-14T09:05:07-06:00' }
  it('por el valor citado en el mensaje', () => {
    expect(columnaPorValor(err('invalid input syntax for type bigint: "abc-uuid"'), fila)).toBe('usuario_id')
    expect(columnaPorValor(err('invalid input value for enum estado_visita: "finalizada"'), fila)).toBe('estado')
    expect(columnaPorValor(err('invalid input syntax for type time: "2026-10-14T09:05:07-06:00"', '22007'), fila)).toBe('hora_inicio')
  })
  it('por la llave foránea', () => {
    const e = err('insert or update on table "visitas" violates foreign key constraint "visitas_usuario_id_fkey"', '23503', 'Key (usuario_id)=(abc-uuid) is not present in table "usuarios".')
    expect(columnaPorValor(e, fila)).toBe('usuario_id')
  })
  it('columna obligatoria y columna nombrada', () => {
    expect(columnaObligatoria(err('null value in column "hora" of relation "visitas" violates not-null constraint', '23502'))).toBe('hora')
    expect(columnaNombrada(err('new row for relation "visitas" violates check constraint "visitas_estado_check"', '23514'), ['estado', 'fin'])).toBe('estado')
    expect(columnaNombrada(err("Could not find the 'distancia' column of 'visitas' in the schema cache", 'PGRST204'), ['distancia'])).toBe('distancia')
  })
  it('qué errores se corrigen quitando datos', () => {
    expect(esErrorDeDato(err('x', '22P02'))).toBe(true)
    expect(esErrorDeDato(err('x', '23514'))).toBe(true)
    expect(esErrorDeDato(err('cannot insert a non-DEFAULT value into column "duracion"', '428C9'))).toBe(true)
    expect(esErrorDeDato(err('permiso', '42501'))).toBe(false)
    expect(esErrorDeDato(err('TypeError: Failed to fetch', ''))).toBe(false)
  })
})

describe('insertarConRecuperacion', () => {
  /** Simula una tabla con reglas de Postgres. */
  function tabla(validar: (fila: Record<string, unknown>) => PostgrestError | null) {
    const enviados: Record<string, unknown>[][] = []
    const enviar = async (filas: Record<string, unknown>[]) => {
      enviados.push(filas)
      for (const f of filas) {
        const e = validar(f)
        if (e) return { data: null, error: e }
      }
      return { data: null, error: null }
    }
    return { enviar, enviados }
  }

  it('cambia el formato de una columna time y llena una obligatoria que faltaba', async () => {
    const t = tabla((f) => {
      if (String(f.hora_inicio).includes('T')) return err(`invalid input syntax for type time: "${f.hora_inicio}"`, '22007')
      if (!('fecha' in f)) return err('null value in column "fecha" of relation "visitas" violates not-null constraint', '23502')
      return null
    })
    const ahora = new Date(2026, 9, 14, 9, 5, 7)
    const r = await insertarConRecuperacion(
      [{ cliente_id: 1, hora_inicio: localIso(ahora) }],
      { esenciales: ['cliente_id'], quitarPrimero: [], rellenar: (c) => (c === 'fecha' ? '2026-10-14' : undefined), fechas: { hora_inicio: ahora } },
      t.enviar,
    )
    expect(r.error).toBeNull()
    expect(r.filas[0]).toEqual({ cliente_id: 1, hora_inicio: '09:05:07', fecha: '2026-10-14' })
  })

  it('prueba otra forma de identificar al usuario (RLS o tipo)', async () => {
    const t = tabla((f) => (f.user_id === 'auth-uuid' ? null : err('new row violates row-level security policy for table "visitas"', '42501')))
    const r = await insertarConRecuperacion(
      [{ cliente_id: 1, user_id: 7 }],
      { esenciales: ['cliente_id'], quitarPrimero: [], usuario: { columna: 'user_id', alternativas: [7, 'auth-uuid', 'a@b.com'] } },
      t.enviar,
    )
    expect(r.error).toBeNull()
    expect(r.filas[0].user_id).toBe('auth-uuid')
  })

  it('quita un dato opcional que no encaja, pero nunca uno esencial', async () => {
    const t = tabla((f) => ('estado' in f ? err('invalid input value for enum estado_visita: "finalizada"') : null))
    const r = await insertarConRecuperacion(
      [{ cliente_id: 1, estado: 'finalizada', latitud: 19.4 }],
      { esenciales: ['cliente_id'], quitarPrimero: ['estado'] },
      t.enviar,
    )
    expect(r.error).toBeNull()
    expect(r.filas[0]).toEqual({ cliente_id: 1, latitud: 19.4 })

    const t2 = tabla(() => err('invalid input syntax for type bigint: "x"'))
    const r2 = await insertarConRecuperacion([{ cliente_id: 'x' }], { esenciales: ['cliente_id'], quitarPrimero: [] }, t2.enviar)
    expect(r2.error?.code).toBe('22P02')
    expect(t2.enviados.length).toBe(1)
  })
})
