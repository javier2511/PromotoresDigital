// Prueba en el navegador de Equipo → Asignaciones: pendientes de cada promotor (admin: todos; líder: su región).
// Corre contra la app de prueba (simulador de Supabase): bash e2e/correr.sh
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { crearBase, nuevoContexto, EMAIL } = require('./mock.cjs')

const BASE = process.env.BASE || 'http://localhost:4173'
const CAPTURAS = path.resolve(process.argv[2] || path.join(__dirname, 'capturas'))
fs.mkdirSync(CAPTURAS, { recursive: true })

const fallas = []
const errores = []
function check(ok, msg) {
  console.log(ok ? '  ✓' : '  ✗', msg)
  if (!ok) fallas.push(msg)
}
function vigilar(page) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !/mock-glyphs|Failed to load resource/.test(m.text())) errores.push(m.text())
  })
  page.on('pageerror', (e) => errores.push(`PAGEERROR ${e.message}`))
}
async function captura(page, nombre) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(CAPTURAS, nombre), fullPage: true })
}
async function entrar(page) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Correo electrónico').fill(EMAIL)
  await page.getByLabel('Contraseña', { exact: true }).fill('secreta')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(`${BASE}/`)
}
const texto = (s) => s.replace(/\s+/g, ' ').trim()

/** Renglones de la lista (nombre y pendientes), esperando a que tengan lo esperado. */
async function esperarFilas(page, esperado) {
  const lista = page.getByRole('list', { name: 'Asignaciones por promotor' })
  let actual = ''
  for (let i = 0; i < 50; i++) {
    if (await lista.count()) {
      const filas = await lista.getByRole('listitem').evaluateAll((els) =>
        els.map((el) => `${el.querySelector('p.font-semibold')?.textContent?.trim()} ${el.querySelector('p.text-xl')?.textContent?.trim()}`),
      )
      actual = filas.join(' | ')
      if (actual === esperado) break
    }
    await page.waitForTimeout(100)
  }
  return actual
}

