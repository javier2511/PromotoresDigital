-- =============================================================================
-- PROTEGER VISITAS Y RESULTADOS (seguridad por filas, RLS)
--
-- Hoy las tablas visitas y resultados_visitas no tienen activada la seguridad por filas: cualquiera que tenga
-- la llave pública de la app (va dentro de la página) puede leerlas completas, aunque no haya iniciado
-- sesión. Al activarla:
--   · Cada promotor lee solo sus propias visitas y resultados (como ya pasa con respuestas).
--   · Un admin lee todo (supabase/10 y 11); un líder, solo lo de los promotores de su región (supabase/14).
--   · Las visitas se siguen guardando y actualizando igual que ahora (no se tocan esas políticas).
--
-- ANTES DE EJECUTARLO revisa quién más usa estas tablas:
--   · Power BI u otro sistema que se conecte con la llave "anon" (la pública) dejaría de ver los datos.
--     Si se conecta directo a la base (usuario postgres) o con la llave "service_role", no le afecta.
--   · Si resultados_visitas lo llena un proceso con la llave "anon" o con la sesión de un usuario, dejaría
--     de poder escribir. Si lo llenas con el SQL Editor, con el usuario postgres o con la llave
--     "service_role", no le afecta.
-- Para deshacerlo en cualquier momento:
--   alter table public.visitas disable row level security;
--   alter table public.resultados_visitas disable row level security;
--
-- Requiere supabase/10_admin_jornadas.sql y supabase/14_lideres_por_region.sql. Se puede ejecutar más de una vez.
-- Supabase → SQL Editor → New query → pega esto → Run.
-- =============================================================================
do $$
declare
  t text;
begin
  if to_regprocedure('public.es_admin()') is null then
    raise exception 'Primero ejecuta supabase/10_admin_jornadas.sql (crea la función es_admin).';
  end if;
  if to_regprocedure('public.ids_mi_region()') is null then
    raise exception 'Primero ejecuta supabase/14_lideres_por_region.sql.';
  end if;

  foreach t in array array['visitas', 'resultados_visitas', 'resultado_visitas'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'id_promotor'
    ) then
      -- Cada promotor, las suyas.
      execute format('drop policy if exists "pd_propias_leer" on public.%I', t);
      execute format(
        'create policy "pd_propias_leer" on public.%I for select to authenticated '
        'using (id_promotor::text = auth.uid()::text)', t);
      -- Admin: todas (igual que supabase/11_admin_tablero.sql).
      execute format('drop policy if exists "pd_admin_leer" on public.%I', t);
      execute format(
        'create policy "pd_admin_leer" on public.%I for select to authenticated using (public.es_admin())', t);
      -- Líder: las de su región (igual que supabase/14_lideres_por_region.sql).
      execute format('drop policy if exists "pd_lider_leer" on public.%I', t);
      execute format(
        'create policy "pd_lider_leer" on public.%I for select to authenticated '
        'using (id_promotor::text in (select public.ids_mi_region()))', t);
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- Para revisar qué tablas tienen la seguridad por filas activada (true = protegida):
-- select relname as tabla, relrowsecurity as rls_activo from pg_class
-- where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;
