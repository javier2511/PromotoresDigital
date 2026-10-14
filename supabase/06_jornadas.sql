-- =============================================================================
-- JORNADA DEL PROMOTOR: INICIO Y FIN DEL DÍA (check-in / check-out)
--
-- Crea la tabla "jornadas" donde la app guarda a qué hora y en qué lugar cada promotor
-- inicia y termina su jornada. Cada promotor solo puede ver y registrar las suyas.
-- Se puede ejecutar más de una vez (no borra datos).
--
-- Supabase → SQL Editor → New query → pega esto → Run.
-- =============================================================================
create table if not exists public.jornadas (
  id_jornada bigint generated always as identity primary key,
  id_promotor uuid not null default auth.uid() references public.promotores (id_promotor),
  fecha date not null default (now() at time zone 'America/Mexico_City')::date,
  hora_inicio timestamptz not null default now(),
  hora_fin timestamptz,
  latitud_inicio double precision,
  longitud_inicio double precision,
  precision_inicio_m integer,
  latitud_fin double precision,
  longitud_fin double precision,
  precision_fin_m integer,
  created_at timestamptz not null default now()
);

create index if not exists jornadas_promotor_fecha_idx on public.jornadas (id_promotor, fecha);

alter table public.jornadas enable row level security;
grant select, insert, update on public.jornadas to authenticated;

drop policy if exists "pd_jornadas_leer" on public.jornadas;
create policy "pd_jornadas_leer" on public.jornadas
  for select to authenticated using (id_promotor = auth.uid());

drop policy if exists "pd_jornadas_insertar" on public.jornadas;
create policy "pd_jornadas_insertar" on public.jornadas
  for insert to authenticated with check (id_promotor = auth.uid());

drop policy if exists "pd_jornadas_actualizar" on public.jornadas;
create policy "pd_jornadas_actualizar" on public.jornadas
  for update to authenticated using (id_promotor = auth.uid()) with check (id_promotor = auth.uid());

-- Para revisarlas (como administrador, en el SQL Editor):
-- select p.nombre, j.fecha, j.hora_inicio, j.hora_fin, j.hora_fin - j.hora_inicio as duracion,
--        j.latitud_inicio, j.longitud_inicio, j.latitud_fin, j.longitud_fin
-- from public.jornadas j
-- join public.promotores p using (id_promotor)
-- order by j.fecha desc, p.nombre;
