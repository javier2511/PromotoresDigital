-- 16. Borrar usuarios creados por error (por ejemplo, todos los de un dominio de correo).
--
-- Supabase marca "Database error deleting user" cuando algo en la base sigue apuntando al usuario: sus
-- asignaciones, jornadas o visitas, u otra tabla o trigger ligado a auth.users o a promotores. Este script borra a
-- cada usuario desde la base y, si alguno no se puede, dice exactamente qué lo impide.
--
-- Cómo usarlo (SQL Editor de Supabase):
--   1. Corre solo el PASO 1 y revisa la lista: deben ser únicamente los usuarios que quieres borrar.
--   2. Corre el PASO 2: borra a cada uno (con sus asignaciones y jornadas) y muestra qué pasó con cada uno.
--      A quien ya tenga visitas no lo borra, para no perder trabajo real.
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

-- PASO 2: borrar y ver el resultado de cada usuario.
create temp table if not exists resultado_borrado (correo text, resultado text);
truncate resultado_borrado;

do $$
declare
  u record;
  n_visitas int;
  v_msg text;
  v_detalle text;
begin
  for u in select id, email from auth.users where email ilike '%@digitalk.com' order by email loop
    select count(*) into n_visitas
    from public.visitas v
    where v.id_promotor = u.id
       or v.id_asignacion in (select a.id_asignacion from public.asignaciones a where a.id_promotor = u.id);
    if n_visitas > 0 then
      insert into resultado_borrado
      values (u.email, format('No se borró: tiene %s visitas (hay que pasarlas a la cuenta correcta).', n_visitas));
      continue;
    end if;
    begin
      if to_regclass('public.jornadas') is not null then
        execute 'delete from public.jornadas where id_promotor = $1' using u.id;
      end if;
      delete from public.asignaciones where id_promotor = u.id;
      delete from auth.users where id = u.id; -- también borra su fila en promotores
      insert into resultado_borrado values (u.email, 'Borrado');
    exception when others then
      get stacked diagnostics v_msg = message_text, v_detalle = pg_exception_detail;
      insert into resultado_borrado
      values (u.email, 'No se pudo: ' || v_msg || coalesce(' / ' || nullif(v_detalle, ''), ''));
    end;
  end loop;
  if not found then
    insert into resultado_borrado values (null, 'No hay usuarios con ese dominio.');
  end if;
end $$;

select * from resultado_borrado;
