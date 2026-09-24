// Sincroniza el torneo con FUMBBL:
//  1. Abre la página del torneo con un navegador real (FUMBBL bloquea
//     peticiones sin navegador con una protección anti-bots, "Anubis").
//  2. Lee TODAS las rondas del calendario (jugadas y por jugar).
//  3. Si hay una ronda que no está en src/data/schedule.ts, la añade ahí
//     (eso sí necesita un commit + deploy para que se vea).
//  4. Para cada partido ya cerrado (con marcador), entra a su ficha de
//     partido en FUMBBL y lee también las bajas (cas) que hizo cada equipo.
//  5. Sube a Supabase el marcador (TD) y las bajas (cas) de esos partidos.
//     Un partido cerrado en FUMBBL no cambia nunca, así que ese dato manda
//     siempre y pisa lo que hubiera antes. "Nota" y "Fecha/hora" son cosas
//     que solo existen en la web (FUMBBL no las tiene) y nunca se tocan.
//
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... node sync-fumbbl.mjs

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULE_PATH = path.join(__dirname, '..', 'src', 'data', 'schedule.ts');
const COACHES_PATH = path.join(__dirname, '..', 'src', 'data', 'coaches.ts');

const BASE_URL = 'https://fumbbl.com';
const TOURNAMENT_URL = `${BASE_URL}/p/group?op=view&group=15266&p=tournaments`;
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

// -------- FUMBBL: pasar la protección anti-bots (Anubis) --------
// Reintenta con esperas crecientes: en un runner de CI (IP de datacenter,
// CPU compartida) el reto de Anubis puede tardar bastante más que en una
// máquina normal.
async function openPastAnubis(page, url, { checkSelector, maxAttempts = 4 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (err) {
      lastErr = err;
      console.warn(`  intento ${attempt}/${maxAttempts}: goto falló (${err.message.split('\n')[0]})`);
      await page.waitForTimeout(5000 * attempt);
      continue;
    }
    if (!checkSelector) return; // páginas sin marcador conocido (fichas de partido)
    const ok = await page.locator(checkSelector).count();
    if (ok) return;
    lastErr = new Error('checkSelector no encontrado tras cargar la página');
    await page.waitForTimeout(5000 * attempt);
  }
  throw lastErr ?? new Error('No se pudo abrir ' + url);
}

// -------- FUMBBL: leer el calendario completo --------
async function fetchSchedule(page) {
  try {
    await openPastAnubis(page, TOURNAMENT_URL, { checkSelector: '.heading:has-text("Schedule")' });
  } catch (err) {
    try {
      await page.screenshot({ path: path.join(__dirname, 'debug-anubis.png'), fullPage: true });
      writeFileSync(path.join(__dirname, 'debug-anubis.html'), await page.content());
    } catch {}
    throw new Error(`No se pudo pasar la protección anti-bots de FUMBBL (Anubis): ${err.message}`);
  }

  return page.evaluate(() => {
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
        const reportHref = cell.querySelector('a[href*="p/match?id="]')?.getAttribute('href') || '';
        const idMatch = reportHref.match(/id=(\d+)/);
        current.matches.push({
          home,
          away,
          td_home: sh ? Number(sh) : null,
          td_away: sa ? Number(sa) : null,
          matchId: idMatch ? idMatch[1] : null,
        });
      });
    }
    return rounds;
  });
}

// -------- FUMBBL: bajas (cas) de un partido ya cerrado --------
// "cas" en la fila TOTALS de la tabla de un equipo = bajas que HIZO ese
// equipo en ese partido (no las que sufrió).
async function fetchCasualties(page, matchId) {
  await openPastAnubis(page, `${BASE_URL}/p/match?id=${matchId}`, {
    checkSelector: '.performancecontainer.home',
    maxAttempts: 3,
  });
  return page.evaluate(() => {
    const casOf = (side) => {
      const foot = document.querySelector(`.performancecontainer.${side} .player.foot`);
      const cell = foot?.querySelector('.cas');
      if (!cell) return null;
      const txt = cell.textContent.trim();
      return txt === '' || txt === '-' ? 0 : Number(txt);
    };
    return { cas_home: casOf('home'), cas_away: casOf('away') };
  });
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
async function supabaseGetExisting() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/matches?select=id,td_home,td_away,cas_home,cas_away`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
  );
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
      // Solo se pisan las columnas incluidas en cada objeto: "nota" y
      // "fecha/hora" no van en el payload, así que Supabase no las toca.
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

  const browser = await chromium.launch({
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage({
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: 'es-CL',
  });
  page.setDefaultNavigationTimeout(60000);
  page.setDefaultTimeout(60000);

  let scraped;
  try {
    scraped = await fetchSchedule(page);
    if (!scraped.length) throw new Error('No se extrajo ninguna ronda del calendario.');

    const existing = await supabaseGetExisting();
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

        const isClosed = m.td_home != null && m.td_away != null;
        if (!isClosed) continue;

        let cas = { cas_home: null, cas_away: null };
        if (m.matchId) {
          try {
            cas = await fetchCasualties(page, m.matchId);
          } catch (err) {
            console.warn(`⚠️  No pude leer bajas del partido ${m.matchId} (${m.home} vs ${m.away}): ${err.message}`);
          }
        }

        const id = fixtureId(key, homeId, awayId);
        const prev = existing.get(id);
        const changed =
          !prev ||
          prev.td_home !== m.td_home ||
          prev.td_away !== m.td_away ||
          (cas.cas_home != null && prev.cas_home !== cas.cas_home) ||
          (cas.cas_away != null && prev.cas_away !== cas.cas_away);

        if (changed) {
          const payload = {
            id,
            round: label,
            home_id: homeId,
            away_id: awayId,
            home_team: idToName.get(homeId) ?? m.home,
            away_team: idToName.get(awayId) ?? m.away,
            td_home: m.td_home,
            td_away: m.td_away,
          };
          // Solo se incluyen (y por lo tanto se escriben) si se pudieron leer.
          if (cas.cas_home != null) payload.cas_home = cas.cas_home;
          if (cas.cas_away != null) payload.cas_away = cas.cas_away;
          matchPayloads.push(payload);
        }
      }

      if (allMapped && pairs.length && ensureRoundInSchedule(key, label, pairs)) {
        scheduleChanged = true;
        console.log(`➕ Ronda nueva añadida a schedule.ts: ${label}`);
      }
    }

    await supabaseUpsertMatches(matchPayloads);
    if (matchPayloads.length) {
      console.log(`✅ Partidos nuevos/actualizados en Supabase: ${matchPayloads.length}`);
    } else {
      console.log('Sin resultados nuevos que subir.');
    }
    if (!scheduleChanged) console.log('Sin rondas nuevas en el calendario.');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
