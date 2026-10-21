-- =============================================================================
-- ADMINISTRADORES: VER LAS JORNADAS DE TODOS LOS PROMOTORES
--
-- Los usuarios con rol 'admin' en la tabla promotores pueden ver, en la pestaña "Equipo" de la app,
-- la hora de entrada y salida y la ubicación de la jornada de cada promotor.
--
-- Requiere haber ejecutado antes supabase/06_jornadas.sql.
--
-- También protege la tabla promotores (antes no tenía RLS): sin esto cualquier usuario podría
-- cambiarse el rol a 'admin' y ver las ubicaciones de todos. Después de ejecutarlo:
--   · Cada usuario ve solo su fila; un admin ve todas.
--   · Nadie puede cambiar su rol desde la app (solo tú, desde Supabase).
--   · Al registrarse, un usuario solo puede crear su propia fila como 'promotor'.
--   · Cada usuario puede actualizar solo su nombre y su ubicación.
-- Los cambios de rol los haces tú en Table Editor o con:
--   update public.promotores set rol = 'admin' where correo = 'correo@empresa.com';
--
-- Se puede ejecutar más de una vez. Supabase → SQL Editor → New query → pega esto → Run.
-- =============================================================================

-- ¿El usuario que hace la consulta es admin activo? (security definer: no depende de las políticas)
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.promotores p
    where p.id_promotor = auth.uid()
      and lower(coalesce(p.rol, '')) = 'admin'
      and coalesce(p.activo, true)
  );
$$;
revoke all on function public.es_admin() from public;
grant execute on function public.es_admin() to authenticated;

-- Jornadas: además de las propias (06_jornadas.sql), un admin puede leer las de todos.
drop policy if exists "pd_jornadas_admin_leer" on public.jornadas;
create policy "pd_jornadas_admin_leer" on public.jornadas
  for select to authenticated using (public.es_admin());

-- Promotores: proteger roles.
alter table public.promotores enable row level security;
revoke all on public.promotores from anon;
grant select, insert on public.promotores to authenticated;
revoke update on public.promotores from authenticated;
grant update (nombre, latitud, longitud, ubicacion) on public.promotores to authenticated;

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
