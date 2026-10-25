# Promotores Digital

Web app para promotores en campo: lista de clientes asignados, mapa con tu ubicación en tiempo real
(el punto azul, como en Google Maps), ficha de cada cliente, visita que se desbloquea al llegar al punto
de venta, formulario con preguntas condicionales y avance de visitas.

Reemplaza la versión de FlutterFlow **usando la misma base de datos de Supabase, sin cambiar tus tablas**.

## Qué hace

| Pantalla | Detalle |
| --- | --- |
| **Inicio de sesión** | Correo y contraseña de Supabase Auth. **Crear cuenta** desde la misma pantalla (nombre, correo y contraseña); la cuenta nueva aparece en tu tabla de usuarios y tú le asignas clientes. |
| **Clientes** | Avance (visitados / asignados), **jornada de hoy** (iniciar / terminar), búsqueda, filtros Pendientes · Visitados · Todos, **filtro por día de visita** (columna `dia_visita`), orden por cercanía, distancia a cada cliente y "más cercano" destacado. Al finalizar una visita el cliente sale de Pendientes. |
| **Mapa** | Pines por estado (rojo pendiente, verde visitado), agrupación cuando hay muchos, punto azul con círculo de precisión y orientación, botón "Mi ubicación", tarjeta del cliente con *Ver detalle* y *Cómo llegar*. En computadora, lista lateral + mapa. |
| **Ficha del cliente** | Mini mapa con la distancia, botones a Google Maps, Waze y llamada, y la información que tenías en FlutterFlow: saldo de puntos, status autogestión, Premia, cuponera, canal y canjes / promos / lotería / retos de los últimos 3 meses. |
| **Visita** | Se puede iniciar desde cualquier lugar. Al iniciarla se guarda la ubicación del promotor y su distancia al cliente; si está a más de `VITE_RADIO_VISITA_M` metros (100 por defecto) se le avisa a cuánto está y debe confirmar. Preguntas Sí/No, opción única, múltiple, número, fecha y texto; reglas de `preguntas_reglas`; borrador guardado en el teléfono (no se pierde si se cierra la app o se va la señal). |
| **Visita finalizada** | Avance actualizado y el siguiente cliente más cercano. |
| **Resultados** | La tabla de resultados que cargas tú, filtrada al promotor. Arriba, un resumen: clientes visitados (distintos) y cuántos tienen `digital_post_visita` en Sí, en número y porcentaje (si un cliente aparece varias veces cuenta su registro más reciente). |
| **Perfil** | Datos del usuario, estado del GPS, "Verificar conexión" (diagnóstico de tablas y columnas) y cerrar sesión (también en el encabezado de Clientes y, en computadora, en la barra lateral). |

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
6. En Supabase → **Authentication → URL Configuration** pon esa dirección en *Site URL* (los correos de
   confirmación de cuenta llevan ahí).

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

### Registro de promotores ("Crear cuenta")

En Supabase → **Authentication → Sign In / Providers**:

- **Allow new users to sign up** debe estar activado (si no, la app avisa que el registro de usuarios está
  desactivado).
- **Confirm email**: si está activado, el promotor recibe un correo y debe abrir el enlace antes de poder
  entrar. El correo que manda Supabase sin configurar SMTP propio tiene un límite de pocos correos por hora,
  así que para un equipo de promotores conviene **desactivarlo** (entran en cuanto crean su cuenta) o
  configurar tu propio SMTP en *Authentication → Emails*.

Al entrar por primera vez, la app agrega al promotor en tu tabla de usuarios (`usuarios`/`perfiles`…) con su
id, correo y nombre, como hacía el registro de FlutterFlow (si tus políticas RLS lo permiten). Después tú le
asignas clientes desde Supabase. **¿Olvidaste tu contraseña?** (requiere ejecutar `supabase/08_restablecer_contrasena.sql`): el promotor escribe
su correo, confirma, y su contraseña pasa a ser la temporal definida en ese SQL. La app no la muestra: tú se la
comunicas por otro medio. Al entrar con ella la app no lo deja seguir hasta que elija una nueva. Solo funciona con promotores activos (no con
administradores), una vez cada 10 minutos por cuenta, y cada restablecimiento queda en la tabla
`restablecimientos_contrasena`. **Riesgo aceptado:** no se verifica quién lo pide, así que cualquiera que conozca el
correo de un promotor podría restablecerlo y entrar con la temporal antes que él. Para quitar la opción:
`drop function public.restablecer_contrasena_temporal(text);` (el botón avisará que no está activada).

