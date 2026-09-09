-- ============================================================
--  Tasting Blood VI · Bloqueo de edición
--  Ejecuta DESPUÉS de schema.sql y matches.sql, en Supabase → SQL Editor → Run.
--
--  A partir de aquí NADIE puede escribir en coaches/matches directamente:
--  solo a través de las funciones save_coach() / save_match(), que exigen la
--  CLAVE DE EDICIÓN compartida. El control de "solo tu ficha / admin" se hace
--  en la web (kroszover = admin).
--
--  👉 CAMBIA 'CAMBIA-ESTA-CLAVE' por tu clave real antes de ejecutar.
--     Para cambiarla más adelante, vuelve a ejecutar solo el INSERT ... ON CONFLICT.
-- ============================================================

create extension if not exists pgcrypto;

-- Tabla privada con la clave (hasheada). Sin políticas RLS => nadie la lee.
create table if not exists public.app_secrets (
  name  text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;

insert into public.app_secrets (name, value)
values ('edit_key', crypt('CAMBIA-ESTA-CLAVE', gen_salt('bf')))
on conflict (name) do update set value = excluded.value;

-- ---------- Comprobación de clave (para dar feedback en la web) ----------
create or replace function public.check_edit_key(p_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_secrets
    where name = 'edit_key' and value = crypt(p_key, value)
  );
$$;

-- ---------- Guardar contacto ----------
create or replace function public.save_coach(
  p_key text,
  p_id text,
  p_team_name text,
  p_fumbbl_coach text,
  p_real_name text,
  p_whatsapp text,
  p_notes text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_edit_key(p_key) then
    raise exception 'clave de edición incorrecta' using errcode = '28000';
  end if;

  insert into public.coaches (id, team_name, fumbbl_coach, real_name, whatsapp, notes)
  values (p_id, p_team_name, p_fumbbl_coach, p_real_name, p_whatsapp, p_notes)
  on conflict (id) do update set
    real_name = excluded.real_name,
    whatsapp  = excluded.whatsapp,
    notes     = excluded.notes;
end;
$$;

-- ---------- Guardar partido ----------
create or replace function public.save_match(
  p_key text,
  p_id text,
  p_round text,
  p_home_id text,
  p_away_id text,
  p_home_team text,
  p_away_team text,
  p_scheduled_at timestamptz,
  p_td_home int,
  p_td_away int,
  p_cas_home int,
  p_cas_away int,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_edit_key(p_key) then
    raise exception 'clave de edición incorrecta' using errcode = '28000';
  end if;

  insert into public.matches (
    id, round, home_id, away_id, home_team, away_team,
    scheduled_at, td_home, td_away, cas_home, cas_away, note
  )
  values (
    p_id, p_round, p_home_id, p_away_id, p_home_team, p_away_team,
    p_scheduled_at, p_td_home, p_td_away, p_cas_home, p_cas_away, p_note
  )
  on conflict (id) do update set
    round        = excluded.round,
    home_id      = excluded.home_id,
    away_id      = excluded.away_id,
    home_team    = excluded.home_team,
    away_team    = excluded.away_team,
    scheduled_at = excluded.scheduled_at,
    td_home      = excluded.td_home,
    td_away      = excluded.td_away,
    cas_home     = excluded.cas_home,
    cas_away     = excluded.cas_away,
    note         = excluded.note;
end;
$$;

grant execute on function public.check_edit_key(text) to anon, authenticated;
grant execute on function public.save_coach(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.save_match(
  text, text, text, text, text, text, text, timestamptz, int, int, int, int, text
) to anon, authenticated;

-- ---------- Cerrar la escritura directa (solo lectura para anon) ----------
drop policy if exists "coaches public insert" on public.coaches;
drop policy if exists "coaches public update" on public.coaches;
drop policy if exists "matches public insert" on public.matches;
drop policy if exists "matches public update" on public.matches;
-- Las políticas de SELECT se mantienen: la web sigue leyendo todo sin clave.
