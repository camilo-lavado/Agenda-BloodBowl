-- ============================================================
--  Tasting Blood VI · Completions (pases) de FUMBBL
--  Ejecuta en Supabase -> SQL Editor -> Run (una sola vez).
--
--  Agrega comp_home/comp_away a "matches": pases completados por cada
--  equipo en el partido (fila TOTALS -> columna "comp"), para el
--  ranking "Más pasador".
-- ============================================================

alter table public.matches
  add column if not exists comp_home smallint,
  add column if not exists comp_away smallint;
