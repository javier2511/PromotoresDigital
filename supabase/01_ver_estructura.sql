-- =============================================================================
-- VER LA ESTRUCTURA DE TU BASE DE DATOS (solo lectura, no cambia nada)
--
-- Supabase → SQL Editor → New query → pega esto → Run.
-- Copia el resultado (columna "estructura") si necesitas ajustar el mapeo de la app
-- (src/config/schema.ts) o compartirlo para que lo ajusten por ti.
-- No incluye datos de tus clientes: solo nombres de tablas, columnas, tipos y políticas.
-- =============================================================================
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
              'tipo', col.data_type,
              'acepta_nulos', col.is_nullable,
              'valor_por_defecto', col.column_default
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
  )
) as estructura;
