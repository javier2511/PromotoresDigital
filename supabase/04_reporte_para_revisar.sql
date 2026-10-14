-- =============================================================================
-- REPORTE PARA REVISAR LA APP (solo lectura, no cambia nada)
--
-- Supabase → SQL Editor → New query → pega TODO esto → Run.
-- Sale una sola celda ("reporte"): ábrela, copia todo su contenido y compártelo.
--
-- Incluye:
--   · Estructura de tus tablas: columnas, tipo, si son obligatorias y su valor por defecto.
--   · Restricciones (check, llaves foráneas), listas de valores (enum), triggers y políticas RLS.
--   · Las preguntas y las reglas de preguntas_reglas (configuración del formulario).
--   · Las últimas 3 visitas y 12 respuestas, para ver cómo las guardaba FlutterFlow.
-- NO incluye la tabla de clientes ni la de usuarios.
-- Si no quieres compartir las visitas/respuestas, borra sus dos líneas en "candidatas".
-- =============================================================================
with
candidatas(clave, nombre, prioridad, consulta) as (values
  ('preguntas', 'preguntas', 1, 'select * from public.%I limit 400'),
  ('preguntas', 'pregunta', 2, 'select * from public.%I limit 400'),
  ('preguntas', 'preguntas_visita', 3, 'select * from public.%I limit 400'),
  ('preguntas', 'cuestionario', 4, 'select * from public.%I limit 400'),
  ('reglas', 'preguntas_reglas', 1, 'select * from public.%I limit 600'),
  ('reglas', 'reglas_preguntas', 2, 'select * from public.%I limit 600'),
  ('reglas', 'reglas', 3, 'select * from public.%I limit 600'),
  ('visitas', 'visitas', 1, 'select * from public.%I order by 1 desc limit 3'),
  ('respuestas', 'respuestas', 1, 'select * from public.%I order by 1 desc limit 12')
),
encontradas as (
  select distinct on (clave) clave, nombre, consulta
  from candidatas
  where to_regclass(format('public.%I', nombre)) is not null
  order by clave, prioridad
),
muestras as (
  -- query_to_xml permite leer una tabla cuyo nombre se decide arriba sin fallar si no existe.
  select
    clave,
    nombre,
    replace(replace(replace(
      substring(
        query_to_xml(format('select json_agg(t)::text as j from (' || consulta || ') t', nombre), true, true, '')::text
        from '<j>(.*)</j>'
      ),
      '&lt;', '<'), '&gt;', '>'), '&amp;', '&')::json as filas
  from encontradas
)
select json_build_object(
  'tablas', (
    select json_agg(
      json_build_object(
        'tabla', t.table_name,
        'rls_activo', (
          select c.relrowsecurity
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = t.table_name
        ),
        'columnas', (
          select json_agg(
            json_build_object(
              'columna', col.column_name,
              'tipo', case when col.data_type = 'USER-DEFINED' then col.udt_name else col.data_type end,
              'obligatoria', col.is_nullable = 'NO',
              'por_defecto', col.column_default,
              'identidad', col.is_identity = 'YES',
              'generada', col.is_generated = 'ALWAYS'
            )
            order by col.ordinal_position
          )
          from information_schema.columns col
          where col.table_schema = 'public' and col.table_name = t.table_name
        )
      )
      order by t.table_name
    )
    from information_schema.tables t
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
  ),
  'restricciones', (
    select json_agg(
      json_build_object('tabla', rel.relname, 'nombre', con.conname, 'definicion', pg_get_constraintdef(con.oid))
      order by rel.relname, con.conname
    )
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and con.contype in ('c', 'f', 'u')
  ),
  'listas_de_valores', (
    select json_agg(
      json_build_object(
        'tipo', ty.typname,
        'valores', (select json_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = ty.oid)
      )
    )
    from pg_type ty
    join pg_namespace n on n.oid = ty.typnamespace
    where ty.typtype = 'e' and n.nspname = 'public'
  ),
  'triggers', (
    select json_agg(
      json_build_object(
        'tabla', tr.event_object_table,
        'trigger', tr.trigger_name,
        'momento', tr.action_timing,
        'evento', tr.event_manipulation,
        'accion', tr.action_statement
      )
    )
    from information_schema.triggers tr
    where tr.trigger_schema = 'public'
  ),
  'politicas_rls', (
    select json_agg(
      json_build_object(
        'tabla', p.tablename,
        'politica', p.policyname,
        'operacion', p.cmd,
        'roles', p.roles,
        'condicion', p.qual,
        'condicion_escritura', p.with_check
      )
      order by p.tablename, p.policyname
    )
    from pg_policies p
    where p.schemaname = 'public'
  ),
  'datos', (select json_object_agg(clave, json_build_object('tabla', nombre, 'filas', filas)) from muestras)
) as reporte;
