-- =============================================================================
-- RESTABLECER CONTRASEÑA DESDE LA PANTALLA DE INICIO (contraseña temporal)
--
-- En "¿Olvidaste tu contraseña?" el promotor escribe su correo y acepta; su contraseña pasa a ser
-- la temporal  coca1234  y, al entrar con ella, la app le pide elegir una nueva. La app NO muestra la
-- temporal: tú se la comunicas al promotor por otro medio. Solo vive en este archivo.
--
-- RIESGO ACEPTADO: no se verifica quién lo pide. Cualquiera que conozca el correo de un promotor puede
-- restablecer su contraseña y entrar con la temporal antes que él. Para reducirlo:
--   · Solo funciona con cuentas que están en "promotores" como promotor activo (nunca administradores).
--   · Una vez cada 10 minutos por cuenta.
--   · Cada restablecimiento queda registrado en la tabla "restablecimientos_contrasena".
-- Para quitar la opción en cualquier momento: ver el final del archivo.
--
-- Para usar otra contraseña temporal, cámbiala abajo ('coca1234') y vuelve a ejecutar el archivo.
-- Se puede ejecutar más de una vez. Supabase → SQL Editor → New query → pega esto → Run.
-- =============================================================================
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.restablecimientos_contrasena (
  id bigint generated always as identity primary key,
  correo text not null,
  id_usuario uuid not null,
  creado_en timestamptz not null default now()
);
-- Sin políticas: nadie la lee ni la escribe desde la app; solo la función de abajo.
alter table public.restablecimientos_contrasena enable row level security;

create or replace function public.restablecer_contrasena_temporal(p_correo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_correo text := lower(trim(p_correo));
begin
  select u.id into v_id
  from auth.users u
  join public.promotores p on p.id_promotor = u.id
  where lower(u.email) = v_correo
    and coalesce(p.activo, true)
    and coalesce(p.rol, 'promotor') = 'promotor'
  limit 1;

  if v_id is null then
    return false;
  end if;

  if exists (
    select 1 from public.restablecimientos_contrasena r
    where r.id_usuario = v_id and r.creado_en > now() - interval '10 minutes'
  ) then
    raise exception 'Ya se restableció hace unos minutos. Entra con la contraseña temporal o espera un poco.';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt('coca1234', extensions.gen_salt('bf')),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"debe_cambiar_contrasena": true}'::jsonb,
      updated_at = now()
  where id = v_id;

  insert into public.restablecimientos_contrasena (correo, id_usuario) values (v_correo, v_id);
  return true;
end;
$$;

revoke all on function public.restablecer_contrasena_temporal(text) from public;
grant execute on function public.restablecer_contrasena_temporal(text) to anon, authenticated;

-- Para ver quién ha restablecido:
-- select * from public.restablecimientos_contrasena order by creado_en desc;
-- Para quitar la opción (el botón de la app avisará que no está activada):
-- drop function if exists public.restablecer_contrasena_temporal(text);
