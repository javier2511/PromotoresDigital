import { describe, expect, it } from 'vitest'
import { aCsv } from './csv'

describe('aCsv', () => {
  it('encabezados, comillas y BOM para Excel', () => {
    const csv = aCsv([
      { id: 1, texto: 'Hola, mundo', ok: true },
      { id: 2, texto: 'Dijo "sí"\nen dos líneas', ok: null },
    ])
    expect(csv).toBe('﻿id,texto,ok\r\n1,"Hola, mundo",true\r\n2,"Dijo ""sí""\nen dos líneas",\r\n')
  })

  it('un texto que Excel tomaría como fórmula no se ejecuta; los números negativos quedan igual', () => {
    const csv = aCsv([{ a: '=HYPERLINK("http://x")', b: '-99.27', c: -99.27, d: '+52 55 1234', e: '@SUM(A1)' }])
    expect(csv.split('\r\n')[1]).toBe(`"'=HYPERLINK(""http://x"")",-99.27,-99.27,'+52 55 1234,'@SUM(A1)`)
  })

  it('columnas de todas las filas y objetos como JSON', () => {
    expect(aCsv([{ a: 1 }, { b: { x: 1 } }])).toBe('﻿a,b\r\n1,\r\n,"{""x"":1}"\r\n')
    expect(aCsv([])).toBe('﻿\r\n')
  })
})
