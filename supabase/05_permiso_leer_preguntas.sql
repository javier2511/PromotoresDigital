-- =============================================================================
-- PERMITIR QUE LOS PROMOTORES LEAN LAS PREGUNTAS Y SUS REGLAS
--
-- Úsalo si en "Verificar conexión" dice "No se leyó ninguna regla" (o ninguna pregunta)
-- aunque en Supabase las tablas sí tienen filas. Solo da permiso de LECTURA a usuarios
-- que iniciaron sesión; no permite modificarlas. Se puede ejecutar más de una vez.
--
-- Supabase → SQL Editor → New query → pega esto → Run.
-- Si tus tablas se llaman distinto, cambia los nombres.
-- =============================================================================
grant select on public.preguntas to authenticated;
grant select on public.preguntas_reglas to authenticated;

drop policy if exists "pd_preguntas_leer" on public.preguntas;
create policy "pd_preguntas_leer" on public.preguntas
  for select to authenticated using (true);

drop policy if exists "pd_reglas_leer" on public.preguntas_reglas;
create policy "pd_reglas_leer" on public.preguntas_reglas
  for select to authenticated using (true);
