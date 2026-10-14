-- =============================================================================
-- PERMITIR QUE LOS PROMOTORES LEAN LAS REGLAS DE LAS PREGUNTAS
--
-- Tu tabla preguntas_reglas tiene RLS activo pero ninguna política de lectura, así que para
-- los promotores aparece vacía y el formulario muestra todas las preguntas.
-- Esto solo da permiso de LECTURA a usuarios que iniciaron sesión; no permite modificarla.
-- Se puede ejecutar más de una vez.
--
-- Supabase → SQL Editor → New query → pega esto → Run.
-- =============================================================================
grant select on public.preguntas_reglas to authenticated;

drop policy if exists "pd_reglas_leer" on public.preguntas_reglas;
create policy "pd_reglas_leer" on public.preguntas_reglas
  for select to authenticated using (true);

-- Si tampoco se leyeran las preguntas, quita los guiones de estas líneas y vuelve a ejecutar:
-- grant select on public.preguntas to authenticated;
-- drop policy if exists "pd_preguntas_leer" on public.preguntas;
-- create policy "pd_preguntas_leer" on public.preguntas for select to authenticated using (activa = true);
