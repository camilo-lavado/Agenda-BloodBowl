// Sincroniza el torneo con FUMBBL:
//  1. Abre la página del torneo con un navegador real (FUMBBL bloquea
//     peticiones sin navegador con una protección anti-bots, "Anubis").
//  2. Lee TODAS las rondas del calendario (jugadas y por jugar).
//  3. Si hay una ronda que no está en src/data/schedule.ts, la añade ahí
//     (eso sí necesita un commit + deploy para que se vea).
//  4. Sube a Supabase los resultados (TD) que falten o hayan cambiado,
//     sin tocar nunca las bajas/nota/fecha que la gente ya haya escrito
//     a mano (esos campos no van en el payload -> Supabase no los toca).
//
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... node sync-fumbbl.mjs

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULE_PATH = path.join(__dirname, '..', 'src', 'data', 'schedule.ts');
const COACHES_PATH = path.join(__dirname, '..', 'src', 'data', 'coaches.ts');

const TOURNAMENT_URL = 'https://fumbbl.com/p/group?op=view&group=15266&p=tournaments';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY en el entorno.');
  process.exit(1);
}

// -------- coaches.ts: id <-> team_name (una sola fuente de verdad) --------
function loadCoachNameToId() {
  const src = readFileSync(COACHES_PATH, 'utf8');
  const re = /id:\s*'([^']+)'\s*,\s*team_name:\s*'([^']+)'/g;
  const map = new Map();
  let m;
  while ((m = re.exec(src))) map.set(m[2], m[1]);
  if (!map.size) throw new Error('No se pudo leer coaches.ts (¿cambió el formato?)');
  return map;
}

function invert(map) {
  return new Map([...map].map(([name, id]) => [id, name]));
}

// -------- FUMBBL: leer el calendario completo con un navegador real --------
async function fetchSchedule() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: UA });
  try {
    await page.goto(TOURNAMENT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    let hasSchedule = await page.locator('.heading', { hasText: 'Schedule' }).count();
    if (!hasSchedule) {
      // Anubis (protección anti-bots) resuelve su reto solo tras unos segundos.
      await page.waitForTimeout(7000);
      await page.goto(TOURNAMENT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      hasSchedule = await page.locator('.heading', { hasText: 'Schedule' }).count();
    }
    if (!hasSchedule) {
      throw new Error('No se pudo pasar la protección anti-bots de FUMBBL (Anubis).');
    }

    return await page.evaluate(() => {
      const headings = [...document.querySelectorAll('.heading')];
      const scheduleHeading = headings.find((e) => e.textContent.trim() === 'Schedule');
      const table = scheduleHeading?.nextElementSibling;
      if (!table || table.tagName !== 'TABLE') return [];

      const rounds = [];
      let current = null;
      for (const tr of table.querySelectorAll('tr')) {
        const roundDiv = tr.querySelector('td[colspan] div');
        if (roundDiv && /^Round\s+\d+/i.test(roundDiv.textContent.trim())) {
          current = { label: roundDiv.textContent.trim(), matches: [] };
          rounds.push(current);
          continue;
        }
        if (!current) continue;
        tr.querySelectorAll('.matchCell').forEach((cell) => {
          const home = cell.querySelector('.team.home a')?.textContent.trim();
          const away = cell.querySelector('.team.away a')?.textContent.trim();
          if (!home || !away) return;
          const sh = cell.querySelector('.score.home')?.textContent.trim();
          const sa = cell.querySelector('.score.away')?.textContent.trim();
          current.matches.push({
            home,
            away,
            td_home: sh ? Number(sh) : null,
            td_away: sa ? Number(sa) : null,
          });
        });
      }
      return rounds;
    });
  } finally {
    await browser.close();
  }
}

// FUMBBL a veces trunca nombres largos en la celda del calendario
// (p.ej. "Les Chevaliers dl Derniere Aub" sin la "e" final). Si no hay
// coincidencia exacta, se prueba por prefijo.
function resolveTeamId(name, nameToId) {
  if (nameToId.has(name)) return nameToId.get(name);
  for (const [fullName, id] of nameToId) {
    if (fullName.startsWith(name) || name.startsWith(fullName)) return id;
  }
  return null;
}

function roundKeyFromLabel(label) {
  const m = label.match(/(\d+)/);
  return m ? `r${m[1]}` : null;
}

function fixtureId(roundKey, a, b) {
  return `${roundKey}__${[a, b].sort().join('__')}`;
}

// -------- schedule.ts: añade una ronda nueva si no está --------
function ensureRoundInSchedule(key, label, pairs) {
  const src = readFileSync(SCHEDULE_PATH, 'utf8');
  if (src.includes(`key: '${key}'`)) return false; // ya está

  const marker = 'export const currentRound = rounds[rounds.length - 1];';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('No encontré el marcador esperado en schedule.ts');
  const before = src.slice(0, idx);
  const closeIdx = before.lastIndexOf('];');
  if (closeIdx === -1) throw new Error('No encontré el cierre de "rounds" en schedule.ts');

  const pairsLines = pairs.map(([a, b]) => `      ['${a}', '${b}'],`).join('\n');
  const block =
    `  {\n` +
    `    key: '${key}',\n` +
    `    label: '${label}',\n` +
    `    pairs: [\n${pairsLines}\n    ],\n` +
    `  },\n`;

  writeFileSync(SCHEDULE_PATH, src.slice(0, closeIdx) + block + src.slice(closeIdx));
  return true;
}

// -------- Supabase --------
async function supabaseGetExistingScores() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/matches?select=id,td_home,td_away`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET falló: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return new Map(rows.map((r) => [r.id, r]));
}

async function supabaseUpsertMatches(payloads) {
  if (!payloads.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/matches`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      // Solo se pisan las columnas incluidas en cada objeto: bajas/nota/fecha
      // puestas a mano en la web NO se tocan.
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(payloads),
  });
  if (!res.ok) throw new Error(`Supabase upsert falló: ${res.status} ${await res.text()}`);
}

