-- =============================================================================
-- 19. ASIGNACIONES POR PROMOTOR (pestaña Equipo → Asignaciones)
--
-- Cuenta, por promotor, sus asignaciones de un periodo (por fecha_asignada): asignadas, completadas y
-- pendientes. Las canceladas no cuentan (igual que en el avance de la app). Pendiente es todo lo que no está
-- completado: Pendiente, En proceso o Reagendada.
--   · Un admin ve a todos los promotores.
--   · Un líder, solo a los de su región (la de su fila en promotores, supabase/14).
--   · Nadie más puede usarla.
-- La base hace la cuenta y manda un renglón por promotor (no todas las filas).
--
-- Requiere supabase/10_admin_jornadas.sql y supabase/14_lideres_por_region.sql. Se puede ejecutar más de una vez.
-- Supabase → SQL Editor → New query → pega esto → Run.
-- =============================================================================
do $$
begin
  if to_regprocedure('public.es_admin()') is null then
    raise exception 'Primero ejecuta supabase/10_admin_jornadas.sql (crea la función es_admin).';
  end if;
  if to_regprocedure('public.ids_mi_region()') is null then
    raise exception 'Primero ejecuta supabase/14_lideres_por_region.sql.';
  end if;
end $$;

create or replace function public.pd_asignaciones_por_promotor(p_desde date default null, p_hasta date default null)
returns table (id_promotor text, total bigint, completadas bigint, pendientes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := coalesce(public.es_admin(), false);
begin
  if not v_admin and public.region_lider() is null then
    raise exception 'Solo un administrador o un líder puede ver las asignaciones de los promotores.';
  end if;
  return query
  select a.id_promotor::text,
         count(*),
         count(*) filter (where lower(trim(a.estatus)) in ('completada', 'completado', 'visitada', 'visitado', 'realizada', 'finalizada')),
         count(*) filter (where lower(trim(a.estatus)) not in ('completada', 'completado', 'visitada', 'visitado', 'realizada', 'finalizada'))
  from public.asignaciones a
  where lower(trim(coalesce(a.estatus, ''))) not in ('cancelada', 'cancelado')
    and (p_desde is null or a.fecha_asignada >= p_desde)
    and (p_hasta is null or a.fecha_asignada < p_hasta)
    -- El líder, solo los de su región.
    and (v_admin or a.id_promotor::text in (select public.ids_mi_region()))
  group by a.id_promotor;
end;
$$;

revoke all on function public.pd_asignaciones_por_promotor(date, date) from public, anon;
grant execute on function public.pd_asignaciones_por_promotor(date, date) to authenticated;
