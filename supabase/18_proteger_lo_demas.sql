-- =============================================================================
-- 18. PROTEGER LO QUE QUEDA "UNRESTRICTED" (tablas y vistas)
--
-- 1. promotores: vuelve a activar su seguridad por filas con sus políticas (las de supabase/10 y 14). La app sigue
--    igual: cada quien lee su fila, el admin todas y el líder las de su región; desde la app nadie puede cambiarse
--    el rol, la región ni "activo" (solo nombre y ubicación).
-- 2. Cualquier otra tabla sin seguridad por filas (p. ej. saldos_…): se activa, sin políticas. La app no las usa;
--    con la llave pública ya no se pueden leer. Tú las sigues viendo y editando en el Table Editor y el SQL Editor,
--    y Power BI conectado directo a la base (usuario postgres) también.
-- 3. Vistas (v_…): pasan a respetar los permisos de quien las consulta (security_invoker). Sin sesión ya no
--    muestran nada; en el SQL Editor y en Power BI conectado directo se ven igual que hoy.
--
-- ANTES DE EJECUTARLO: igual que con el 15, si algo externo (Power BI, una hoja de cálculo u otro sistema) lee
-- estas tablas o vistas con la llave "anon" (la pública), dejaría de ver los datos.
-- Para deshacerlo, por tabla o vista:
--   alter table public.<tabla> disable row level security;
--   alter view public.<vista> set (security_invoker = false);
--
-- Requiere supabase/10_admin_jornadas.sql. Se puede ejecutar más de una vez.
-- Supabase → SQL Editor → New query → pega esto → Run.
-- =============================================================================
do $$
declare
  r record;
  editables text;
begin
  -- 1. promotores, con sus políticas.
  if to_regclass('public.promotores') is not null then
    if to_regprocedure('public.es_admin()') is null then
      raise exception 'Primero ejecuta supabase/10_admin_jornadas.sql (crea la función es_admin).';
    end if;
    revoke all on public.promotores from anon;
    grant select, insert on public.promotores to authenticated;
    -- Desde la app solo se pueden cambiar el nombre y la ubicación de la propia fila.
    revoke update on public.promotores from authenticated;
    select string_agg(quote_ident(column_name), ', ') into editables
    from information_schema.columns
    where table_schema = 'public' and table_name = 'promotores'
      and column_name in ('nombre', 'latitud', 'longitud', 'ubicacion');
    if editables is not null then
      execute format('grant update (%s) on public.promotores to authenticated', editables);
    end if;

    drop policy if exists "pd_promotores_leer" on public.promotores;
    create policy "pd_promotores_leer" on public.promotores
      for select to authenticated using (id_promotor = auth.uid() or public.es_admin());
    drop policy if exists "pd_promotores_registrarse" on public.promotores;
    create policy "pd_promotores_registrarse" on public.promotores
      for insert to authenticated
      with check (id_promotor = auth.uid() and coalesce(rol, 'promotor') = 'promotor');
    drop policy if exists "pd_promotores_actualizar" on public.promotores;
    create policy "pd_promotores_actualizar" on public.promotores
      for update to authenticated using (id_promotor = auth.uid()) with check (id_promotor = auth.uid());
    if to_regprocedure('public.region_lider()') is not null then
      drop policy if exists "pd_promotores_lider_leer" on public.promotores;
      create policy "pd_promotores_lider_leer" on public.promotores
        for select to authenticated using (lower(trim(region)) = (select public.region_lider()));
    end if;
    alter table public.promotores enable row level security;
  end if;

  -- 2. Las demás tablas sin seguridad por filas.
  for r in
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;

  -- 3. Vistas: con los permisos de quien las consulta.
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' loop
    begin
      execute format('alter view public.%I set (security_invoker = true)', r.relname);
    exception when others then
      raise warning 'No se pudo cambiar la vista %: %', r.relname, sqlerrm;
    end;
  end loop;
end $$;

-- Cómo quedó (protegida = true en todas):
select c.relname as nombre,
       case c.relkind when 'v' then 'vista' else 'tabla' end as tipo,
       case
         when c.relkind = 'v' then coalesce(array_to_string(c.reloptions, ',') ~ 'security_invoker=(true|on|1)', false)
         else c.relrowsecurity
       end as protegida
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v')
order by tipo, nombre;
