-- =============================================================================
-- TABLERO DE ADMINISTRADORES: LEER VISITAS, RESULTADOS Y RESPUESTAS DE TODOS LOS PROMOTORES
--
-- La pestaña "Tablero" (solo usuarios con rol 'admin' en promotores) calcula los indicadores con
-- resultados_visitas y visitas, y descarga completas resultados_visitas y respuestas.
-- Este archivo deja que un admin LEA todas las filas de esas tablas. Los promotores siguen viendo
-- solo lo suyo: para ellos no cambia nada. Nadie gana permiso de escribir.
--
-- Requiere haber ejecutado antes supabase/10_admin_jornadas.sql (función es_admin()).
-- Se puede ejecutar más de una vez. Supabase → SQL Editor → New query → pega esto → Run.
-- =============================================================================
do $$
declare
  t text;
begin
  if to_regprocedure('public.es_admin()') is null then
    raise exception 'Primero ejecuta supabase/10_admin_jornadas.sql (crea la función es_admin).';
  end if;

  foreach t in array array['resultados_visitas', 'resultado_visitas', 'visitas', 'respuestas'] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('drop policy if exists "pd_admin_leer" on public.%I', t);
      execute format(
        'create policy "pd_admin_leer" on public.%I for select to authenticated using (public.es_admin())', t);
      execute format('grant select on public.%I to authenticated', t);
    end if;
  end loop;
end $$;

-- Para revisar qué tablas tienen la seguridad por filas (RLS) activada. Las que digan false las puede
-- leer cualquiera que tenga la app, sea admin o no:
-- select relname as tabla, relrowsecurity as rls_activo from pg_class
-- where relnamespace = 'public'::regnamespace and relname in ('visitas', 'resultados_visitas', 'respuestas');
