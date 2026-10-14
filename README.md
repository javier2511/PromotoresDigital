# Promotores Digital

Web app para promotores en campo: lista de clientes asignados, mapa con tu ubicación en tiempo real
(el punto azul, como en Google Maps), ficha de cada cliente, visita que se desbloquea al llegar al punto
de venta, formulario con preguntas condicionales y avance de visitas.

Reemplaza la versión de FlutterFlow **usando la misma base de datos de Supabase, sin cambiar tus tablas**.

## Qué hace

| Pantalla | Detalle |
| --- | --- |
| **Inicio de sesión** | Correo y contraseña de Supabase Auth, con recuperación de contraseña por correo. |
| **Clientes** | Avance (visitados / asignados), búsqueda, filtros Pendientes · Visitados · Todos, orden por cercanía, distancia a cada cliente y "más cercano" destacado. Al finalizar una visita el cliente sale de Pendientes. |
| **Mapa** | Pines por estado (rojo pendiente, verde visitado), agrupación cuando hay muchos, punto azul con círculo de precisión y orientación, botón "Mi ubicación", tarjeta del cliente con *Ver detalle* y *Cómo llegar*. En computadora, lista lateral + mapa. |
| **Ficha del cliente** | Mini mapa con la distancia, botones a Google Maps, Waze y llamada, y la información que tenías en FlutterFlow: saldo de puntos, status autogestión, Premia, cuponera, canal y canjes / promos / lotería / retos de los últimos 3 meses. |
| **Visita** | Se puede iniciar desde cualquier lugar. Al iniciarla se guarda la ubicación del promotor y su distancia al cliente; si está a más de `VITE_RADIO_VISITA_M` metros (100 por defecto) se le avisa a cuánto está y debe confirmar. Preguntas Sí/No, opción única, múltiple, número, fecha y texto; reglas de `preguntas_reglas`; borrador guardado en el teléfono (no se pierde si se cierra la app o se va la señal). |
| **Visita finalizada** | Avance actualizado y el siguiente cliente más cercano. |
| **Resultados** | La tabla de resultados que cargas tú, filtrada al promotor. |
| **Perfil** | Datos del usuario, estado del GPS, "Verificar conexión" (diagnóstico de tablas y columnas) y cerrar sesión. |

También funciona en modo oscuro, en computadora y se puede **instalar en el teléfono** como app
(Chrome/Safari → *Agregar a pantalla de inicio*).

## Publicarla gratis

La app es un sitio estático (no usa servidor propio): el navegador habla directo con Supabase, igual que
FlutterFlow. Por eso cabe en los planes gratuitos.

### Opción A — Vercel (plan Hobby, gratis)

