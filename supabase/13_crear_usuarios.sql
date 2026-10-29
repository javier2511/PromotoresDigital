-- =============================================================================
-- CREAR USUARIOS DESDE LA APP (VARIOS A LA VEZ, CON LA CONTRASEÑA QUE TÚ ELIJAS)
--
-- En la pestaña "Equipo" → "Crear usuarios", un administrador pega de Excel las columnas Nombre, Correo y
-- Contraseña. Por cada renglón, esta función:
--   · Crea la cuenta (Supabase → Authentication → Users) con ese correo y esa contraseña, ya confirmada.
--     No se envía ningún correo, así que puede ser un correo inventado (p. ej. luis.perez@tuempresa.com).
--   · Agrega al promotor en la tabla promotores (rol 'promotor', activo). Si ya estaba en promotores con
--     ese correo y sin cuenta (por ejemplo, con asignaciones), la cuenta usa su mismo id_promotor.
--   · Si ese correo ya tenía cuenta, no la cambia (tampoco su contraseña) y responde 'ya_existe'.
-- Solo crea promotores: para hacer admin a alguien, cambia su rol en la tabla promotores, como siempre.
-- Solo la pueden usar administradores (rol 'admin' en promotores).
--
-- Requiere haber ejecutado antes supabase/10_admin_jornadas.sql (función es_admin()).
-- Se puede ejecutar más de una vez. Supabase → SQL Editor → New query → pega esto → Run.
-- Para quitar la opción: drop function if exists public.pd_crear_usuario(text, text, text, boolean);
-- =============================================================================
do $$
begin
  if to_regprocedure('public.es_admin()') is null then
    raise exception 'Primero ejecuta supabase/10_admin_jornadas.sql (crea la función es_admin).';
  end if;
end $$;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.pd_crear_usuario(
  p_correo text,
  p_nombre text,
  p_contrasena text,
  p_cambiar_contrasena boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede crear usuarios.';
  end if;
  if v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo "%" no es válido.', trim(coalesce(p_correo, ''));
  end if;
  if v_nombre = '' then
    raise exception 'Falta el nombre de %.', v_correo;
  end if;
  if length(coalesce(p_contrasena, '')) < 6 then
    raise exception 'La contraseña de % debe tener al menos 6 caracteres.', v_correo;
  end if;

  -- Ya tiene cuenta: no se toca (ni su contraseña); solo se asegura su fila en promotores.
  select u.id into v_id from auth.users u where lower(u.email) = v_correo limit 1;
  if v_id is not null then
    insert into public.promotores (id_promotor, nombre, correo, rol, activo)
    values (v_id, v_nombre, v_correo, 'promotor', true)
    on conflict (id_promotor) do nothing;
    return 'ya_existe';
  end if;

  -- Si ya estaba en promotores con ese correo y sin cuenta, la cuenta usa ese mismo id.
  select p.id_promotor into v_id
  from public.promotores p
  where lower(trim(p.correo)) = v_correo
    and not exists (select 1 from auth.users u where u.id = p.id_promotor)
  limit 1;
  v_id := coalesce(v_id, gen_random_uuid());

  -- Como las crea Supabase: confirmada, contraseña bcrypt y los textos vacíos (no nulos) que espera al entrar.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_correo,
    extensions.crypt(p_contrasena, extensions.gen_salt('bf', 10)), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('full_name', v_nombre, 'email_verified', true)
      || case when p_cambiar_contrasena then '{"debe_cambiar_contrasena": true}'::jsonb else '{}'::jsonb end,
    now(), now(), '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_correo, 'email_verified', true, 'phone_verified', false),
    'email', now(), now()
  );
  insert into public.promotores (id_promotor, nombre, correo, rol, activo)
  values (v_id, v_nombre, v_correo, 'promotor', true)
  on conflict (id_promotor) do nothing;
  return 'creado';
end;
$$;

revoke all on function public.pd_crear_usuario(text, text, text, boolean) from public, anon;
grant execute on function public.pd_crear_usuario(text, text, text, boolean) to authenticated;
