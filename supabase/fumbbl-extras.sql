-- ============================================================
--  Tasting Blood VI · Extras de FUMBBL
--  Ejecuta en Supabase -> SQL Editor -> Run (una sola vez).
--
--  Agrega columnas a "matches" para lo que el sincronizador
--  (automation/sync-fumbbl.mjs) ahora también lee de cada partido:
--   - mvp_home / mvp_away: jugador nombrado MVP por cada equipo.
--   - played_at: cuándo quedó registrado el partido en FUMBBL (distinto
--     de scheduled_at, que es cuándo se acordó jugarlo por WhatsApp).
--   - fumbbl_match_id: id numérico del partido en FUMBBL, para linkear
--     directo a su ficha ("Ver en FUMBBL").
--   - casualties: lista de bajas nombradas del partido
--     (jugador + equipo + qué le pasó: Dead (RIP), Seriously Hurt (MNG)...).
-- ============================================================

alter table public.matches
  add column if not exists mvp_home text,
  add column if not exists mvp_away text,
  add column if not exists played_at timestamptz,
  add column if not exists fumbbl_match_id text,
  add column if not exists casualties jsonb;

-- Sin cambios de RLS: las políticas de coaches/matches ya existentes
-- (lectura pública + escritura pública en matches) cubren las columnas
-- nuevas igual que las viejas.