Lo que hace que se le pida una contraseña nueva es `debe_cambiar_contrasena: true` en su *User Metadata* (lo pone
la función del SQL 08; si restableces a mano, agrégalo tú). La contraseña temporal solo está en el SQL 08.

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
4. ¿Prefieres que lo ajusten por ti? Ejecuta `supabase/04_reporte_para_revisar.sql` en el *SQL Editor* de
   Supabase y comparte la celda `reporte` que sale. Es solo lectura: trae la estructura de tus tablas
   (columnas, tipos, cuáles son obligatorias, políticas RLS), tus preguntas y reglas, y las últimas 3 visitas
   y 12 respuestas para ver cómo las guardaba FlutterFlow. No incluye clientes ni usuarios.
   (`01_ver_estructura.sql` es la versión corta: solo nombres de tablas, columnas y políticas.)

### Cómo escribe en tu base (igual que FlutterFlow)

**Con tabla `asignaciones`** (tu caso): la lista del promotor son sus asignaciones (`id_promotor` = su usuario).
Un cliente está *pendiente* si tiene una asignación Pendiente / En proceso / Reagendada y *visitado* si su
asignación está Completada; las Canceladas no se muestran ni cuentan en el avance. Los clientes se identifican
por `id_cliente` (el texto que usan asignaciones y visitas), no por el `id` numérico.

Al finalizar una visita la app:

1. Inserta una fila en **visitas** con `id_cliente`, `id_asignacion` (la asignación pendiente), `id_promotor`,
   `hora_inicio`, `hora_fin`/`fecha_fin`, `latitud_visita`/`longitud_visita` y el check-in como lo hacía
   FlutterFlow (`checkin_realizado`, `fecha_checkin`, `latitud_checkin`, `longitud_checkin`,
   `ubicacion_checkin` y `distancia_checkin_m`, la distancia en metros al cliente).
   Además llena columnas con respuestas del formulario (lista `RESPUESTAS_EN_VISITA` en
   `src/config/schema.ts`): `visita_realizada` (= "Se realizo la visita"; `false` si la tienda no se localizó),
   `motivo_no_visita`, `usaba_app`, `entendio_beneficios_digital`, `app_instalada`, `realizo_pedido_digital`,
   `motivo_no_pedido` y `comentarios`.
2. Inserta en **respuestas** una fila por cada pregunta visible respondida (`id_visita`, `id_pregunta`, el texto
   en `pregunta` y la `respuesta`). Las Sí/No se guardan como `Si`/`No`; las de opción múltiple como texto
   separado por comas.
3. Pasa la **asignación** a `Completada`. (Sin tabla de asignaciones: marca la columna `visitado` de clientes
   o, si no existe, cuenta como visitado a todo cliente con una visita registrada.)

La primera vez que un usuario entra, si no existe en **promotores** la app agrega su fila (id, correo y
nombre); sin ella Supabase rechaza la visita porque `visitas.id_promotor` debe existir en `promotores`. Al crear
la cuenta se pide el GPS y su ubicación se guarda en `latitud`, `longitud` y `ubicacion` (texto
`LatLng(lat: …, lng: …)`, como FlutterFlow). Si en ese momento no hay GPS, se guarda en cuanto el teléfono lo
dé (si la lectura es imprecisa, como en computadora, espera hasta 20 s por una mejor y guarda la mejor que haya);
a los promotores que ya existían sin latitud/longitud también se les llena así, y si su columna `ubicacion` ya
tenía el texto de FlutterFlow, se copian esas coordenadas. En **Verificar conexión → Tus datos** se ve si la
ubicación del usuario está guardada, con un botón **Guardar ahora** que muestra el error si algo lo impide.

