// Simulador de Supabase (Auth y la API REST) para las pruebas en el navegador, con la estructura real de la base:
// promotores, asignaciones de la semana, clientes con id_cliente de texto, visitas, respuestas y resultados.
// Solo responde lo que la app usa; no es un Postgres de verdad.
const crypto = require('crypto')

const SUPABASE = 'https://mock.supabase.co'
const UID = '7f1c2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b'
const EMAIL = 'ana.lopez@empresa.com'
/** Ubicación del promotor en las pruebas (Roma Norte, CDMX). */
const ME = { latitude: 19.427, longitude: -99.1676, accuracy: 12 }

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const ahora = () => Math.floor(Date.now() / 1000)
const tokenPara = (user) =>
  `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: ahora() + 3600, iat: ahora() })}.firma`

/** Lunes de la semana en curso (hora de México) más `dias`, como "YYYY-MM-DD". */
function diaDeEstaSemana(dias) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
  const d = new Date(`${hoy}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + dias)
  return d.toISOString().slice(0, 10)
}

function tabla(columns, rows, pk) {
  return { columns, rows: rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] === undefined ? null : r[c]]))), pk, seq: 1000 }
}

function crearBase() {
  const cli = (id, id_cliente, nombre_cliente, calle, dLat, dLng, extra = {}) => ({
    id,
    id_cliente,
    nombre_cliente,
    calle,
    latitud: dLat === null ? null : ME.latitude + dLat,
    longitud: dLng === null ? null : ME.longitude + dLng,
    dia_visita: '',
    saldo_premia: 1500,
    reseteado: false,
    activo: true,
    ...extra,
  })
  const clientes = [
    cli(1, '120070912', 'Abarrotes La Güera', 'Av. Chapultepec 120', 0.0002, -0.0001, { dia_visita: 'Martes' }),
    cli(2, '120317437', 'Miscelánea Lupita', 'Colima 45', 0.0031, 0.0042),
    cli(3, '120400001', 'Tienda Don Pepe', 'Hamburgo 210', -0.0042, 0.0061, { dia_visita: 'lunesjueves' }),
    cli(4, '120400002', 'Super Mini 24', 'Insurgentes 300', -0.0105, 0.0098),
    cli(5, '120400004', 'Cremería Sin Mapa', 'Durango 8', null, null),
    cli(6, '120400005', 'Abarrotes Zapata', 'Zapata 77', 0.012, -0.01),
    cli(7, '999000001', 'Cliente de otro promotor', 'Otra zona', 0.05, 0.05),
  ]
  const asig = (id_asignacion, id_cliente, dia, estatus, id_promotor = UID) => ({
    id_asignacion,
    id_cliente,
    id_promotor,
    fecha_asignada: diaDeEstaSemana(dia),
    orden_visita: null,
    estatus,
    observacion: null,
    created_at: '2026-10-01T00:00:00+00:00',
  })
  const OTRO = '00000000-0000-0000-0000-000000000001'
  const tables = {
    promotores: tabla(
      ['id_promotor', 'nombre', 'correo', 'activo', 'rol', 'created_at', 'latitud', 'longitud', 'ubicacion', 'region'],
      [
        { id_promotor: UID, nombre: 'Ana López', correo: EMAIL, activo: true, rol: 'promotor', created_at: '2026-08-01T00:00:00+00:00', latitud: ME.latitude, longitud: ME.longitude },
        { id_promotor: OTRO, nombre: 'Otro Promotor', correo: 'otro@empresa.com', activo: true, rol: 'promotor', created_at: '2026-08-01T00:00:00+00:00' },
      ],
      'id_promotor',
    ),
    clientes: tabla(Object.keys(clientes[0]), clientes, 'id'),
    asignaciones: tabla(
      ['id_asignacion', 'id_cliente', 'id_promotor', 'fecha_asignada', 'orden_visita', 'estatus', 'observacion', 'created_at'],
      [
        asig(70, '120070912', 1, 'Pendiente'),
        asig(71, '120317437', 1, 'Pendiente'),
        asig(72, '120400001', 0, 'Reagendada'),
        asig(73, '120400002', 0, 'Completada'),
        asig(74, '120400004', 2, 'Pendiente'),
        asig(75, '120400005', 2, 'Completada'),
        asig(76, '999000001', 1, 'Pendiente', OTRO),
      ],
      'id_asignacion',
    ),
    preguntas: tabla(
      ['id_pregunta', 'texto_pregunta', 'tipo_respuesta', 'orden', 'activa', 'opciones', 'created_at', 'obligatoria', 'id_pregunta_padre', 'valor_activador'],
      [
        { id_pregunta: 1, texto_pregunta: 'Se localizo la tienda', tipo_respuesta: 'si_no', orden: 1, activa: true, obligatoria: true },
        { id_pregunta: 2, texto_pregunta: 'Comentarios', tipo_respuesta: 'texto', orden: 2, activa: true, obligatoria: false },
      ],
      'id_pregunta',
    ),
    preguntas_reglas: tabla(['id_regla', 'id_pregunta', 'id_pregunta_padre', 'valor_activador'], [{ id_regla: 1, id_pregunta: 2, id_pregunta_padre: 1, valor_activador: '*' }], 'id_regla'),
    visitas: tabla(
      ['id_visita', 'id_asignacion', 'id_cliente', 'id_promotor', 'fecha_visita', 'hora_inicio', 'hora_fin', 'latitud_visita', 'longitud_visita', 'visita_realizada', 'created_at', 'fecha_fin', 'distancia_checkin_m'],
      [{ id_visita: 40, id_asignacion: 73, id_cliente: '120400002', id_promotor: UID, fecha_visita: '2026-10-14T18:31:26+00:00', hora_inicio: '2026-10-14T18:20:00+00:00', visita_realizada: true, created_at: '2026-10-14T18:31:26+00:00' }],
      'id_visita',
    ),
    respuestas: tabla(
      ['id_respuesta', 'id_visita', 'pregunta', 'respuesta', 'tipo_respuesta', 'created_at', 'id_pregunta'],
      [{ id_respuesta: 300, id_visita: 40, pregunta: 'Se localizo la tienda', respuesta: 'Si', id_pregunta: 1, created_at: '2026-10-14T18:31:26+00:00' }],
      'id_respuesta',
    ),
    resultados_visitas: tabla(
      ['id_resultado', 'id_visita', 'id_cliente', 'nombre_cliente', 'id_promotor', 'fecha_visita', 'digital_post_visita', 'fecha_actualizacion'],
      [{ id_resultado: 1, id_visita: 40, id_cliente: '120400002', nombre_cliente: 'Super Mini 24', id_promotor: UID, fecha_visita: '2026-10-14T10:00:00', digital_post_visita: true, fecha_actualizacion: '2026-10-15T00:00:00' }],
      'id_resultado',
    ),
    jornadas: tabla(
      ['id_jornada', 'id_promotor', 'fecha', 'hora_inicio', 'hora_fin', 'latitud_inicio', 'longitud_inicio', 'precision_inicio_m', 'latitud_fin', 'longitud_fin', 'precision_fin_m', 'created_at'],
      [],
      'id_jornada',
    ),
  }
  // Lo que deja ver la base a cada usuario (como las políticas RLS): sus asignaciones y los clientes asignados.
  tables.asignaciones.select = (r, uid) => r.id_promotor === uid
  tables.clientes.select = (r, uid, db) => db.tables.asignaciones.rows.some((a) => a.id_cliente === r.id_cliente && a.id_promotor === uid)
  tables.promotores.select = (r, uid) => r.id_promotor === uid
  tables.visitas.select = (r, uid) => r.id_promotor === uid
  tables.resultados_visitas.select = (r, uid) => r.id_promotor === uid
  const usuarios = [
    {
      id: UID,
      aud: 'authenticated',
      role: 'authenticated',
      email: EMAIL,
      email_confirmed_at: '2026-08-01T00:00:00Z',
      phone: '',
      confirmed_at: '2026-08-01T00:00:00Z',
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { full_name: 'Ana López' },
      identities: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    },
  ]
  return { tables, usuarios }
}

// ---------------------------------------------------------------------------- filtros de PostgREST
const CON_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const esNumero = (v) => v !== '' && v !== null && !Number.isNaN(Number(v))
function comparar(v, valor) {
  const a = v === null || v === undefined ? '' : String(v)
  if (esNumero(a) && esNumero(valor)) return Number(a) - Number(valor)
  if (CON_ZONA.test(a) && CON_ZONA.test(valor)) return Date.parse(a) - Date.parse(valor)
  return a < valor ? -1 : a > valor ? 1 : 0
}
function patron(texto) {
  const re = texto.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${re}$`, 'i')
}
function cumple(row, { col, op, valor }) {
  const v = row[col]
  switch (op) {
    case 'eq':
      return v !== null && v !== undefined && (String(v) === valor || (esNumero(v) && esNumero(valor) && Number(v) === Number(valor)))
    case 'neq':
      return v !== null && v !== undefined && String(v) !== valor
    case 'is':
      return valor === 'null' ? v === null || v === undefined : String(v) === valor
    case 'in': {
      const lista = valor.replace(/^\(|\)$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, ''))
      return v !== null && v !== undefined && lista.includes(String(v))
    }
    case 'like':
    case 'ilike':
      return v !== null && v !== undefined && patron(valor).test(String(v))
    case 'gt':
      return v !== null && v !== undefined && comparar(v, valor) > 0
    case 'gte':
      return v !== null && v !== undefined && comparar(v, valor) >= 0
    case 'lt':
      return v !== null && v !== undefined && comparar(v, valor) < 0
    case 'lte':
      return v !== null && v !== undefined && comparar(v, valor) <= 0
    default:
      return true
  }
}
const RESERVADOS = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'])
function filtrosDe(url) {
  const filtros = []
  for (const [col, raw] of url.searchParams) {
    if (RESERVADOS.has(col)) continue
    const m = /^(not\.)?(eq|neq|is|in|like|ilike|gt|gte|lt|lte)\.(.*)$/s.exec(raw)
    if (m) filtros.push({ col, op: m[2], valor: m[3], negado: Boolean(m[1]) })
  }
  return filtros
}

