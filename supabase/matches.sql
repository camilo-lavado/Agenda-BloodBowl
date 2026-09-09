-- ============================================================
--  Tasting Blood VI · Partidos (fecha/hora + resultado)
--  Ejecuta esto DESPUÉS de schema.sql, en Supabase -> SQL Editor -> Run
-- ============================================================

create table if not exists public.matches (
  id           text primary key,   -- p.ej. "r1__a-tut-voyage__goblins-sea-shanties"
  round        text not null,      -- etiqueta legible, p.ej. "Ronda 1"
  home_id      text not null,
  away_id      text not null,
  home_team    text not null,
  away_team    text not null,
  scheduled_at timestamptz,        -- fecha y hora acordada
  td_home      smallint,
  td_away      smallint,
  cas_home     smallint,
  cas_away     smallint,
  note         text,
  updated_at   timestamptz not null default now()
);

-- Reutiliza la función touch_updated_at() creada en schema.sql
-- (si ejecutas este archivo solo, esta línea la crea igualmente).
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists matches_touch on public.matches;
create trigger matches_touch
  before update on public.matches
  for each row execute function public.touch_updated_at();

-- ---------- Row Level Security: acceso público (sin login) ----------
alter table public.matches enable row level security;

drop policy if exists "matches public read"   on public.matches;
drop policy if exists "matches public insert" on public.matches;
drop policy if exists "matches public update" on public.matches;

create policy "matches public read"
  on public.matches for select
  to anon, authenticated
  using (true);

create policy "matches public insert"
  on public.matches for insert
  to anon, authenticated
  with check (true);

create policy "matches public update"
  on public.matches for update
  to anon, authenticated
  using (true) with check (true);
