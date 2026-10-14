# Recomendaciones de mejora

Ordenadas por prioridad. Ninguna es obligatoria para que la app funcione.

## 1. Seguridad: activa RLS (alta prioridad)

La *anon key* viaja dentro de cualquier app web (también en la de FlutterFlow). Si tus tablas no tienen
políticas RLS, cualquiera que la copie puede leer todos tus clientes o borrar visitas desde fuera de la app.
`supabase/02_seguridad_rls_recomendada.sql` lo resuelve: cada promotor ve solo lo suyo, no puede editar
los datos que tú cargas y solo puede marcar clientes como visitados. También crea los índices que hacen
rápidas esas consultas. Revisa antes con `01_ver_estructura.sql` si ya tienes políticas "permitir todo".

## 2. Calidad de datos al cargar clientes

- Guarda `latitud` y `longitud` como números (`float8`), no como texto. Evita errores de lectura.
- Revisa coordenadas en `0,0`, vacías o invertidas antes de importar. La app las corrige si están
  invertidas y marca "Sin ubicación" las que faltan, pero esos clientes no se pueden visitar porque no hay
  contra qué medir la distancia. *Perfil → Verificar conexión* te dice cuántos clientes tienen ubicación.
- Asigna los clientes con el id del usuario (uuid) o con su correo; la app entiende ambos.

## 3. Guardar la visita en el servidor en un solo paso

Hoy el teléfono hace tres escrituras (visita, respuestas, marcar cliente), igual que FlutterFlow. La app
reintenta y deshace si algo falla, pero lo más sólido es una función de Postgres (`rpc`) que:

- guarde todo en **una sola transacción** (o todo o nada), y
- **calcule la distancia en el servidor** con las coordenadas del cliente. Hoy la calcula el teléfono y se
  guarda con la visita (junto con la ubicación y la precisión del GPS); alguien con conocimientos técnicos
  podría enviar otros valores llamando la API directamente, y en Android existen apps de "GPS falso".
  Revisa de vez en cuando las visitas con distancias grandes o precisión muy baja.

Si quieres este paso, comparte el resultado de `01_ver_estructura.sql` y se escribe a la medida.

## 4. Ciclos de visita sin perder historial

Si reasignas clientes cada semana o mes, en lugar de regresar `visitado` a `false` a mano, agrega a
`clientes` (o a una tabla de asignaciones) un `periodo` o fechas de inicio/fin. Así conservas el historial
completo y el avance se calcula por periodo. Una restricción `unique (cliente_id, periodo)` en `visitas`
evita visitas duplicadas.

## 5. Funciones que suman mucho sin afectar el rendimiento

- **Foto de evidencia**: Supabase Storage (1 GB gratis). Comprimiendo en el teléfono a ~200 KB por foto
  caben miles de visitas.
- **Envío automático sin señal**: hoy el borrador ya se guarda en el teléfono; el siguiente paso es poner la
  visita finalizada en cola y enviarla sola al recuperar conexión.
- **Cuestionario por tipo de cliente**: una columna `canal` o `segmento` en `preguntas` para mostrar
  preguntas distintas según el cliente.
- **Panel de supervisor**: una pantalla con el avance de todos los promotores (requiere un rol de
  administrador en RLS). Hoy lo consultas desde el panel de Supabase.
- **Ruta sugerida del día**: ordenar pendientes por recorrido más corto (se calcula en el teléfono).

## 6. Planes gratuitos: lo que conviene saber

- **Supabase Free** pausa el proyecto tras 7 días sin actividad (se reactiva desde el panel) y no ofrece
  respaldos descargables: exporta tus tablas a CSV de vez en cuando.
- **Vercel Hobby** es solo para uso personal no comercial; para tu trabajo usa **Cloudflare Pages** (gratis,
  sin esa restricción). Ver README.
- **OpenFreeMap** (mapas) es gratuito y sin límites, pero es un servicio comunitario sin garantía. Si algún
  día falla, cambia `VITE_MAP_STYLE_URL` por otro proveedor compatible con MapLibre (p. ej. MapTiler o
  Stadia Maps; revisa sus condiciones para uso comercial) sin tocar código.

## Qué se hizo para el rendimiento

- FlutterFlow web descarga varios MB (el motor de Flutter) antes de mostrar algo. Esta app descarga
  ~220 KB comprimidos la primera vez; el mapa (~430 KB) solo cuando se abre, y todo queda en caché del
  teléfono entre versiones (solo se vuelve a bajar lo que cambió).
- Lista, mapa y ficha comparten la misma consulta de clientes (no se repite) y los datos se guardan en
  caché.
- El GPS se pausa cuando la app queda en segundo plano (ahorra batería) y la lista no se redibuja por
  cambios de centímetros en la ubicación.
- El mapa dibuja los puntos con la tarjeta gráfica (agrupados cuando hay muchos), fluido aun con cientos
  de clientes.