// -------- main --------
async function main() {
  const nameToId = loadCoachNameToId();
  const idToName = invert(nameToId);
  const scraped = await fetchSchedule();
  if (!scraped.length) {
    console.error('No se extrajo ninguna ronda del calendario; no se escribe nada.');
    process.exit(1);
  }

  const existing = await supabaseGetExistingScores();
  const matchPayloads = [];
  let scheduleChanged = false;

  for (const round of scraped) {
    const key = roundKeyFromLabel(round.label);
    if (!key) continue;
    const label = `Ronda ${key.slice(1)}`;

    const pairs = [];
    let allMapped = true;
    for (const m of round.matches) {
      const homeId = resolveTeamId(m.home, nameToId);
      const awayId = resolveTeamId(m.away, nameToId);
      if (!homeId || !awayId) {
        console.warn(`⚠️  Equipo sin mapear en ${round.label}: "${m.home}" vs "${m.away}"`);
        allMapped = false;
        continue;
      }
      pairs.push([homeId, awayId]);

      if (m.td_home != null && m.td_away != null) {
        const id = fixtureId(key, homeId, awayId);
        const prev = existing.get(id);
        if (!prev || prev.td_home !== m.td_home || prev.td_away !== m.td_away) {
          matchPayloads.push({
            id,
            round: label,
            home_id: homeId,
            away_id: awayId,
            home_team: idToName.get(homeId) ?? m.home,
            away_team: idToName.get(awayId) ?? m.away,
            td_home: m.td_home,
            td_away: m.td_away,
          });
        }
      }
    }

    if (allMapped && pairs.length && ensureRoundInSchedule(key, label, pairs)) {
      scheduleChanged = true;
      console.log(`➕ Ronda nueva añadida a schedule.ts: ${label}`);
    }
  }

  await supabaseUpsertMatches(matchPayloads);
  if (matchPayloads.length) {
    console.log(`✅ Resultados nuevos/actualizados en Supabase: ${matchPayloads.length}`);
  } else {
    console.log('Sin resultados nuevos que subir.');
  }
  if (!scheduleChanged) console.log('Sin rondas nuevas en el calendario.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
