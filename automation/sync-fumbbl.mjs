// Sincroniza el torneo con FUMBBL:
//  1. Abre la página del torneo con un navegador real (FUMBBL bloquea
//     peticiones sin navegador con una protección anti-bots, "Anubis").
//  2. Lee TODAS las rondas del calendario (jugadas y por jugar).
//  3. Si hay una ronda que no está en src/data/schedule.ts, la añade ahí
//     (eso sí necesita un commit + deploy para que se vea).
//  4. Para cada partido ya cerrado (con marcador), entra a su ficha de
//     partido en FUMBBL y lee bajas (cas), MVP de cada lado, la lista de
//     jugadores muertos/heridos graves y cuándo se jugó de verdad.
//  5. Sube todo eso a Supabase (marcador, bajas, mvp, bajas nombradas,
//     fecha jugada, id de partido de FUMBBL). Un partido cerrado en FUMBBL
//     no cambia nunca, así que ese dato manda siempre y pisa lo que hubiera
//     antes. "Nota" y "Fecha/hora agendada" son cosas que solo existen en
//     la web (FUMBBL no las tiene) y esas nunca se tocan.
//
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... node sync-fumbbl.mjs
// (o deja un archivo automation/.env con esas dos líneas y corre "node sync-fumbbl.mjs" a secas;
//  útil para una tarea programada local, donde no hay un shell con variables de entorno).

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULE_PATH = path.join(__dirname, '..', 'src', 'data', 'schedule.ts');
const COACHES_PATH = path.join(__dirname, '..', 'src', 'data', 'coaches.ts');
const ENV_PATH = path.join(__dirname, '.env');

// Carga automation/.env si existe (sin dependencias externas). No pisa
// variables que ya vengan puestas en el entorno (GitHub Actions, por ejemplo).
function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = (m[2] ?? '').trim();
    if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv(ENV_PATH);

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

