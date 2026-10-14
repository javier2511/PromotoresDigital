import { describe, expect, it } from 'vitest'
import { indicePreguntas, inferirColumnasRegla } from './reglas-columnas'

describe('inferirColumnasRegla', () => {
  it('formato "mostrar pregunta X si pregunta Y = valor" con nombres no previstos', () => {
    const r = inferirColumnasRegla(['id', 'pregunta_id', 'mostrar_pregunta', 'respuesta'], { id: 'id', pregunta: 'pregunta_id' })
    expect(r.pregunta).toBe('mostrar_pregunta')
    expect(r.dependeDe).toBe('pregunta_id')
    expect(r.valor).toBe('respuesta')
  })
  it('id_pregunta + id_pregunta_condicion + valor_condicion', () => {
    const r = inferirColumnasRegla(['id', 'id_pregunta', 'id_pregunta_condicion', 'valor_condicion'], { id: 'id', pregunta: 'id_pregunta' })
    expect(r.pregunta).toBe('id_pregunta')
    expect(r.dependeDe).toBe('id_pregunta_condicion')
    expect(r.valor).toBe('valor_condicion')
  })
  it('pregunta_condicional_id es la que se muestra; respuesta_activadora es el valor', () => {
    const r = inferirColumnasRegla(['id', 'pregunta_id', 'pregunta_condicional_id', 'respuesta_activadora', 'operador'], {})
    expect(r.pregunta).toBe('pregunta_condicional_id')
    expect(r.dependeDe).toBe('pregunta_id')
    expect(r.valor).toBe('respuesta_activadora')
    expect(r.operador).toBe('operador')
  })
  it('camelCase y "depende_de"', () => {
    const r = inferirColumnasRegla(['id', 'preguntaId', 'dependeDe', 'valorEsperado'], {})
    expect(r.pregunta).toBe('preguntaId')
    expect(r.dependeDe).toBe('dependeDe')
    expect(r.valor).toBe('valorEsperado')
  })
  it('respeta lo ya detectado cuando está completo', () => {
    const detectadas = { pregunta: 'pregunta_id', dependeDe: 'pregunta_padre_id', valor: 'valor' }
    expect(inferirColumnasRegla(['id', 'pregunta_id', 'pregunta_padre_id', 'valor'], detectadas)).toMatchObject(detectadas)
  })
  it('no confunde la columna de texto de la pregunta con una referencia', () => {
    const r = inferirColumnasRegla(['id', 'pregunta_id', 'pregunta_padre_id', 'texto_pregunta', 'respuesta'], {})
    expect(r.pregunta).toBe('pregunta_id')
    expect(r.dependeDe).toBe('pregunta_padre_id')
    expect(r.valor).toBe('respuesta')
  })
})

describe('indicePreguntas', () => {
  const filas = [
    { id: 'a1', numero: 1, pregunta: '¿Está abierto?' },
    { id: 'b2', numero: 2, pregunta: '¿Cuántos exhibidores?' },
  ]
  const buscar = indicePreguntas(filas, (f) => String(f.id), 'id', 'pregunta')
  it('encuentra por id, por número o por texto', () => {
    expect(buscar('a1')).toBe('a1')
    expect(buscar(2)).toBe('b2')
    expect(buscar('¿esta abierto?')).toBe('a1')
    expect(buscar('zzz')).toBeNull()
    expect(buscar(null)).toBeNull()
  })
})