Si tu tabla tiene columnas obligatorias que la app no conoce (por ejemplo `hora`, `fecha`, `id_cliente`), las
llena según su nombre; si una columna es de tipo `time` envía solo la hora; y si la base rechaza un dato
opcional (un estado que no está en tu lista, por ejemplo) guarda la visita sin él antes que perderla.

Si aun así no se puede guardar, aparece la ventana **"No se pudo guardar la visita"** con la explicación y un
**Detalle técnico** (paso, tabla, código y mensaje de Supabase). El promotor puede tocar **Copiar detalle** y
mandártelo; con eso se sabe exactamente qué ajustar (casi siempre una política RLS o una columna). El último
error también se incluye en *Copiar reporte* de **Verificar conexión**.

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

### Filtro por día de visita

Si la tabla de clientes tiene la columna `dia_visita`, la lista y el mapa muestran botones *Todos los días · Lun ·
Mar · Mié…* con cuántos clientes hay cada día (el de hoy lleva un punto). Entiende "Martes", "MARTES", "Mar",
números (1 = lunes … 7 = domingo) y varios días en la misma celda, separados o pegados ("Lunes, Jueves", "L/J",
"lunesmartes"). Un cliente con varios días aparece (y cuenta) en cada uno de ellos, así que la suma de los días
puede ser mayor que el total. Los que no tienen día (o tienen un valor que no se reconoce) quedan en **Sin día**.
El día elegido se recuerda en el teléfono y vale para la lista y el mapa; el avance de arriba siempre cuenta
todos los clientes.

### Jornada del promotor (inicio y fin del día)

En **Clientes** aparece la tarjeta **Jornada de hoy**: *Iniciar jornada* guarda la hora y la ubicación (GPS) en que
empieza a trabajar y *Terminar* guarda la hora y ubicación de salida; mientras tanto muestra cuánto lleva. Se
guarda en la tabla `jornadas`, que se crea con `supabase/06_jornadas.sql` (cada promotor solo puede ver y registrar
las suyas). Mientras esa tabla no exista, la tarjeta no aparece. Al final del script hay una consulta para ver las
jornadas de todos con su duración.

### Reseteado (debajo del nombre)

Si la tabla de clientes tiene la columna `reseteado` (créala con `supabase/09_reseteado.sql`), debajo del nombre
de cada cliente se ve **Reseteado: Verdadero** o **Reseteado: Falso** (vacío cuenta como Falso) en la lista, el
detalle y el mapa. Sin esa columna se sigue mostrando la dirección.

### Administradores: pestaña Equipo

Los usuarios con `rol = 'admin'` en **promotores** ven, además de todo lo demás, la pestaña **Equipo**: para el día
que elijan (hoy por defecto) cuántos promotores iniciaron y terminaron su jornada, un mapa con dónde iniciaron, y
por cada promotor activo su hora de entrada y salida, la duración y enlaces a Google Maps con la ubicación de
entrada y de salida. Requiere `supabase/06_jornadas.sql` y `supabase/10_admin_jornadas.sql`. Este último también
protege la tabla promotores: cada usuario ve solo su fila (un admin, todas), nadie puede cambiarse el rol desde la
app y al registrarse solo se puede crear la propia fila como promotor. Para hacer admin a alguien:
`update public.promotores set rol = 'admin' where correo = 'correo@empresa.com';`

### Administradores: pestaña Tablero

Los admins también ven la pestaña **Tablero**, con los indicadores de las visitas de `resultados_visitas`.
Se filtra por promotor y por día, semana (de lunes a domingo) o mes:

