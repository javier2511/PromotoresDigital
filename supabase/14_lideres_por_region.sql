-- =============================================================================
-- REGIONES Y LÍDERES
--
-- 1) Agrega la columna "region" a promotores. Llénala tú en Table Editor o desde la app
--    (Equipo → Crear usuarios, con una columna Región).
-- 2) Nuevo tipo de usuario: rol 'lider' (o 'líder'). Un líder activo ve en la app las pestañas Tablero y
--    Resultados, pero solo con los promotores de SU región (mismo texto en "region", sin importar mayúsculas
--    ni espacios). No ve Equipo ni puede crear usuarios. Si no tiene región, no ve a nadie.
--    Los administradores (rol 'admin') siguen igual: ven todo y crean usuarios.
-- 3) Permisos de lectura del líder en la base: las filas de promotores, respuestas, visitas y
--    resultados_visitas de los promotores de su región. Nadie gana permiso de escribir.
--    OJO: visitas y resultados_visitas todavía no tienen activada la seguridad por filas (RLS); mientras no la
--    tengan, la app le muestra al líder solo su región, pero la base no lo impide. Para que la base también
--    lo impida, ejecuta después supabase/15_proteger_visitas.sql (lee su aviso antes).
-- 4) Función para que un admin asigne la región desde la app (Crear usuarios).
--
-- Para hacer líder a alguien (o cambiarle la región):
--   update public.promotores set rol = 'lider', region = 'Norte' where correo = 'correo@empresa.com';
-- Para ver quién es líder:  select nombre, correo, rol, region from public.promotores where rol ilike 'l%der';
--
-- Requiere haber ejecutado antes supabase/10_admin_jornadas.sql. Se puede ejecutar más de una vez.
-- Supabase → SQL Editor → New query → pega esto → Run.
-- =============================================================================
do $$
begin
  if to_regprocedure('public.es_admin()') is null then
    raise exception 'Primero ejecuta supabase/10_admin_jornadas.sql (crea la función es_admin).';
  end if;
end $$;

alter table public.promotores add column if not exists region text;

-- Región del usuario que consulta, si es líder activo (en minúsculas y sin espacios a los lados); si no, null.
-- security definer: no depende de las políticas de promotores.
create or replace function public.region_lider()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(lower(trim(p.region)), '')
  from public.promotores p
  where p.id_promotor = auth.uid()
    and lower(trim(coalesce(p.rol, ''))) in ('lider', 'líder')
    and coalesce(p.activo, true)
  limit 1;
$$;
revoke all on function public.region_lider() from public, anon;
grant execute on function public.region_lider() to authenticated;

-- Ids (como texto) de los promotores de la región del líder que consulta. Vacío si no es líder.
create or replace function public.ids_mi_region()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select p.id_promotor::text
  from public.promotores p
  where lower(trim(p.region)) = (select public.region_lider());
$$;
revoke all on function public.ids_mi_region() from public, anon;
grant execute on function public.ids_mi_region() to authenticated;

-- Promotores: además de su propia fila (10_admin_jornadas.sql), el líder ve las de su región.
drop policy if exists "pd_promotores_lider_leer" on public.promotores;
create policy "pd_promotores_lider_leer" on public.promotores
  for select to authenticated
  using (lower(trim(region)) = (select public.region_lider()));

-- Visitas y resultados de los promotores de su región (la base lo aplica cuando la tabla tiene RLS activo).
do $$
declare
  t text;
begin
  foreach t in array array['visitas', 'resultados_visitas', 'resultado_visitas'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'id_promotor'
    ) then
      execute format('drop policy if exists "pd_lider_leer" on public.%I', t);
      execute format(
        'create policy "pd_lider_leer" on public.%I for select to authenticated '
        'using (id_promotor::text in (select public.ids_mi_region()))', t);
      execute format('grant select on public.%I to authenticated', t);
    end if;
  end loop;
end $$;

-- Respuestas de las visitas de los promotores de su región.
drop policy if exists "pd_lider_leer" on public.respuestas;
create policy "pd_lider_leer" on public.respuestas
  for select to authenticated
  using (exists (
    select 1 from public.visitas v
    where v.id_visita = respuestas.id_visita
      and v.id_promotor::text in (select public.ids_mi_region())
  ));

-- Un admin asigna la región de un promotor por su correo (Crear usuarios). Devuelve false si no existe.
create or replace function public.pd_asignar_region(p_correo text, p_region text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_filas int;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede asignar regiones.';
  end if;
  if trim(coalesce(p_correo, '')) = '' then
    return false;
  end if;
  update public.promotores
     set region = nullif(trim(coalesce(p_region, '')), '')
   where lower(trim(correo)) = lower(trim(coalesce(p_correo, '')));
  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;
revoke all on function public.pd_asignar_region(text, text) from public, anon;
grant execute on function public.pd_asignar_region(text, text) to authenticated;