// ---------------------------------------------------------------------------- respuestas
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range, range-unit' }
const json = (route, status, body, headers = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers: { ...CORS, ...headers }, body: body === undefined ? '' : JSON.stringify(body) })
const errorPg = (route, status, code, message) => json(route, status, { code, details: null, hint: null, message })

/** Conecta el simulador a un contexto de Playwright. `log` recibe una línea por petición ("GET clientes?…"). */
function instalarMock(context, db, log = []) {
  return context.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    const token = (req.headers()['authorization'] || '').replace(/^Bearer /, '')
    let uid = null
    try {
      uid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub ?? null
    } catch {
      uid = null
    }
    const sesion = (user) => ({ access_token: tokenPara(user), token_type: 'bearer', expires_in: 3600, expires_at: ahora() + 3600, refresh_token: `refresh-${user.id}`, user })

    // ---- Auth
    if (url.pathname === '/auth/v1/token') {
      const body = JSON.parse(req.postData() || '{}')
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const user = db.usuarios.find((u) => `refresh-${u.id}` === body.refresh_token)
        return user ? json(route, 200, sesion(user)) : json(route, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
      }
      const user = db.usuarios.find((u) => u.email === body.email)
      if (!user || body.password === 'mala') return json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      log.push(`LOGIN ${body.email}`)
      return json(route, 200, sesion(user))
    }
    if (url.pathname === '/auth/v1/user') {
      const user = db.usuarios.find((u) => u.id === uid)
      return user ? json(route, 200, user) : json(route, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' })
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS })

    // ---- RPC: ninguna función existe en esta copia.
    const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname)
    if (rpc) return errorPg(route, 404, 'PGRST202', `Could not find the function public.${rpc[1]} in the schema cache`)

    // ---- Tablas
    const nombre = /^\/rest\/v1\/([^/]+)$/.exec(url.pathname)?.[1]
    const t = nombre ? db.tables[nombre] : null
    log.push(`${method} ${url.pathname.replace('/rest/v1/', '')}${url.search}`)
    if (!t) return errorPg(route, 404, 'PGRST205', `Could not find the table 'public.${nombre}' in the schema cache`)

    const filtros = filtrosDe(url)
    for (const f of filtros) if (!t.columns.includes(f.col)) return errorPg(route, 400, '42703', `column ${nombre}.${f.col} does not exist`)
    const select = url.searchParams.get('select') || '*'
    const cols = select === '*' ? null : select.split(',').map((s) => s.trim()).filter(Boolean)
    if (cols) for (const c of cols) if (!t.columns.includes(c)) return errorPg(route, 400, '42703', `column ${nombre}.${c} does not exist`)
    const proyectar = (row) => (cols ? Object.fromEntries(cols.map((c) => [c, row[c]])) : { ...row })
    const visible = (row) => !t.select || t.select(row, uid, db)
    const pasa = (row) => filtros.every((f) => (f.negado ? !cumple(row, f) : cumple(row, f)))
    const prefer = req.headers()['prefer'] || ''
    const unico = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
    const responder = (status, filas, headers = {}) => {
      if (unico) {
        if (filas.length !== 1) return json(route, 406, { code: 'PGRST116', details: `The result contains ${filas.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' })
        return json(route, status, filas[0], headers)
      }
      return json(route, status, filas, headers)
    }

    if (method === 'GET' || method === 'HEAD') {
      let filas = t.rows.filter((r) => visible(r) && pasa(r))
      const order = url.searchParams.get('order')
      if (order) {
        const claves = order.split(',').map((o) => o.split('.'))
        filas = [...filas].sort((a, b) => {
          for (const [col, dir] of claves) {
            const c = a[col] === b[col] ? 0 : a[col] === null ? 1 : b[col] === null ? -1 : comparar(a[col], String(b[col]))
            if (c !== 0) return dir === 'desc' ? -c : c
          }
          return 0
        })
      }
      const total = filas.length
      const offset = Number(url.searchParams.get('offset') || 0)
      const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : filas.length
      filas = filas.slice(offset, offset + limit)
      const headers = { 'content-range': `${filas.length ? `${offset}-${offset + filas.length - 1}` : '*'}/${prefer.includes('count=') ? total : '*'}` }
      if (method === 'HEAD') return route.fulfill({ status: 200, headers: { ...CORS, ...headers } })
      return responder(200, filas.map(proyectar), headers)
    }

    if (method === 'POST') {
      const body = JSON.parse(req.postData() || '[]')
      const lista = Array.isArray(body) ? body : [body]
      for (const row of lista) for (const k of Object.keys(row)) if (!t.columns.includes(k)) return errorPg(route, 400, 'PGRST204', `Could not find the '${k}' column of '${nombre}' in the schema cache`)
      const nuevas = lista.map((row) => {
        const full = Object.fromEntries(t.columns.map((c) => [c, null]))
        Object.assign(full, row)
        if (t.pk && full[t.pk] === null) full[t.pk] = t.pk.startsWith('id_promotor') ? crypto.randomUUID() : ++t.seq
        if (t.columns.includes('created_at') && !full.created_at) full.created_at = new Date().toISOString()
        if (nombre === 'visitas' && !full.fecha_visita) full.fecha_visita = new Date().toISOString()
        t.rows.push(full)
        return full
      })
      if (!prefer.includes('return=representation')) return route.fulfill({ status: 201, headers: CORS })
      return responder(201, nuevas.map(proyectar))
    }

    if (method === 'PATCH') {
      const cambios = JSON.parse(req.postData() || '{}')
      const filas = t.rows.filter((r) => visible(r) && pasa(r))
      for (const r of filas) Object.assign(r, cambios)
      if (!prefer.includes('return=representation')) return route.fulfill({ status: 204, headers: CORS })
      return responder(200, filas.map(proyectar))
    }

    if (method === 'DELETE') {
      const borrar = t.rows.filter((r) => visible(r) && pasa(r))
      t.rows = t.rows.filter((r) => !borrar.includes(r))
      if (!prefer.includes('return=representation')) return route.fulfill({ status: 204, headers: CORS })
      return responder(200, borrar.map(proyectar))
    }
    return json(route, 405, { message: 'method not allowed' })
  })
}

/** Estilo de mapa sintético (las teselas reales no se pueden descargar en las pruebas). */
function estiloMapa() {
  const base = { lat: ME.latitude, lng: ME.longitude }
  const calles = []
  for (let i = -14; i <= 14; i++) {
    const off = i * 0.0021
    calles.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[base.lng - 0.04, base.lat + off], [base.lng + 0.04, base.lat + off]] } })
    calles.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[base.lng + off, base.lat - 0.04], [base.lng + off, base.lat + 0.04]] } })
  }
  return {
    version: 8,
    glyphs: 'https://mock-glyphs.local/{fontstack}/{range}.pbf',
    sources: { calles: { type: 'geojson', data: { type: 'FeatureCollection', features: calles } } },
    layers: [
      { id: 'fondo', type: 'background', paint: { 'background-color': '#f2efe9' } },
      { id: 'calles', type: 'line', source: 'calles', paint: { 'line-color': '#ffffff', 'line-width': 4 } },
    ],
  }
}

/** Contexto de navegador (teléfono por defecto) con el simulador y el mapa sintético. */
async function nuevoContexto(browser, db, opciones = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    geolocation: ME,
    permissions: ['geolocation'],
    ...opciones,
  })
  await context.route('https://mock-style.local/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(estiloMapa()) }))
  await context.route('https://mock-glyphs.local/**', (r) => r.fulfill({ status: 404, body: '' }))
  const log = []
  await instalarMock(context, db, log)
  return { context, log }
}

module.exports = { SUPABASE, UID, EMAIL, ME, crearBase, instalarMock, nuevoContexto, estiloMapa }
