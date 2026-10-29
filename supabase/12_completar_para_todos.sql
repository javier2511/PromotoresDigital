-- =============================================================================
-- UN CLIENTE CON VARIOS PROMOTORES: SI UNO LO VISITA, QUEDA COMPLETADO PARA TODOS
--
-- En asignaciones cada fila es un promotor con un cliente. Con esto, cuando la asignación de un promotor
-- pasa a 'Completada' (desde esta app, desde FlutterFlow o a mano en Supabase), las asignaciones de los
-- demás promotores con ese mismo cliente y de la misma semana (de lunes a domingo, según fecha_asignada)
-- también pasan a 'Completada'.
--
-- No se tocan: las Canceladas, las de otras semanas (pasadas o futuras) ni las que ya estaban Completadas.
-- Solo cambia el estatus de la asignación: la visita (visitas, respuestas, resultados_visitas y el Tablero)
-- sigue contando solo para el promotor que la hizo.
--
-- Al final corrige también la semana en curso: si un cliente ya se completó esta semana, las asignaciones
-- de los demás promotores con ese cliente pasan a 'Completada' (y se listan como resultado). Las semanas
-- anteriores se quedan como están.
--
-- Se puede ejecutar más de una vez. Supabase → SQL Editor → New query → pega esto → Run.
-- Para quitarlo: drop trigger if exists pd_completar_para_todos on public.asignaciones;
-- =============================================================================

-- security definer: cambia también las filas de los otros promotores (las políticas de asignaciones solo
-- dejan a cada promotor cambiar las suyas).
create or replace function public.pd_completar_para_todos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lunes date;
begin
  lunes := new.fecha_asignada - (extract(isodow from new.fecha_asignada)::int - 1);
  update public.asignaciones a
     set estatus = new.estatus
   where a.id_cliente = new.id_cliente
     and a.fecha_asignada between lunes and lunes + 6
     and lower(trim(a.estatus)) not in ('completada', 'cancelada');
  return null;
end;
$$;
-- Solo la usa el trigger: nadie la puede llamar desde la app.
revoke all on function public.pd_completar_para_todos() from public, anon, authenticated;

-- Solo cuando pasa a Completada (si ya lo estaba y se vuelve a guardar, no hace nada).
create or replace trigger pd_completar_para_todos
  after update of estatus on public.asignaciones
  for each row
  when (lower(trim(new.estatus)) = 'completada' and lower(trim(old.estatus)) is distinct from 'completada')
  execute function public.pd_completar_para_todos();

-- Semana en curso (hora de México): lo que ya se había completado antes de instalar esto.
update public.asignaciones a
   set estatus = 'Completada'
  from (
    select hoy - (extract(isodow from hoy)::int - 1) as lunes
      from (select (now() at time zone 'America/Mexico_City')::date as hoy) h
  ) s
 where a.fecha_asignada between s.lunes and s.lunes + 6
   and lower(trim(a.estatus)) not in ('completada', 'cancelada')
   and exists (
     select 1 from public.asignaciones b
      where b.id_cliente = a.id_cliente
        and b.fecha_asignada between s.lunes and s.lunes + 6
        and lower(trim(b.estatus)) = 'completada'
   )
returning a.id_asignacion, a.id_cliente, a.id_promotor, a.fecha_asignada, a.estatus;