1. Entra a [vercel.com](https://vercel.com) con tu cuenta de GitHub.
2. **Add New → Project** → importa `javier2511/PromotoresDigital` (rama `main` o la que uses).
3. Vercel detecta **Vite** solo. No cambies los comandos (`npm run build`, carpeta `dist`).
4. En **Environment Variables** agrega:

   | Variable | Valor |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://swblsrhhmwxrgdyubckb.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Supabase → *Project Settings → API* → **anon public** (o la *publishable key*) |
   | `VITE_RADIO_VISITA_M` | *(opcional)* metros para considerar que el promotor está en el punto de venta (si está más lejos se le avisa), p. ej. `100` |

5. **Deploy**. Tendrás una dirección tipo `https://promotores-digital.vercel.app`.
6. En Supabase → **Authentication → URL Configuration** pon esa dirección en *Site URL* y agrega
   `https://TU-DOMINIO/restablecer` en *Redirect URLs* (lo usa "¿Olvidaste tu contraseña?").

Cada vez que hagas *push* a GitHub, Vercel publica la nueva versión sola.

> ⚠️ **Ojo con el uso comercial.** Las [reglas de uso de Vercel](https://vercel.com/docs/limits/fair-use-guidelines)
> dicen que el plan Hobby es solo para uso **personal y no comercial**, y consideran comercial un proyecto
> hecho para una empresa (incluso si lo programa un empleado). Si la app es para tu trabajo, la opción B
> es gratuita y no tiene esa restricción.

### Opción B — Cloudflare Pages (gratis, permite uso comercial)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git** → elige el repositorio.
2. *Framework preset*: **Vite** · *Build command*: `npm run build` · *Build output directory*: `dist`.
3. Agrega las mismas variables de entorno de la tabla de arriba y despliega.
4. Igual que en Vercel, agrega la dirección `https://….pages.dev` en Supabase → *URL Configuration*.

El archivo `public/_redirects` ya está listo para Cloudflare Pages (y Netlify); `vercel.json` para Vercel.

## Primer uso: verificar que lee bien tu base de datos

No pude ver tu esquema de Supabase desde aquí, así que la app **detecta sola** los nombres de tus tablas y
columnas (por ejemplo `latitud`/`lat`, `user_id`/`usuario_id`/`email`, `visitado`, `preguntas_reglas`…).

1. Inicia sesión con un usuario promotor que tenga clientes asignados.
2. Ve a **Perfil → Verificar conexión**. Verás, tabla por tabla, qué columna usa para cada dato.
3. Si algo dice **Falta** o tomó una columna equivocada, abre `src/config/schema.ts` (se puede editar
   desde GitHub en el navegador) y deja **solo el nombre correcto** en la lista de ese dato, por ejemplo:

   ```ts
   latitud: ['lat_cliente'],
   ```

   Guarda (commit) y Vercel/Cloudflare vuelve a publicar en un par de minutos.
4. ¿Prefieres que lo ajusten por ti? Ejecuta `supabase/01_ver_estructura.sql` en el *SQL Editor* de
   Supabase (solo lee nombres de tablas, columnas y políticas; no tus datos) y comparte el resultado.

### Cómo escribe en tu base (igual que FlutterFlow)

Al finalizar una visita la app:

1. Inserta una fila en **visitas** con el cliente, el usuario, inicio y fin, coordenadas, distancia y estado
   (solo en las columnas que existan).
2. Inserta en **respuestas** una fila por cada pregunta visible respondida (pregunta, respuesta y visita).
   Las respuestas de opción múltiple se guardan como texto separado por comas.
3. Marca al cliente como visitado en **clientes** (si la columna es booleana guarda `true`; si es texto,
   reutiliza el valor que ya usas, p. ej. `Visitado`). Si tu tabla de clientes no tiene esa columna, se
   considera visitado a todo cliente que tenga una visita registrada.

Si se corta la señal a mitad del guardado, las respuestas siguen en el teléfono y al reintentar se reutiliza
la visita ya creada (no se duplica). Si la app no logra identificar qué clientes son del usuario no muestra
ninguno (nunca los de otros promotores).

### Ver desde dónde se hizo cada visita

Al tocar *Iniciar visita* se toma una lectura de GPS reciente del promotor y se calcula su distancia al
cliente. Si está lejos se le dice a cuánto (p. ej. "Estás a 2.5 km del cliente") y debe confirmar; el
formulario también se lo recuerda. En la tabla **visitas** quedan `latitud`, `longitud`, la distancia en
metros y la precisión del GPS, para que revises desde Supabase qué tan lejos se hizo cada visita.

Esos datos solo se guardan si las columnas existen. En la app ve a **Perfil → Verificar conexión → Visitas**:
si *Latitud*, *Longitud*, *Distancia* o *Precisión GPS* dicen "—", ejecuta
`supabase/03_columnas_distancia_visitas.sql` en el *SQL Editor* (solo agrega las que falten) y luego toca
**Volver a detectar**. Los teléfonos de los promotores revisan la base cada hora, así que toman las columnas
nuevas solos en menos de una hora.

### Información del cliente (ficha)

La ficha muestra solo los datos de la lista `INFO_CLIENTE` en `src/config/schema.ts`, en ese orden: el saldo
de puntos destacado, los indicadores de los últimos 3 meses en mosaicos y el resto como filas. La app busca la
columna de cada dato por su nombre sin importar mayúsculas, acentos ni guiones bajos (por ejemplo
`Status_cuponera`). En **Verificar conexión** ves qué columna encontró para cada uno; para agregar, quitar o
renombrar datos edita esa lista.

### Reglas de preguntas (`preguntas_reglas`)

Cada regla dice: *muestra la pregunta X cuando la respuesta a la pregunta Y es V*.

- Sin columna de operador se compara por igualdad, sin importar mayúsculas ni acentos (`si` = `Sí` = `SI`).
- Operadores aceptados (columna opcional `operador`): `=`, `!=`, `>`, `>=`, `<`, `<=`, `contiene`,
  `en` (lista separada por comas), `respondida`, `vacía`.
- Acción opcional (`accion`): `mostrar` (por defecto) u `ocultar`.
- Varias reglas sobre la misma pregunta Y = basta que se cumpla una; sobre preguntas distintas = todas.
- Si una pregunta queda oculta, su respuesta no se guarda y no cuenta para otras reglas.
- También funciona el formato "salto": `pregunta_id` + `respuesta` + `siguiente_pregunta_id`.

## Seguridad recomendada

La *anon key* va dentro de la app (es pública por diseño). Lo que protege tus datos son las políticas
**RLS** de Supabase. El archivo `supabase/02_seguridad_rls_recomendada.sql` deja que cada promotor vea y
modifique solo lo suyo (y que solo pueda marcar clientes como visitados, no editarlos). Léelo, ajusta los
nombres de columnas si hace falta y ejecútalo en el *SQL Editor*. Fue probado en PostgreSQL.

## Desarrollo local

Requisitos: Node.js 22 o superior.

```bash
npm install
cp .env.example .env.local   # y completa VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173
```

| Comando | Para qué |
| --- | --- |
| `npm run build` | Revisión de tipos + versión de producción en `dist/` |
| `npm test` | Pruebas (reglas de preguntas, distancias, formatos) |
| `npm run lint` | Revisión de código |

La ubicación del navegador solo funciona en `https://` o en `localhost`.

## Tecnología

El color de la marca (rojo) se cambia en `src/index.css`, en la escala `--color-brand-*` (600 es el principal).

React 19 + TypeScript, Vite, Tailwind CSS, TanStack Query, Supabase JS y
[MapLibre GL](https://maplibre.org/) con mapas de [OpenFreeMap](https://openfreemap.org/)
(gratis, sin API key ni tarjeta de crédito). Puedes cambiar el estilo del mapa con `VITE_MAP_STYLE_URL`.

```
src/
  config/schema.ts     ← nombres de tablas y columnas (lo único que podrías necesitar editar)
  config/app.ts        ← radio de visita, estilo del mapa, etc.
  data/                ← lectura y escritura en Supabase
  lib/                 ← reglas de preguntas, distancias, detección del esquema
  pages/               ← pantallas
  components/          ← componentes de interfaz y mapa
supabase/              ← scripts SQL de apoyo
```

Recomendaciones de mejora: [docs/recomendaciones.md](docs/recomendaciones.md).
