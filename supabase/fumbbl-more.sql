-- Tasting Blood VI · Brutalistas + clasificación copiada de FUMBBL
-- Ejecuta en Supabase -> SQL Editor -> Run (una sola vez).

alter table public.matches add column if not exists bashers jsonb;

create table if not exists public.fumbbl_standings (
  team_id     text primary key,
  position    smallint not null,
  games       smallint,
  wins        smallint,
  draws       smallint,
  losses      smallint,
  td_for      smallint,
  td_against  smallint,
  cas_for     smallint,
  cas_against smallint,
  score       integer,
  score_delta integer,
  updated_at  timestamptz not null default now()
);
alter table public.fumbbl_standings enable row level security;
drop policy if exists "fs read" on public.fumbbl_standings;
drop policy if exists "fs insert" on public.fumbbl_standings;
drop policy if exists "fs update" on public.fumbbl_standings;
create policy "fs read" on public.fumbbl_standings for select to anon, authenticated using (true);
create policy "fs insert" on public.fumbbl_standings for insert to anon, authenticated with check (true);
create policy "fs update" on public.fumbbl_standings for update to anon, authenticated using (true) with check (true);
