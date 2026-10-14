-- =============================================================================
-- COLUMNAS PARA VER DESDE DÓNDE SE HIZO CADA VISITA (opcional)
--
-- La app guarda en la tabla de visitas la ubicación del promotor al iniciar la visita y su
-- distancia al cliente, pero solo si esas columnas existen. Revisa en la app:
-- Perfil → Verificar conexión → Visitas. Si "Latitud", "Longitud", "Distancia" o "Precisión GPS"
-- aparecen con "—", ejecuta este script en Supabase → SQL Editor.
--
-- Solo agrega la columna que falta: si ya tienes una equivalente (p. ej. "lat" o "distancia"),
-- no crea otra. Después, en la app: Perfil → Verificar conexión → "Volver a detectar".
-- =============================================================================
do $$
declare
  faltantes text[] := array[]::text[];
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'visitas'
                 and column_name in ('latitud', 'lat', 'latitud_visita', 'latitud_inicio')) then
    alter table public.visitas add column latitud double precision;
    faltantes := array_append(faltantes, 'latitud');
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'visitas'
                 and column_name in ('longitud', 'lng', 'lon', 'longitud_visita', 'longitud_inicio')) then
    alter table public.visitas add column longitud double precision;
    faltantes := array_append(faltantes, 'longitud');
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'visitas'
                 and column_name in ('distancia', 'distancia_m', 'distancia_metros', 'metros', 'distance')) then
    alter table public.visitas add column distancia_m integer;
    faltantes := array_append(faltantes, 'distancia_m');
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'visitas'
                 and column_name in ('precision', 'precision_m', 'exactitud', 'accuracy')) then
    alter table public.visitas add column precision_m integer;
    faltantes := array_append(faltantes, 'precision_m');
  end if;
  raise notice 'Columnas agregadas a visitas: %', coalesce(nullif(array_to_string(faltantes, ', '), ''), 'ninguna (ya existían)');
end $$;

-- Ejemplo: visitas hechas a más de 100 m del cliente (ajusta los nombres si los tuyos son distintos).
-- select v.*, c.nombre
-- from public.visitas v
-- join public.clientes c on c.id = v.cliente_id
-- where v.distancia_m > 100
-- order by v.distancia_m desc;