// -------- FUMBBL: detalle de un partido ya cerrado --------
// "cas" en la fila TOTALS de la tabla de un equipo = bajas que HIZO ese
// equipo en ese partido (no las que sufrió). "mvp"=1 en la fila de un
// jugador = ese equipo lo nombró su MVP. Las líneas "#N Jugador – Estado"
// (Dead (RIP), Seriously Hurt (MNG), etc.) son texto suelto dentro del
// bloque de cada equipo, no elementos aparte.
async function fetchMatchDetails(page, matchId, homeId, awayId) {
  await openPastAnubis(page, `${BASE_URL}/p/match?id=${matchId}`, {
    checkSelector: '.performancecontainer.home',
    maxAttempts: 3,
  });
  return page.evaluate(
    ({ homeId, awayId }) => {
      const statOf = (side, cls) => {
        const foot = document.querySelector(`.performancecontainer.${side} .player.foot`);
        const cell = foot?.querySelector(`.${cls}`);
        if (!cell) return null;
        const txt = cell.textContent.trim();
        return txt === '' || txt === '-' ? 0 : Number(txt);
      };
      const casOf = (side) => statOf(side, 'cas');
      const compOf = (side) => statOf(side, 'comp');
      const mvpOf = (side) => {
        const container = document.querySelector(`.performancecontainer.${side}`);
        if (!container) return null;
        const rows = [...container.querySelectorAll('.player')].filter(
          (r) => !r.classList.contains('foot') && !r.classList.contains('head'),
        );
        for (const row of rows) {
          if (row.querySelector('.mvp')?.textContent.trim() === '1') {
            return row.querySelector('.name')?.textContent.trim() || null;
          }
        }
        return null;
      };
      const casualtiesOf = (side, teamId) => {
        // Las líneas "#N Jugador – Estado" son texto suelto dentro de
        // .homeperf/.awayperf (el contenedor GRANDE), no dentro del
        // .performancecontainer más chico que está anidado adentro.
        const container = document.querySelector(`.${side}perf`);
        if (!container || !teamId) return [];
        const out = [];
        const re = /#\d+\s+([^–<]+?)\s*–\s*([^<]+)/g;
        let m;
        while ((m = re.exec(container.innerHTML))) {
          out.push({ team_id: teamId, player: m[1].trim(), outcome: m[2].trim() });
        }
        return out;
      };
      // Jugadores que causaron bajas (celda .cas de cada fila de jugador).
      const bashersOf = (side, teamId) => {
        const container = document.querySelector(`.performancecontainer.${side}`);
        if (!container || !teamId) return [];
        const out = [];
        for (const row of container.querySelectorAll('.player')) {
          if (row.classList.contains('foot') || row.classList.contains('head')) continue;
          const txt = row.querySelector('.cas')?.textContent.trim();
          const n = txt && txt !== '-' ? Number(txt) : 0;
          if (n > 0) {
            out.push({ team_id: teamId, player: row.querySelector('.name')?.textContent.trim() || '?', cas: n });
          }
        }
        return out;
      };
      const timeEl = [...document.querySelectorAll('.time')].find((e) =>
        /Match recorded on/i.test(e.textContent || ''),
      );
      const dateMatch = (timeEl?.textContent || '').match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
      // Hora de servidor de FUMBBL; se asume UTC (no hay forma de confirmar
      // el huso exacto). Es un dato secundario, no afecta resultado/bajas.
      const played_at = dateMatch ? dateMatch[1].replace(' ', 'T') + 'Z' : null;

      return {
        cas_home: casOf('home'),
        cas_away: casOf('away'),
        comp_home: compOf('home'),
        comp_away: compOf('away'),
        mvp_home: mvpOf('home'),
        mvp_away: mvpOf('away'),
        casualties: [...casualtiesOf('home', homeId), ...casualtiesOf('away', awayId)],
        bashers: [...bashersOf('home', homeId), ...bashersOf('away', awayId)],
        played_at,
      };
    },
    { homeId, awayId },
  );
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
// -------- FUMBBL: clasificación oficial (Tournament Members) --------
// Se copia tal cual para no depender de recalcularla (FUMBBL cuenta las
// bajas con otra definición y los totales no coinciden).
async function fetchStandings(page) {
  return page.evaluate(() => {
    const h = [...document.querySelectorAll('.heading')].find((e) =>
      /Tournament Members/i.test(e.textContent || ''),
    );
    const box = h?.nextElementSibling;
    if (!box) return [];
    const pair = (t) => {
      const m = (t || '').match(/(-?\d+)\s*\/\s*(-?\d+)/);
      return m ? [Number(m[1]), Number(m[2])] : [null, null];
    };
    const rows = [];
    for (const tr of box.querySelectorAll('tr')) {
      const cells = [...tr.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
      const teamA = tr.querySelector('a[href*="/p/team"]');
      if (!teamA) continue;
      // Tras equipo y coach: PJ, V/E/D, TD, Cas, puntaje, delta (en ese orden)
      const rest = cells.filter((_, i) => i >= 0);
      const wdl = rest.find((t) => /^\d+\s*\/\s*\d+\s*\/\s*\d+$/.test(t));
      const idx = rest.indexOf(wdl);
      if (!wdl) continue;
      const [w, d, l] = wdl.split('/').map((x) => Number(x.trim()));
      const [tdf, tda] = pair(rest[idx + 1]);
      const [casf, casa] = pair(rest[idx + 2]);
      rows.push({
        team: teamA.textContent.trim(),
        games: Number(rest[idx - 1]),
        wins: w, draws: d, losses: l,
        td_for: tdf, td_against: tda,
        cas_for: casf, cas_against: casa,
        score: parseInt((rest[idx + 3] || '').replace(/[^\d-]/g, ''), 10),
        score_delta: parseInt((rest[idx + 4] || '').replace(/[^\d-]/g, ''), 10),
        raw: cells,
      });
    }
    return rows;
  });
}

async function supabaseUpsertStandings(rows) {
  if (!rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fumbbl_standings?on_conflict=team_id`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase standings ${res.status}: ${await res.text()}`);
}

async function supabaseGetExisting() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/matches?select=id,td_home,td_away,cas_home,cas_away,comp_home,comp_away,mvp_home,mvp_away,played_at,fumbbl_match_id,casualties,bashers`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
  );
  if (!res.ok) throw new Error(`Supabase GET falló: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return new Map(rows.map((r) => [r.id, r]));
}

// PostgREST exige que, en un upsert por lote, TODOS los objetos tengan
// exactamente las mismas claves. Como cada partido puede traer un set
// distinto de columnas (según qué se haya podido leer), se agrupan por
// firma de claves y se manda un POST por grupo en vez de uno solo.
async function supabaseUpsertMatches(payloads) {
  if (!payloads.length) return;
  const groups = new Map();
  for (const p of payloads) {
    const sig = Object.keys(p).sort().join(',');
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(p);
  }
  for (const group of groups.values()) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/matches`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        // Solo se pisan las columnas incluidas en cada objeto: "nota" y
        // "fecha/hora agendada" no van en el payload, así que Supabase no las toca.
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(group),
    });
    if (!res.ok) throw new Error(`Supabase upsert falló: ${res.status} ${await res.text()}`);
  }
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

    // Clasificación oficial (la página del torneo sigue abierta)
    try {
      const st = await fetchStandings(page);
      const stRows = [];
      st.forEach((r, i) => {
        const id = resolveTeamId(r.team, nameToId);
        if (!id) return console.warn(`  clasificación: equipo sin mapear "${r.team}"`);
        const { team, raw, ...rest } = r;
        stRows.push({ team_id: id, position: i + 1, ...rest, updated_at: new Date().toISOString() });
      });
      if (stRows.length) {
        await supabaseUpsertStandings(stRows);
        console.log(`✅ Clasificación FUMBBL actualizada: ${stRows.length} equipos`);
      } else {
        console.warn('  clasificación: no se leyeron filas', JSON.stringify(st[0]?.raw ?? null));
      }
    } catch (err) {
      console.warn('  clasificación falló:', err.message);
    }

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

        let details = {
          cas_home: null,
          cas_away: null,
          comp_home: null,
          comp_away: null,
          mvp_home: null,
          mvp_away: null,
          casualties: null,
          bashers: null,
          played_at: null,
        };
        if (m.matchId) {
          try {
            details = await fetchMatchDetails(page, m.matchId, homeId, awayId);
          } catch (err) {
            console.warn(`⚠️  No pude leer el detalle del partido ${m.matchId} (${m.home} vs ${m.away}): ${err.message}`);
          }
        }

        const id = fixtureId(key, homeId, awayId);
        const prev = existing.get(id);
        const changed =
          !prev ||
          prev.td_home !== m.td_home ||
          prev.td_away !== m.td_away ||
          prev.fumbbl_match_id !== (m.matchId ?? null) ||
          (details.cas_home != null && prev.cas_home !== details.cas_home) ||
          (details.cas_away != null && prev.cas_away !== details.cas_away) ||
          (details.comp_home != null && prev.comp_home !== details.comp_home) ||
          (details.comp_away != null && prev.comp_away !== details.comp_away) ||
          (details.mvp_home != null && prev.mvp_home !== details.mvp_home) ||
          (details.mvp_away != null && prev.mvp_away !== details.mvp_away) ||
          (details.played_at != null && prev.played_at !== details.played_at) ||
          (details.casualties != null &&
            JSON.stringify(prev.casualties ?? []) !== JSON.stringify(details.casualties)) ||
          (details.bashers != null &&
            JSON.stringify(prev.bashers ?? []) !== JSON.stringify(details.bashers));

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
          if (m.matchId) payload.fumbbl_match_id = m.matchId;
          // Solo se incluyen (y por lo tanto se escriben) si se pudieron leer.
          if (details.cas_home != null) payload.cas_home = details.cas_home;
          if (details.cas_away != null) payload.cas_away = details.cas_away;
          if (details.comp_home != null) payload.comp_home = details.comp_home;
          if (details.comp_away != null) payload.comp_away = details.comp_away;
          if (details.mvp_home != null) payload.mvp_home = details.mvp_home;
          if (details.mvp_away != null) payload.mvp_away = details.mvp_away;
          if (details.played_at != null) payload.played_at = details.played_at;
          if (details.casualties != null) payload.casualties = details.casualties;
          if (details.bashers != null) payload.bashers = details.bashers;
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