;(async () => {
  const browser = await chromium.launch()

  console.log('Admin: asignaciones de todos los promotores')
  {
    const { context, log } = await nuevoContexto(browser, crearBase({ rol: 'admin' }))
    const p = await context.newPage()
    vigilar(p)
    await entrar(p)
    await p.getByRole('link', { name: 'Equipo' }).first().click()
    await p.getByRole('tab', { name: 'Asignaciones' }).click()
    check(new URL(p.url()).searchParams.get('v') === 'asignaciones', 'la vista Asignaciones queda en la dirección (?v=asignaciones)')
    let filas = await esperarFilas(p, 'Ana López 4 | Luis Pérez 2 | Marta Ruiz 2 | Otro Promotor 1')
    check(filas === 'Ana López 4 | Luis Pérez 2 | Marta Ruiz 2 | Otro Promotor 1', `esta semana, más pendientes primero (${filas})`)
    const resumen = texto(await p.locator('main').innerText())
    check(/Asignadas 12 Completadas 3 Pendientes 9 4 promotores con pendientes Avance 25%/.test(resumen), 'totales: 12 asignadas, 3 completadas, 9 pendientes, 25% (sin las canceladas)')
    const ana = texto(await p.getByRole('listitem').filter({ hasText: 'Ana López' }).innerText())
    check(/Norte · 2 de 6 completadas/.test(ana), `cada renglón dice su región y su avance (${ana})`)
    check(log.some((l) => /^RPC pd_asignaciones_por_promotor \{"p_desde":"\d{4}-\d{2}-\d{2}","p_hasta":"\d{4}-\d{2}-\d{2}"\}$/.test(l)), 'la base hace la cuenta de la semana (una llamada, no todas las filas)')
    await captura(p, 'equipo-asignaciones.png')

    await p.getByRole('button', { name: 'Sur', exact: true }).click()
    filas = await esperarFilas(p, 'Marta Ruiz 2')
    check(filas === 'Marta Ruiz 2', `filtro de región Sur (${filas})`)
    await p.getByRole('button', { name: 'Todas', exact: true }).click()
    await p.getByRole('button', { name: 'Ordenado por pendientes' }).click()
    filas = await esperarFilas(p, 'Ana López 4 | Luis Pérez 2 | Marta Ruiz 2 | Otro Promotor 1')
    check(filas === 'Ana López 4 | Luis Pérez 2 | Marta Ruiz 2 | Otro Promotor 1', `por nombre (${filas})`)
    await p.getByLabel('Buscar promotor').fill('mar')
    filas = await esperarFilas(p, 'Marta Ruiz 2')
    check(filas === 'Marta Ruiz 2', `buscar promotor (${filas})`)
    const [descarga] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /CSV/ }).click()])
    const csv = fs.readFileSync(await descarga.path(), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/)
    check(/^asignaciones_\d{4}-\d{2}-\d{2}_a_\d{4}-\d{2}-\d{2}\.csv$/.test(descarga.suggestedFilename()) && csv[0] === 'Promotor,Región,Asignadas,Completadas,Pendientes,Avance %' && csv[1] === 'Marta Ruiz,Sur,2,0,2,0',
      `descargar CSV de lo que se ve (${descarga.suggestedFilename()}: ${csv.join(' / ')})`)
    await p.getByRole('button', { name: 'Limpiar búsqueda' }).click()
    await p.getByRole('button', { name: 'Periodo siguiente' }).click()
    filas = await esperarFilas(p, 'Luis Pérez 1')
    check(filas === 'Luis Pérez 1', `la próxima semana (asignaciones ya cargadas) (${filas})`)
    await p.getByRole('tab', { name: 'Total' }).click()
    filas = await esperarFilas(p, 'Ana López 4 | Luis Pérez 3 | Marta Ruiz 2 | Otro Promotor 1')
    check(filas === 'Ana López 4 | Luis Pérez 3 | Marta Ruiz 2 | Otro Promotor 1', `Total: todas las fechas (${filas})`)
    await p.getByRole('tab', { name: 'Jornadas' }).click()
    await p.getByLabel('Fecha').waitFor()
    check(true, 'el admin sigue viendo las jornadas')
    await context.close()
  }

  console.log('Líder: solo su región')
  {
    const { context } = await nuevoContexto(browser, crearBase({ rol: 'lider' }))
    const p = await context.newPage()
    vigilar(p)
    await entrar(p)
    await p.getByRole('link', { name: 'Equipo' }).first().click()
    const filas = await esperarFilas(p, 'Ana López 4 | Luis Pérez 2')
    check(filas === 'Ana López 4 | Luis Pérez 2', `ve solo a los promotores de su región (${filas})`)
    const pagina = texto(await p.locator('main').innerText())
    check(/Asignaciones de los promotores de la región Norte/.test(pagina) && (await p.getByRole('tab', { name: 'Jornadas' }).count()) === 0 && (await p.getByRole('link', { name: 'Crear usuarios' }).count()) === 0,
      'sin jornadas ni crear usuarios; el título dice su región')
    check((await p.getByRole('group', { name: 'Región' }).count()) === 0, 'sin filtro de región')
    await captura(p, 'equipo-lider.png')
    await context.close()
  }

  console.log('Promotor: no ve Equipo')
  {
    const { context } = await nuevoContexto(browser, crearBase())
    const p = await context.newPage()
    vigilar(p)
    await entrar(p)
    check((await p.getByRole('link', { name: 'Equipo' }).count()) === 0, 'no tiene la pestaña Equipo')
    await p.goto(`${BASE}/equipo?v=asignaciones`)
    await p.waitForURL(`${BASE}/`, { timeout: 15000 })
    check(true, 'si abre /equipo regresa a Clientes')
    await context.close()
  }

  console.log('Sin el SQL 19')
  {
    const db = crearBase({ rol: 'admin' })
    db.sinSql19 = true
    const { context } = await nuevoContexto(browser, db)
    const p = await context.newPage()
    vigilar(p)
    await entrar(p)
    await p.goto(`${BASE}/equipo?v=asignaciones`)
    await p.getByText('falta ejecutar supabase/19_asignaciones_equipo.sql').waitFor({ timeout: 15000 })
    check(true, 'dice qué SQL falta')
    await context.close()
  }

  await browser.close()
  check(errores.length === 0, `sin errores en la consola${errores.length ? `: ${errores.join(' | ')}` : ''}`)
  console.log(fallas.length ? `\n${fallas.length} verificaciones fallaron` : '\nTodas las verificaciones pasaron')
  process.exit(fallas.length ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