| Indicador | Cómo se calcula |
|---|---|
| Visitas realizadas | Visitas distintas (`id_visita`); si una visita está cargada varias veces cuenta la fila más reciente. |
| Visitas con compra autogestionada | Visitas con `digital_post_visita` (o `digital_post_venta`) = true, y su porcentaje. |
| Visitas diarias por figura | Visitas ÷ días con visitas ÷ promotores que hicieron visitas. |
| Visitas diarias por figura con compra | Lo mismo, solo con las visitas con compra. |
| Tiempo visita | Promedio de la columna de minutos de visita (p. ej. `tiempo_visita`). |
| Tiempo visita con compra | Lo mismo, solo con las visitas con compra. |
| Tiempo nueva visita | Promedio de la columna de minutos a la siguiente visita (p. ej. `tiempo_nueva_visita`). |
| Geoeficiencia | Promedio de la columna de distancia al check-in (p. ej. `distancia_checkin`) y qué porcentaje quedó dentro del radio. |

Los minutos y la distancia se toman **tal cual** de `resultados_visitas`. Las columnas se reconocen por su nombre
(`tiempo_visita`, `minutos_visita`, `duracion`…, `tiempo_nueva_visita`, `tiempo_entre_visitas`…,
`distancia_checkin`, `distancia`…; o cualquier nombre con esas palabras) y debajo de la tabla por promotor el
tablero dice qué columna usó para cada dato. El día y la hora de cada visita se toman de la hora exacta guardada en
`visitas` (con zona horaria) y, si no se puede, de `fecha_visita`. Si alguna de esas columnas no existe, ese dato
se calcula con la tabla `visitas` (`hora_inicio` / `hora_fin` / `distancia_checkin_m`; ahí las visitas de más de
4 h y los huecos de más de 4 h no cuentan: `MAX_DURACION_VISITA_MIN` y `MAX_TIEMPO_ENTRE_VISITAS_MIN` en
`src/config/schema.ts`).

Abajo hay una gráfica de visitas por día (o por hora), una tabla por promotor y los botones para **descargar
completas** las tablas `resultados_visitas` y `respuestas` en CSV (se abren en Excel). Para que un admin lea las
de todos los promotores ejecuta `supabase/11_admin_tablero.sql` (requiere el 10).

### Información del cliente (ficha)

**Día de entrega:** ejecuta `supabase/07_dia_entrega.sql` para agregar la columna `dia_entrega` a clientes y
llénala tú (Table Editor, CSV o `update`). Aparece en la ficha como "Día de entrega"; si escribes días
("Jueves", "Lunes, Jueves", "lunesjueves") se muestran con su nombre completo y "(hoy)" cuando toca ese día.

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
- Varias reglas para la misma pregunta = basta con que se cumpla **cualquiera** (es un flujo: a la pregunta 8
  se llega desde la 4 = "Si", desde la 5 respondida, etc.).
- `*` en el valor (`valor_activador = '*'`) = cualquier respuesta.
- Si una pregunta queda oculta, su respuesta no se guarda y no cuenta para otras reglas.
- También funciona el formato "salto": `pregunta_id` + `respuesta` + `siguiente_pregunta_id`.
- La app deduce qué columna es cuál por su nombre aunque no sean los esperados (p. ej. `mostrar_pregunta` +
  `pregunta_id` + `respuesta`, o `id_pregunta` + `id_pregunta_condicion`), y la regla puede referirse a la
  pregunta por su `id`, su número/`orden`, su `codigo` o incluso su texto.

En **Perfil → Verificar conexión → Reglas de las preguntas** ves cuántas reglas leyó y aplicó, qué columna
tomó para cada parte, cómo interpretó cada regla ("Se muestra P3 si P1 = «Sí»") y cuáles no pudo usar y por
qué. Una regla también puede mostrar varias preguntas a la vez (`"3, 5"` o un arreglo `{3,5}`).

- Si dice **"No se leyó ninguna regla"** pero tu tabla sí tiene filas, falta el permiso de lectura (tu
  `preguntas_reglas` tiene RLS activo sin ninguna política): ejecuta `supabase/05_permiso_leer_preguntas.sql`
  (solo da permiso de leer las reglas).
- Si dice que se aplican 0, comparte ese reporte (*Copiar reporte*, ya incluye tus reglas y preguntas) o el de
  `04_reporte_para_revisar.sql`.

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
