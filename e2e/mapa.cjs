// Prueba en el navegador del mapa: buscar a cualquier cliente, filtrar (pendientes, visitados, todos) y ordenar.
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
  await page.screenshot({ path: path.join(CAPTURAS, nombre) })
}
async function entrar(page) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Correo electrónico').fill(EMAIL)
  await page.getByLabel('Contraseña', { exact: true }).fill('secreta')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(`${BASE}/`)
}
const parametro = (page, nombre) => new URL(page.url()).searchParams.get(nombre)
const texto = (s) => s.replace(/\s+/g, ' ').trim()

;(async () => {
  const browser = await chromium.launch()

  console.log('Clientes: la búsqueda sigue igual')
  const { context: tel } = await nuevoContexto(browser, crearBase())
  const p = await tel.newPage()
  vigilar(p)
  await entrar(p)
  await p.getByText('Abarrotes La Güera').first().waitFor({ timeout: 15000 })
  await p.getByLabel('Buscar clientes').fill('lupita')
  await p.waitForTimeout(300)
  const enLista = await p.locator('ul li p.font-semibold').allInnerTexts()
  check(enLista.join('|') === 'Miscelánea Lupita', `Clientes: buscar "lupita" (${enLista.join('|')})`)

  console.log('Mapa en el teléfono')
  await p.goto(`${BASE}/mapa`)
  await p.locator('.maplibregl-canvas').waitFor({ timeout: 20000 })
  const buscar = p.getByRole('searchbox', { name: 'Buscar cliente en el mapa' })
  await buscar.waitFor()
  const pestanas = (await p.getByRole('tablist', { name: 'Filtrar mapa' }).getByRole('tab').allInnerTexts()).map(texto)
  check(pestanas.join('|') === 'Pendientes 4|Visitados 2|Todos 6', `filtros Pendientes, Visitados y Todos con sus conteos (${pestanas.join('|')})`)

  // Buscar a un cliente visitado mientras el filtro es Pendientes: aparece igual.
  await buscar.fill('zapata')
  const lista = p.getByRole('list', { name: 'Clientes' })
  await lista.waitFor()
  let filas = (await lista.getByRole('listitem').allInnerTexts()).map(texto)
  check(filas.length === 1 && /Abarrotes Zapata/.test(filas[0]) && /Visitado/.test(filas[0]), `buscar "zapata" con el filtro en Pendientes encuentra al visitado (${filas.join(' / ')})`)
  check((await p.locator('p:visible', { hasText: '1 cliente encontrado · se busca en todos, sin filtros' }).count()) === 1, 'avisa que la búsqueda es en todos los clientes')
  check((await p.getByRole('tablist', { name: 'Filtrar mapa' }).count()) === 0, 'mientras busca, los filtros se ocultan')
  check((await p.getByRole('button', { name: 'Limpiar búsqueda' }).count()) === 1, 'botón para limpiar la búsqueda')
  check(!(await p.getByRole('button', { name: 'Ver todos los clientes' }).isVisible()), 'los botones flotantes no tapan la lista')
  await captura(p, 'mapa-buscar.png')
  await lista.getByRole('button', { name: /Abarrotes Zapata/ }).click()
  const verDetalle = p.getByRole('button', { name: 'Ver detalle' })
  await verDetalle.waitFor()
  const tarjeta = texto(await verDetalle.locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]').innerText())
  check(parametro(p, 'c') === '120400005' && !parametro(p, 'q') && (await lista.count()) === 0, 'al elegirlo queda seleccionado y se cierra la búsqueda')
  check(/Abarrotes Zapata/.test(tarjeta) && /Visitado/.test(tarjeta), `su tarjeta aparece aunque el filtro sea Pendientes (${tarjeta.slice(0, 60)})`)
  await captura(p, 'mapa-elegido.png')

  // Por número de cliente.
  await buscar.fill('120317')
  await lista.waitFor()
  filas = (await lista.getByRole('listitem').allInnerTexts()).map(texto)
  check(filas.length === 1 && /Miscelánea Lupita/.test(filas[0]), `buscar por número (120317) (${filas.join(' / ')})`)

  // Un cliente sin ubicación también se encuentra.
  await buscar.fill('sin mapa')
  await lista.waitFor()
  filas = (await lista.getByRole('listitem').allInnerTexts()).map(texto)
  check(filas.length === 1 && /Cremería Sin Mapa/.test(filas[0]) && /Sin ubicación/.test(filas[0]), `cliente sin ubicación (${filas.join(' / ')})`)
  await lista.getByRole('button', { name: /Cremería Sin Mapa/ }).click()
  await p.getByText('Sin ubicación en el mapa').waitFor()
  check(parametro(p, 'c') === '120400004', 'al elegirlo se ve su tarjeta: "Sin ubicación en el mapa"')

  // Sin coincidencias, y el cliente de otro promotor no aparece.
  await buscar.fill('otro promotor')
  await p.locator('p:visible', { hasText: 'No encontramos clientes que coincidan con “otro promotor”.' }).waitFor()
  check(true, 'sin coincidencias lo dice (y no aparecen clientes de otros promotores)')
  await p.getByRole('button', { name: 'Limpiar búsqueda' }).click()
  await p.getByRole('tablist', { name: 'Filtrar mapa' }).waitFor()
  check(true, 'al limpiar la búsqueda vuelven los filtros')

  // Lista y orden.
  await p.getByRole('button', { name: 'Ver lista' }).click()
  await lista.waitFor()
  // La lista cambia al re-dibujarse: se espera a que tenga el orden esperado (o se reporta el que tenga).
  const esperarOrden = async (esperado) => {
    let actual = ''
    for (let i = 0; i < 40; i++) {
      actual = (await lista.locator('li p.text-sm.font-semibold').allInnerTexts()).join('|')
      if (actual === esperado) break
      await p.waitForTimeout(100)
    }
    return actual
  }
  let orden = await esperarOrden('Abarrotes La Güera|Miscelánea Lupita|Tienda Don Pepe|Cremería Sin Mapa')
  check(orden === 'Abarrotes La Güera|Miscelánea Lupita|Tienda Don Pepe|Cremería Sin Mapa', `Ver lista: pendientes por cercanía, sin ubicación al final (${orden})`)
  await captura(p, 'mapa-lista.png')
  await p.getByRole('button', { name: 'Ordenado por cercanía' }).click()
  orden = await esperarOrden('Abarrotes La Güera|Cremería Sin Mapa|Miscelánea Lupita|Tienda Don Pepe')
  check(orden === 'Abarrotes La Güera|Cremería Sin Mapa|Miscelánea Lupita|Tienda Don Pepe' && parametro(p, 'o') === 'nombre', `ordenar por nombre (${orden})`)
  await p.getByRole('tab', { name: /Visitados/ }).click()
  orden = await esperarOrden('Abarrotes Zapata|Super Mini 24')
  check(orden === 'Abarrotes Zapata|Super Mini 24', `Visitados por nombre (${orden})`)
  await p.getByRole('tab', { name: /Todos/ }).click()
  orden = await esperarOrden('Abarrotes La Güera|Abarrotes Zapata|Cremería Sin Mapa|Miscelánea Lupita|Super Mini 24|Tienda Don Pepe')
  check(orden === 'Abarrotes La Güera|Abarrotes Zapata|Cremería Sin Mapa|Miscelánea Lupita|Super Mini 24|Tienda Don Pepe', `Todos por nombre: los 6 clientes (${orden})`)
  await p.getByRole('button', { name: 'Ordenado por nombre' }).click()
  orden = await esperarOrden('Abarrotes La Güera|Miscelánea Lupita|Tienda Don Pepe|Super Mini 24|Abarrotes Zapata|Cremería Sin Mapa')
  check(orden === 'Abarrotes La Güera|Miscelánea Lupita|Tienda Don Pepe|Super Mini 24|Abarrotes Zapata|Cremería Sin Mapa', `Todos por cercanía (${orden})`)
  await lista.getByRole('button', { name: /Super Mini 24/ }).click()
  await verDetalle.waitFor()
  check(parametro(p, 'c') === '120400002' && (await lista.count()) === 0, 'elegir desde la lista cierra la lista y muestra la tarjeta')
  await tel.close()

  console.log('Mapa en computadora')
  const { context: pc } = await nuevoContexto(browser, crearBase(), { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })
  const d = await pc.newPage()
  vigilar(d)
  await entrar(d)
  await d.goto(`${BASE}/mapa`)
  await d.getByRole('heading', { name: 'Mapa de clientes' }).waitFor({ timeout: 15000 })
  const listaPc = d.getByRole('list', { name: 'Clientes' })
  await listaPc.waitFor()
  const enPc = await listaPc.locator('li p.text-sm.font-semibold').allInnerTexts()
  check(enPc.join('|') === 'Abarrotes La Güera|Miscelánea Lupita|Tienda Don Pepe|Cremería Sin Mapa', `lista lateral: pendientes por cercanía (${enPc.join('|')})`)
  await d.getByRole('searchbox', { name: 'Buscar cliente en el mapa' }).fill('super')
  await listaPc.getByRole('button', { name: /Super Mini 24/ }).click()
  await d.getByRole('button', { name: 'Ver detalle' }).waitFor()
  check(parametro(d, 'c') === '120400002' && parametro(d, 'q') === 'super', 'en computadora la búsqueda se queda al elegir')
  await captura(d, 'mapa-computadora.png')
  await pc.close()

  await browser.close()
  check(errores.length === 0, `sin errores en la consola${errores.length ? `: ${errores.join(' | ')}` : ''}`)
  console.log(fallas.length ? `\n${fallas.length} verificaciones fallaron` : '\nTodas las verificaciones pasaron')
  process.exit(fallas.length ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
