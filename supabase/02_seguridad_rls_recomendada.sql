-- =============================================================================
-- SEGURIDAD RECOMENDADA (RLS) — OPCIONAL, REVÍSALO ANTES DE EJECUTAR
--
-- Por qué: la "anon key" de Supabase es pública (va dentro de la app web). Sin RLS,
-- cualquiera que la tenga podría leer o modificar TODAS tus tablas. Con estas políticas
-- cada promotor solo ve sus clientes, sus visitas y sus resultados, y no puede
-- modificar la información que tú cargas.
--
-- Supone estos nombres (los de la configuración por defecto de la app):
--   clientes.user_id   = id del usuario en Supabase Auth (uuid)
--   visitas.user_id    = id del usuario que hizo la visita (uuid)
--   respuestas.visita_id → visitas.id
--   resultados.user_id = id del usuario (uuid)
--   clientes.visitado  = columna que marca al cliente como visitado
-- Si tus columnas se llaman distinto, reemplázalas antes de ejecutar.
-- Si en vez del uuid guardas el correo, usa (select auth.jwt() ->> 'email') en lugar de (select auth.uid()).
--
-- Importante:
--  * Tú (desde el panel de Supabase / SQL Editor) no te ves afectado: el panel ignora RLS.
--  * Si ya tienes políticas que permiten todo (por ejemplo "Enable all for authenticated"),
--    esas siguen dando acceso total: revísalas con 01_ver_estructura.sql y bórralas.
--  * Afecta también a la app de FlutterFlow si sigue en uso (con las mismas reglas).
--  * Puedes ejecutarlo varias veces: primero borra las políticas con estos mismos nombres.
-- =============================================================================

-- 1) Activar RLS en las tablas de la app
alter table public.clientes enable row level security;
alter table public.preguntas enable row level security;
alter table public.preguntas_reglas enable row level security;
alter table public.visitas enable row level security;
alter table public.respuestas enable row level security;
alter table public.resultados enable row level security;

-- 2) Clientes: cada promotor ve solo los suyos y solo puede marcarlos como visitados
drop policy if exists "pd_clientes_ver_propios" on public.clientes;
create policy "pd_clientes_ver_propios" on public.clientes
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "pd_clientes_marcar_visitado" on public.clientes;
create policy "pd_clientes_marcar_visitado" on public.clientes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- La única columna que el promotor puede cambiar es "visitado" (no nombre, dirección, ubicación…)
revoke insert, update, delete on public.clientes from anon, authenticated;
grant update (visitado) on public.clientes to authenticated;

-- 3) Preguntas y reglas: solo lectura para usuarios con sesión
drop policy if exists "pd_preguntas_leer" on public.preguntas;
create policy "pd_preguntas_leer" on public.preguntas
  for select to authenticated using (true);
revoke insert, update, delete on public.preguntas from anon, authenticated;

drop policy if exists "pd_reglas_leer" on public.preguntas_reglas;
create policy "pd_reglas_leer" on public.preguntas_reglas
  for select to authenticated using (true);
revoke insert, update, delete on public.preguntas_reglas from anon, authenticated;

-- 4) Visitas: cada promotor registra y ve solo las suyas
drop policy if exists "pd_visitas_registrar" on public.visitas;
create policy "pd_visitas_registrar" on public.visitas
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "pd_visitas_ver_propias" on public.visitas;
create policy "pd_visitas_ver_propias" on public.visitas
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Permite a la app deshacer una visita si falló el guardado de sus respuestas
drop policy if exists "pd_visitas_borrar_propias" on public.visitas;
create policy "pd_visitas_borrar_propias" on public.visitas
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 5) Respuestas: solo para visitas propias
drop policy if exists "pd_respuestas_registrar" on public.respuestas;
create policy "pd_respuestas_registrar" on public.respuestas
  for insert to authenticated
  with check (
    exists (select 1 from public.visitas v where v.id = visita_id and v.user_id = (select auth.uid()))
  );

drop policy if exists "pd_respuestas_ver_propias" on public.respuestas;
create policy "pd_respuestas_ver_propias" on public.respuestas
  for select to authenticated
  using (
    exists (select 1 from public.visitas v where v.id = visita_id and v.user_id = (select auth.uid()))
  );

-- 6) Resultados: cada promotor ve solo los suyos (tú los cargas desde el panel)
drop policy if exists "pd_resultados_ver_propios" on public.resultados;
create policy "pd_resultados_ver_propios" on public.resultados
  for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.resultados from anon, authenticated;

-- 7) Índices para que estas reglas y las consultas de la app sean rápidas
create index if not exists clientes_user_id_idx on public.clientes (user_id);
create index if not exists visitas_user_id_idx on public.visitas (user_id);
create index if not exists respuestas_visita_id_idx on public.respuestas (visita_id);
create index if not exists resultados_user_id_idx on public.resultados (user_id);
