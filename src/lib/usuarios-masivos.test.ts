import { describe, expect, it } from 'vitest'
import { leerCeldas, leerUsuarios } from './usuarios-masivos'

const resumen = (texto: string) => leerUsuarios(texto).usuarios.map((u) => [u.nombre, u.correo, u.contrasena, u.error])

describe('leerCeldas', () => {
  it('lo copiado de Excel: tabuladores, CRLF y renglón vacío al final', () => {
    expect(leerCeldas('Nombre\tCorreo\tContraseña\r\nLuis Pérez\tluis@empresa.com\tLuis2026\r\n')).toEqual([
      ['Nombre', 'Correo', 'Contraseña'],
      ['Luis Pérez', 'luis@empresa.com', 'Luis2026'],
    ])
  })

  it('CSV con punto y coma (Excel en español) o con comas, con comillas', () => {
    expect(leerCeldas('﻿Nombre;Correo;Contraseña\n"Pérez; Luis";luis@empresa.com;"di ""hola"""\n')).toEqual([
      ['Nombre', 'Correo', 'Contraseña'],
      ['Pérez; Luis', 'luis@empresa.com', 'di "hola"'],
    ])
    expect(leerCeldas('"Pérez, Luis",luis@empresa.com,Luis2026\n\n')).toEqual([['Pérez, Luis', 'luis@empresa.com', 'Luis2026']])
  })
})

describe('leerUsuarios', () => {
  it('con títulos en cualquier orden (y columnas de más)', () => {
    const lista = leerUsuarios('Correo electrónico\tTeléfono\tNombre del promotor\tClave\nLuis@Empresa.com \t555\t Luis Pérez\tLuis2026')
    expect(lista.conTitulos).toBe(true)
    expect(lista.usuarios).toEqual([
      { renglon: 1, nombre: 'Luis Pérez', correo: 'luis@empresa.com', contrasena: 'Luis2026', error: null },
    ])
  })

  it('sin títulos: el correo es la columna con @ y el resto va en orden (nombre, contraseña)', () => {
    expect(resumen('Luis Pérez\tluis@empresa.com\tLuis2026\nAna López\tana@empresa.com\tAna2026')).toEqual([
      ['Luis Pérez', 'luis@empresa.com', 'Luis2026', null],
      ['Ana López', 'ana@empresa.com', 'Ana2026', null],
    ])
    expect(resumen('luis@empresa.com\tLuis Pérez\tLuis2026')).toEqual([['Luis Pérez', 'luis@empresa.com', 'Luis2026', null]])
  })

  it('"Usuario" como título del nombre; un título desconocido con tres columnas se adivina', () => {
    expect(resumen('Usuario\tCorreo\tPIN\nLuis Pérez\tluis@empresa.com\t123456')).toEqual([
      ['Luis Pérez', 'luis@empresa.com', '123456', null],
    ])
  })

  it('revisa cada renglón', () => {
    const texto = [
      'Nombre\tCorreo\tContraseña',
      'Luis\tluis@empresa.com\tLuis2026',
      '\tsin.nombre@empresa.com\tsecreta1',
      'Sin correo\t\tsecreta1',
      'Correo malo\tluis-empresa.com\tsecreta1',
      'Corta\tcorta@empresa.com\t12345',
      'Sin clave\tsin.clave@empresa.com',
      'Luis otra vez\tLUIS@empresa.com\tOtra2026',
    ].join('\n')
    expect(leerUsuarios(texto).usuarios.map((u) => [u.renglon, u.error])).toEqual([
      [1, null],
      [2, 'Falta el nombre'],
      [3, 'Falta el correo'],
      [4, 'El correo no es válido'],
      [5, 'La contraseña debe tener al menos 6 caracteres'],
      [6, 'Falta la contraseña'],
      [7, 'Correo repetido (renglón 1)'],
    ])
  })

  it('nada pegado', () => {
    expect(leerUsuarios('  \n\n')).toEqual({ usuarios: [], conTitulos: false })
  })
})
