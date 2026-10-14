-- =============================================================================
-- DÍA DE ENTREGA DEL CLIENTE
--
-- Agrega la columna "dia_entrega" a la tabla clientes. La app la muestra en la ficha del cliente
-- (Información del cliente → Día de entrega) para que el promotor lo sepa.
-- Puedes escribir el día como quieras: "Jueves", "Lunes, Jueves", "lunesjueves", "Mar"…
-- Se puede ejecutar más de una vez.
--
-- Supabase → SQL Editor → New query → pega esto → Run.
-- =============================================================================
alter table public.clientes add column if not exists dia_entrega text;

-- Ejemplos para llenarla (o hazlo desde Table Editor / importando un CSV):
-- update public.clientes set dia_entrega = 'Jueves' where id_cliente = '120070912';
-- update public.clientes set dia_entrega = 'Lunes, Jueves' where ruta = 'R-12';
