-- =============================================================================
-- COLUMNA "RESETEADO" EN CLIENTES
--
-- La app muestra debajo del nombre de cada cliente "Reseteado: Verdadero" o "Reseteado: Falso"
-- según esta columna. Empieza en Falso para todos; tú la cambias a verdadero.
-- Si ya existe (con este nombre), no hace nada. Se puede ejecutar más de una vez.
--
-- Supabase → SQL Editor → New query → pega esto → Run.
-- =============================================================================
alter table public.clientes add column if not exists reseteado boolean not null default false;

-- Ejemplos para marcarlo:
-- update public.clientes set reseteado = true where id_cliente = '120070912';
-- update public.clientes set reseteado = true where id_cliente in ('120070912', '120317437');
