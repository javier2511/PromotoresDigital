-- =============================================================================
-- 17. USUARIOS DESACTIVADOS (promotores.activo = false)
--
-- Con activo = false el usuario ya no puede entrar a la app ni modificar registros. No se borra nada: sus
-- visitas, respuestas, asignaciones y jornadas se quedan como están.
--
--   · Al poner activo = false su cuenta queda bloqueada en Supabase Auth (no puede iniciar sesión) y se cierran
--     sus sesiones abiertas. Al volver a poner activo = true se desbloquea y entra con su misma contraseña.
--   · Un usuario desactivado no puede insertar, cambiar ni borrar filas de las tablas de la app, aunque todavía
--     tuviera la app abierta.
--   · Los administradores sí pueden seguir editando todo (también las filas de los desactivados), y lo que hagas
--     en el SQL Editor o en el Table Editor no se bloquea.
--
-- Al ejecutarlo también bloquea a quienes hoy ya tienen activo = false (la consulta del final los lista).
-- Se puede ejecutar más de una vez. Supabase → SQL Editor → New query → pega esto → Run.
-- =============================================================================

-- 1. Bloquear o desbloquear la cuenta cuando cambia "activo".
create or replace function public.pd_sincronizar_activo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.activo is false then
      -- Como "Ban user" en Supabase: no puede iniciar sesión. Y se cierran sus sesiones abiertas.
      update auth.users set banned_until = now() + interval '100 years' where id = new.id_promotor;
      delete from auth.sessions where user_id = new.id_promotor;
    elsif tg_op = 'UPDATE' and old.activo is false then
      update auth.users set banned_until = null where id = new.id_promotor;
    end if;
  exception when others then
    -- Si Supabase no deja tocar Auth, el cambio de "activo" se guarda igual (la app y el punto 2 siguen bloqueando).
    raise warning 'No se pudo actualizar la cuenta en Supabase Auth: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists pd_sincronizar_activo on public.promotores;
create trigger pd_sincronizar_activo
  after insert or update of activo on public.promotores
  for each row execute function public.pd_sincronizar_activo();

-- 2. Un usuario desactivado no puede modificar registros.
create or replace function public.pd_bloquear_inactivos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and exists (select 1 from public.promotores p where p.id_promotor = auth.uid() and p.activo is false) then
    raise exception 'Tu usuario está desactivado. Habla con tu administrador.';
  end if;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['visitas', 'respuestas', 'asignaciones', 'clientes', 'jornadas', 'promotores'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists pd_bloquear_inactivos on public.%I', t);
      execute format(
        'create trigger pd_bloquear_inactivos before insert or update or delete on public.%I '
        || 'for each statement execute function public.pd_bloquear_inactivos()',
        t
      );
    end if;
  end loop;
end $$;

-- 3. Quienes hoy ya tienen activo = false.
do $$
begin
  update auth.users u
  set banned_until = now() + interval '100 years'
  from public.promotores p
  where p.id_promotor = u.id
    and p.activo is false
    and (u.banned_until is null or u.banned_until < now());
  delete from auth.sessions s
  using public.promotores p
  where s.user_id = p.id_promotor and p.activo is false;
exception when others then
  raise warning 'No se pudo bloquear en Supabase Auth a los usuarios ya desactivados: %', sqlerrm;
end $$;

-- Usuarios desactivados:
select p.correo, p.nombre, p.rol, u.banned_until is not null as bloqueado
from public.promotores p
join auth.users u on u.id = p.id_promotor
where p.activo is false
order by p.correo;
