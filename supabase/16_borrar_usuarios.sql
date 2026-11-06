-- 16. Borrar usuarios creados por error (por ejemplo, todos los de un dominio de correo).
--
-- Por qué Supabase marca "Database error deleting user": al borrar un usuario también se borra su fila en
-- promotores, pero la base no deja borrar un promotor que todavía tiene asignaciones (o jornadas o visitas)
-- ligadas. Este script borra primero esas filas y luego al usuario.
--
-- Cómo usarlo (SQL Editor de Supabase):
--   1. Corre solo el PASO 1 y revisa la lista: deben ser únicamente los usuarios que quieres borrar.
--   2. Corre el PASO 2. Si alguno ya tiene visitas no borra nada y te avisa (para no perder trabajo real).
-- Para otro dominio, cambia '%@digitalk.com' en los dos pasos.

-- PASO 1: ver quiénes son y qué tienen ligado (no borra nada).
select u.email,
       p.nombre,
       p.rol,
       (select count(*) from public.asignaciones a where a.id_promotor = u.id) as asignaciones,
       (select count(*) from public.visitas v where v.id_promotor = u.id) as visitas,
       u.last_sign_in_at as ultimo_ingreso
from auth.users u
left join public.promotores p on p.id_promotor = u.id
where u.email ilike '%@digitalk.com'
order by u.email;

-- PASO 2: borrar.
do $$
declare
  ids uuid[];
  n_visitas int;
  n_usuarios int;
begin
  select array_agg(id) into ids from auth.users where email ilike '%@digitalk.com';
  if ids is null then
    raise exception 'No hay usuarios con ese dominio: no se borró nada.';
  end if;

  -- Visitas de estos usuarios (o ligadas a sus asignaciones): si hay, no se borra nada.
  select count(*) into n_visitas
  from public.visitas v
  where v.id_promotor = any (ids)
     or v.id_asignacion in (select a.id_asignacion from public.asignaciones a where a.id_promotor = any (ids));
  if n_visitas > 0 then
    raise exception 'Estos usuarios tienen % visitas registradas. No se borró nada: hay que pasarlas a la cuenta correcta primero.', n_visitas;
  end if;

  -- Jornadas (solo si existe la tabla de supabase/06_jornadas.sql).
  if to_regclass('public.jornadas') is not null then
    execute 'delete from public.jornadas where id_promotor = any ($1)' using ids;
  end if;
  delete from public.asignaciones where id_promotor = any (ids);
  delete from public.promotores where id_promotor = any (ids);
  delete from auth.users where id = any (ids);
  get diagnostics n_usuarios = row_count;
  raise notice 'Usuarios borrados: %', n_usuarios;
end $$;

-- Para comprobar: debe salir 0.
select count(*) as quedan from auth.users where email ilike '%@digitalk.com';
