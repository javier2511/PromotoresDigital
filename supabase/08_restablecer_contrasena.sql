-- =============================================================================
-- RESTABLECER CONTRASEÑA DESDE LA PANTALLA DE INICIO (contraseña temporal)
--
-- En "¿Olvidaste tu contraseña?" el promotor escribe su correo y acepta; su contraseña pasa a ser la
-- temporal y, al entrar con ella, la app le pide elegir una nueva. La app NO muestra la temporal: tú se la
-- comunicas al promotor por otro medio.
--
-- La contraseña temporal NO se escribe en este archivo (el código puede ser público): se guarda en Supabase,
-- cifrada, con una línea que corres tú en el SQL Editor (ver el paso 2 al final). Mientras no la definas, la
-- opción responde "Esta opción aún no está activada" y no cambia ninguna contraseña.
--
-- RIESGO ACEPTADO: no se verifica quién lo pide. Cualquiera que conozca el correo de un promotor puede
-- restablecer su contraseña (y, si además conoce la temporal, entrar antes que él). Para reducirlo:
--   · Solo funciona con cuentas que están en "promotores" como promotor activo (nunca administradores).
--   · Una vez cada 10 minutos por cuenta.
--   · Cada restablecimiento queda registrado en la tabla "restablecimientos_contrasena".
--   · Cambia la temporal de vez en cuando (paso 2) y no la escribas en archivos ni en chats.
-- Para quitar la opción en cualquier momento: ver el final del archivo.
--
-- Se puede ejecutar más de una vez (la temporal que ya definiste se conserva).
-- Supabase → SQL Editor → New query → pega esto → Run.
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

-- Ajustes privados de la app (por ahora, la contraseña temporal cifrada). Nadie los lee desde la app.
create table if not exists public.pd_configuracion (
  clave text primary key,
  valor text not null,
  actualizado_en timestamptz not null default now()
);
alter table public.pd_configuracion enable row level security;
revoke all on public.pd_configuracion from anon, authenticated;

-- Define o cambia la contraseña temporal (solo desde el SQL Editor). Se guarda cifrada.
create or replace function public.pd_definir_contrasena_temporal(p_contrasena text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(coalesce(p_contrasena, '')) < 8 then
    raise exception 'La contraseña temporal debe tener al menos 8 caracteres.';
  end if;
  insert into public.pd_configuracion (clave, valor)
  values ('contrasena_temporal', extensions.crypt(p_contrasena, extensions.gen_salt('bf')))
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
  return 'Listo: contraseña temporal guardada.';
end;
$$;
revoke all on function public.pd_definir_contrasena_temporal(text) from public, anon, authenticated;

create or replace function public.restablecer_contrasena_temporal(p_correo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_correo text := lower(trim(p_correo));
  v_temporal text;
begin
  select c.valor into v_temporal from public.pd_configuracion c where c.clave = 'contrasena_temporal';
  if v_temporal is null then
    raise exception 'Esta opción aún no está activada. Pide a tu administrador que restablezca tu contraseña.';
  end if;

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
  set encrypted_password = v_temporal,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"debe_cambiar_contrasena": true}'::jsonb,
      updated_at = now()
  where id = v_id;

  insert into public.restablecimientos_contrasena (correo, id_usuario) values (v_correo, v_id);
  return true;
end;
$$;

revoke all on function public.restablecer_contrasena_temporal(text) from public;
grant execute on function public.restablecer_contrasena_temporal(text) to anon, authenticated;

-- PASO 2 (en otra consulta, con tu contraseña en lugar del texto de ejemplo; no la guardes en ningún archivo):
--   select public.pd_definir_contrasena_temporal('escribe-aqui-la-temporal');
-- Para cambiarla después, vuelve a correr esa línea con otra.
--
-- Para ver quién ha restablecido:
-- select * from public.restablecimientos_contrasena order by creado_en desc;
-- Para ver quién todavía no ha elegido su nueva contraseña:
-- select email from auth.users where raw_user_meta_data->>'debe_cambiar_contrasena' = 'true' order by email;
-- Para quitar la opción (el botón de la app avisará que no está activada):
-- drop function if exists public.restablecer_contrasena_temporal(text);
