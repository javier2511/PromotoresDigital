// Prueba en el navegador de Resultados del equipo: filtros de región, promotor y periodo (admin y líder).
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
async function entrar(page) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Correo electrónico').fill(EMAIL)
  await page.getByLabel('Contraseña', { exact: true }).fill('secreta')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(`${BASE}/`)
}
const chips = async (page, grupo) => page.getByRole('group', { name: grupo }).getByRole('button').allInnerTexts()
/** Espera el conteo "N registros" de la lista y lo regresa. */
async function registros(page, esperado) {
  let actual = ''
  for (let i = 0; i < 50; i++) {
    actual = (await page.locator('main').innerText()).match(/(\d+) registros?\b/)?.[1] ?? ''
    if (actual === String(esperado)) break
    await page.waitForTimeout(100)
  }
  return actual
}
const texto = (lista) => lista.map((t) => t.replace(/\s+/g, ' ').trim()).join('|')

;(async () => {
  const browser = await chromium.launch()

  console.log('Admin: región, promotor y periodo')
  {
    const { context } = await nuevoContexto(browser, crearBase({ rol: 'admin' }))
    const p = await context.newPage()
    vigilar(p)
    await entrar(p)
    await p.goto(`${BASE}/resultados`)
    await p.getByText('De todos los promotores').waitFor({ timeout: 15000 })
    check((await registros(p, 6)) === '6', 'Total: los 6 resultados del equipo')
    check(texto(await chips(p, 'Región')) === 'Todas|Norte|Sur', `chips de región (${texto(await chips(p, 'Región'))})`)
    check(texto(await chips(p, 'Promotor')) === 'Todos|Ana López|Luis Pérez|Marta Ruiz', `chips de promotor (${texto(await chips(p, 'Promotor'))})`)
    check((await p.getByLabel('Promotor', { exact: true }).locator('option').count()) === 0, 'ya no hay lista desplegable de promotor')

    await p.getByRole('tab', { name: 'Semana' }).click()
    check((await registros(p, 4)) === '4', 'Semana: 4 (sin las de otras semanas)')
    await p.getByRole('button', { name: 'Sur', exact: true }).click()
    check((await registros(p, 1)) === '1', 'región Sur: 1')
    check(texto(await chips(p, 'Promotor')) === 'Todos|Marta Ruiz', `con la región Sur solo salen sus promotores (${texto(await chips(p, 'Promotor'))})`)
    const resumen = (await p.locator('main').innerText()).replace(/\s+/g, ' ')
    check(/Clientes visitados 1/.test(resumen) && /100% 1 de 1/.test(resumen), 'el resumen es de lo filtrado')
    await p.getByRole('button', { name: 'Todas', exact: true }).click()
    await p.getByRole('group', { name: 'Promotor' }).getByRole('button', { name: 'Luis Pérez' }).click()
    await p.getByRole('group', { name: 'Promotor' }).getByRole('button', { name: 'Ana López' }).click()
    check((await registros(p, 3)) === '3', 'varios promotores a la vez (Luis y Ana): 3')
    await p.waitForTimeout(300)
    await p.screenshot({ path: path.join(CAPTURAS, 'resultados-filtros.png') })
    await p.getByRole('button', { name: 'Norte', exact: true }).click()
    check((await registros(p, 3)) === '3' && texto(await chips(p, 'Promotor')) === 'Todos|Ana López|Luis Pérez', 'al cambiar de región se quitan los promotores elegidos')
    await context.close()
  }

  console.log('Líder: solo su región, sin filtro de región')
  {
    const { context } = await nuevoContexto(browser, crearBase({ rol: 'lider' }))
    const p = await context.newPage()
    vigilar(p)
    await entrar(p)
    await p.goto(`${BASE}/resultados`)
    await p.getByText('De los promotores de la región').waitFor({ timeout: 15000 })
    check((await registros(p, 4)) === '4', 'Total: los 4 de su región')
    check((await p.getByRole('group', { name: 'Región' }).count()) === 0, 'sin chips de región')
    check(texto(await chips(p, 'Promotor')) === 'Todos|Ana López|Luis Pérez', `chips de sus promotores (${texto(await chips(p, 'Promotor'))})`)
    await p.getByRole('group', { name: 'Promotor' }).getByRole('button', { name: 'Luis Pérez' }).click()
    check((await registros(p, 2)) === '2', 'un promotor: 2')
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
