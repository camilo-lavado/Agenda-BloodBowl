-- ============================================================
--  Tasting Blood VI · Contactos
--  Pega TODO esto en Supabase -> SQL Editor -> New query -> Run
-- ============================================================

create table if not exists public.coaches (
  id           text primary key,
  team_name    text not null,
  fumbbl_coach text not null,
  real_name    text,
  whatsapp     text,
  notes        text,
  updated_at   timestamptz not null default now()
);

-- Mantener updated_at al día en cada UPDATE
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coaches_touch on public.coaches;
create trigger coaches_touch
  before update on public.coaches
  for each row execute function public.touch_updated_at();

-- ---------- Row Level Security: acceso público (sin login) ----------
alter table public.coaches enable row level security;

drop policy if exists "coaches public read"   on public.coaches;
drop policy if exists "coaches public insert" on public.coaches;
drop policy if exists "coaches public update" on public.coaches;

create policy "coaches public read"
  on public.coaches for select
  to anon, authenticated
  using (true);

create policy "coaches public insert"
  on public.coaches for insert
  to anon, authenticated
  with check (true);

create policy "coaches public update"
  on public.coaches for update
  to anon, authenticated
  using (true) with check (true);
-- (no hay policy de DELETE: nadie puede borrar filas)

-- ---------- Semilla: miembros del torneo ----------
insert into public.coaches (id, team_name, fumbbl_coach) values
  ('boumboumboum',              'Boumboumboum',                    'ManestBB'),
  ('limari-zigurratz',          'limari zigurratz',                'Benjagomez'),
  ('la-orden-del-santo-pernil', 'La orden del Santo Pernil',       'kroszover'),
  ('necrotasting',              'NecroTasting',                    'Varadal'),
  ('a-tut-voyage',              'A Tut Voyage',                    'Virtuh4'),
  ('goblins-sea-shanties',      'Goblins Sea Shanties',            'FlySweater'),
  ('caballeros-de-dol-amroth',  'Caballeros de Dol Amroth',        'Yerkoacc'),
  ('defensores-de-ulthuan',     'Defensores de Ulthuan [TB]',      'Kanekiiiiiiiiiiii'),
  ('les-chevaliers',            'Les Chevaliers dl Derniere Aube', 'Kross'),
  ('olor-a-pescao',             'Olor a Pescao [Tasting VI]',      'Nogardo'),
  ('desert-eagles',             'Desert_Eagles',                   'Diegochea'),
  ('alianza-mafiosa',           'Alianza Mafiosa (Liga)',          'CESARGORAS'),
  ('dead-drunks',               'Dead Drunks (torneo)',            'BarbarellaTheConqueror'),
  ('red-corsairs',              'Red Corsairs Tasting 2026',       'Erevan002')
on conflict (id) do nothing;
