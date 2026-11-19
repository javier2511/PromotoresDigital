-- =============================================================================
-- 15. PROTEGER VISITAS Y RESULTADOS (seguridad por filas, RLS)
--
-- Las tablas visitas y resultados_visitas no tienen activada la seguridad por filas: cualquiera que tenga la
-- llave pública de la app (va dentro de la página) puede leerlas completas, aunque no haya iniciado sesión.
-- Supabase lo marca como "RLS disabled". Al activarla, la app sigue funcionando igual:
--   · Cada promotor lee, guarda y (al descartar una visita guardada a medias) borra solo sus propias visitas,
--     y lee solo sus resultados.
--   · Un admin lee todo (supabase/10 y 11); un líder, solo lo de los promotores de su región (supabase/14).
--   · Sin sesión ya no se puede leer nada de estas tablas.
--   · Se quitan dos políticas abiertas que la app no necesita:
--       "p_ins" en visitas: dejaba guardar visitas a nombre de cualquiera, incluso sin iniciar sesión. Ahora cada
--       promotor guarda solo las suyas (política "pd_propias_guardar").
--       "Prueba update asignaciones": dejaba a cualquier usuario cambiar las asignaciones de todos. Cada promotor
--       sigue cambiando las suyas, y "completar para todos" lo hace supabase/12 por su cuenta.
--
-- ANTES DE EJECUTARLO revisa quién más usa estas tablas:
--   · Power BI u otro sistema que se conecte con la llave "anon" (la pública) dejaría de ver los datos.
--     Si se conecta directo a la base (usuario postgres) o con la llave "service_role", no le afecta.
--   · Si resultados_visitas lo llena un proceso con la llave "anon" o con la sesión de un usuario, dejaría
--     de poder escribir. Si lo llenas desde el Table Editor, el SQL Editor, el usuario postgres o la llave
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
        || 'using (id_promotor::text = auth.uid()::text)', t);
      -- Admin: todas (igual que supabase/11_admin_tablero.sql).
      execute format('drop policy if exists "pd_admin_leer" on public.%I', t);
      execute format(
        'create policy "pd_admin_leer" on public.%I for select to authenticated using (public.es_admin())', t);
      -- Líder: las de su región (igual que supabase/14_lideres_por_region.sql).
      execute format('drop policy if exists "pd_lider_leer" on public.%I', t);
      execute format(
        'create policy "pd_lider_leer" on public.%I for select to authenticated '
        || 'using (id_promotor::text in (select public.ids_mi_region()))', t);
      execute format('grant select on public.%I to authenticated', t);

      if t = 'visitas' then
        -- La app guarda las visitas del propio promotor y, si descarta una guardada a medias, la borra.
        execute 'drop policy if exists "pd_propias_guardar" on public.visitas';
        execute 'create policy "pd_propias_guardar" on public.visitas for insert to authenticated '
          || 'with check (id_promotor::text = auth.uid()::text)';
        execute 'drop policy if exists "pd_propias_borrar" on public.visitas';
        execute 'create policy "pd_propias_borrar" on public.visitas for delete to authenticated '
          || 'using (id_promotor::text = auth.uid()::text)';
        execute 'grant insert, delete on public.visitas to authenticated';
      end if;

      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;

  if to_regclass('public.visitas') is not null and to_regclass('public.asignaciones') is not null then
    drop policy if exists "p_ins" on public.visitas;
    drop policy if exists "Prueba update asignaciones" on public.asignaciones;
  end if;
end $$;

-- Tablas y si tienen la seguridad por filas activada (todas deberían decir true):
select relname as tabla, relrowsecurity as rls_activo
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by 1;
