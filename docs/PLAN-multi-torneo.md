> **Actualización:** este plan se retomó como un proyecto aparte y agnóstico (`fumbbl-hub`): API en Go con sincronizador, Swagger y pruebas. Este documento queda como antecedente.

# Plan: de «Tasting Blood VI» a una app para cualquier torneo o liga de FUMBBL

Estado: propuesta · Fecha: 2026-09-24 · Base: la app actual (Astro estático + Supabase + sincronizador)

---

## 1. Resumen ejecutivo

La app actual ya resuelve lo difícil: directorio coach↔WhatsApp, agenda de partidos, resultados, clasificación, líderes, salón de los caídos, brutalistas y podio. Hoy está **acoplada a un solo torneo** (URL, coaches, rondas y textos escritos a mano).

Hallazgo que cambia el plan: **FUMBBL tiene una API JSON abierta** que responde a un simple `curl`, sin la protección anti-bots (Anubis) que nos obligó a usar un navegador automatizado. Eso permite:

- Reemplazar la mayor parte del scraping por llamadas HTTP simples y estables.
- Crear un torneo nuevo **solo con su ID de FUMBBL**: la API entrega equipos, coaches, calendario, resultados y clasificación.
- Probablemente volver a poder correr el sincronizador en la nube (GitHub Actions) — **por confirmar** (ver §9, riesgo R1).

**Recomendación:** hacerlo en tres fases. (1) Volver la app *configurable* por un archivo de torneo + tema; (2) sincronizar con la API en vez de scraping; (3) soportar varios torneos a la vez en un mismo sitio. Cada fase deja algo usable. Las 10 plantillas de tema **ya están creadas** (§8).

---

## 2. Investigación: qué ofrece FUMBBL

Probado el 2026-09-24 contra el torneo 67349 (Tasting Blood VI 2026) y el grupo 15266.

### 2.1 Acceso

| Vía | Resultado |
|---|---|
| `https://fumbbl.com/api/...` con `curl` | **200 OK, JSON**, sin cookies ni navegador |
| Páginas HTML (`/p/group`, `/p/match`, `/apidoc/`) | Detrás de Anubis (reto anti-bots); requieren navegador |
| Documentación oficial `/apidoc/` | No accesible sin navegador (Anubis); usar los endpoints de abajo |

### 2.2 Endpoints verificados (todos `GET https://fumbbl.com/api/<ruta>`)

| Ruta | Devuelve | Uso en la app |
|---|---|---|
| `group/get/{grupoId}` | nombre, dueño, staff, estado del grupo | Ficha del grupo/liga |
| `group/tournaments/{grupoId}` | lista de torneos: `id`, `name`, `type` (Swiss, Knockout, DoubleElimination…), `status` (In Progress / Completed), fechas, `winner` | **Selector de torneo**, historial de campeones |
| `tournament/get/{id}` | `status`, `type`, `name`, `group`, `winner` | Detectar **fin de torneo** de forma oficial |
| `tournament/schedule/{id}` | todos los partidos: `round`, `position`, equipos (`id`,`name`), `result` (`id` del partido, `status: played`, `winner`, `score` por equipo, `replayId`) | Calendario, rondas, marcadores |
| `tournament/members/{id}` | **la clasificación oficial**: coach, equipo, `score`, `tdFor/tdAgainst`, `casFor/casAgainst`, `wins/ties/losses` | Tabla de clasificación (reemplaza la lectura HTML) |
| `match/get/{id}` | fecha/hora, equipos, raza, coach, `score`, `casualties {bh, si, rip}`, valor de equipo, incentivos | Detalle de partido, bajas y muertes por equipo |
| `team/get/{id}` | coach, raza, récord, `td`/`cas` for/against, estado | Ficha de equipo |
| `team/matches/{id}` | partidos del equipo | Historial del equipo |
| `coach/get/{id}` | nombre, ranking, último acceso | Datos del coach |
| `match/list` | últimos partidos globales | (no necesario) |

Notas: `tournament/standings`, `tournament/teams`, `group/members`, `match/players` **no existen** («No such command»). El torneo devuelve `type` numérico en `tournament/get` (4 = Swiss, 6 = DoubleElimination) y texto en `group/tournaments`.

### 2.3 Lo que la API **no** da (sigue siendo HTML)

Estos datos dependen de leer la página `/p/match?id=N`:

- Nombre de los jugadores caídos y **qué les pasó** (Dead, Seriously Hurt…) → Salón de los caídos.
- **MVP** de cada equipo y **pases completados** por equipo → líderes de MVP y pasador.
- **Bajas causadas por jugador** → Brutalistas.

`match/get` sí entrega bajas por **equipo** (`bh`, `si`, `rip`), por lo que «Equipos asesinos» y «Equipos más golpeados» sobreviven con solo la API.

**Decisión de diseño:** dividir en dos niveles.

- **Núcleo (solo API):** calendario, marcadores, clasificación oficial, bajas por equipo, muertes por equipo, podio, campeón. Funciona para cualquier torneo, en la nube, sin navegador.
- **Módulo «detalle de jugadores» (opcional, con navegador):** caídos con nombre, MVP, pasador, brutalistas. Se activa con `features.playerDetail: true` y solo corre en un equipo local o self-hosted.

---

## 3. Diagnóstico: qué está acoplado hoy

| Archivo / pieza | Acoplamiento actual |
|---|---|
| `automation/sync-fumbbl.mjs` | URL fija `group=15266`; `TOTAL_ROUNDS = 4`; lectura por HTML con Playwright |
| `src/data/coaches.ts` | 14 coaches con equipos, razas y WhatsApp, escritos a mano |
| `src/data/schedule.ts` | Emparejamientos por ronda escritos a mano (los sincroniza el script) |
| `src/pages/index.astro` | Título «Tasting Blood VI», «4 rondas», 7 partidos por ronda, textos con humor propio del grupo, ID del admin (`la-orden-del-santo-pernil`) |
| `src/layouts/Base.astro`, `public/manifest.webmanifest` | Nombre, iconos y colores de la PWA |
| Supabase (`coaches`, `matches`, `fumbbl_standings`) | Sin columna de torneo: un solo torneo por proyecto |
| Regla de permisos | «Camilo = admin»: valor fijo |
| `README.md`, footer | Textos del grupo |

---

## 4. Arquitectura objetivo

### 4.1 Un archivo de torneo manda sobre todo

`tournaments/<slug>.json` (uno por torneo/liga):

```jsonc
{
  "slug": "tasting-blood-vi",
  "name": "Tasting Blood VI",
  "tagline": "Contactos y calendario",
  "fumbbl": { "groupId": 15266, "tournamentId": 67349 },
  "format": "swiss",              // swiss | knockout | double-elimination | league
  "totalRounds": 4,                // opcional: si falta, se toma de la API
  "theme": "gridiron",             // una de las 10 plantillas (§8)
  "locale": "es",
  "admin": { "coachId": "la-orden-del-santo-pernil" },
  "contact": { "country": "56", "channel": "whatsapp" },
  "features": {
    "playerDetail": true,          // módulo con navegador (caídos, MVP, brutalistas)
    "podium": true,
    "humor": "negro"               // negro | neutro | ninguno  (tono de los textos vacíos)
  },
  "credits": { "text": "Desarrollado por CalaDev", "url": "https://www.caladev.page/" }
}
```

Todo lo que hoy está escrito a mano (título, nº de rondas, admin, país del teléfono, textos) sale de aquí.

### 4.2 Coaches y equipos: se importan, no se escriben

Con `tournament/members/{id}` (y `team/get`) el sincronizador **genera la lista de coaches** (equipo, raza, coach FUMBBL). Lo único manual son los **nombres reales y WhatsApp**, que siguen ingresándose dentro de la app (cada coach su ficha, admin todas), tal como ahora. Esto reduce «montar un torneo» a pegar un ID.

### 4.3 Datos (Supabase)

Añadir `tournament_id text not null` a `coaches`, `matches` y `fumbbl_standings`, con claves compuestas `(tournament_id, id)` y políticas RLS iguales a las actuales (lectura/escritura pública, sin login). Esbozo:

```sql
alter table coaches          add column tournament_id text not null default 'legacy';
alter table matches          add column tournament_id text not null default 'legacy';
alter table fumbbl_standings add column tournament_id text not null default 'legacy';
-- claves primarias pasan a (tournament_id, id) / (tournament_id, team_id)
-- índice por tournament_id en las tres tablas
```

Migración: los datos actuales quedan como `tasting-blood-vi` (renombrando el valor por defecto).

### 4.4 Sitio: dos modos, misma base

- **Modo A — un despliegue por torneo (Fase 1).** Variable `PUBLIC_TOURNAMENT=tasting-blood-vi`; el build lee `tournaments/<slug>.json`. Simple, aislado, tema propio, dominio propio.
- **Modo B — un sitio, muchos torneos (Fase 3).** Rutas `/t/<slug>/`; portada con el listado de torneos activos e historial (`group/tournaments`). Astro genera una página por torneo del directorio `tournaments/`.

Recomendación: empezar por A (menor riesgo, rápido) y pasar a B cuando haya ≥ 2 torneos simultáneos.

### 4.5 Formatos de torneo

| Formato FUMBBL | UI necesaria | Estado |
|---|---|---|
| Swiss / League | Clasificación + rondas (ya existe) | Listo |
| Knockout / DoubleElimination | **Llave (bracket)** por rondas, sin tabla de puntos; el podio sale del `winner` | Nuevo: componente `Bracket` |
| Round robin por grupos | Tabla por grupo | Fase 3 (si aparece) |

`format` decide qué secciones se muestran; el calendario por rondas ya sirve para los tres.

### 4.6 Sincronizador (API primero)

Flujo de una corrida:

1. `tournament/get/{id}` → estado; si `Completed`, guardar marcador y pausar (reemplaza el contador manual de 4 rondas).
2. `tournament/schedule/{id}` → rondas y marcadores; crear rondas nuevas en la base (adiós a editar `schedule.ts`).
3. `tournament/members/{id}` → `fumbbl_standings`.
4. Por cada partido cerrado: `match/get/{id}` → bajas por equipo.
5. (Opcional, `playerDetail`) navegador → página del partido → caídos, MVP, pasador, brutalistas.
6. Escritura a Supabase agrupada por firma de claves (como hoy).

Además: ejecución con `--tournament <slug>`; con varios torneos, itera sobre todos los activos.

---

## 5. Sistema de temas (10 plantillas)

Objetivo: cambiar **solo** el aspecto (color y textura de la cancha) sin alterar estructura, tipografía ni componentes. Ya implementado:

- `src/styles/themes.css` — 10 temas como variables CSS (`[data-theme="…"]`).
- `src/layouts/Base.astro` — aplica `data-theme` desde `PUBLIC_THEME` (por defecto `gridiron`).
- `docs/temas.html` — vista previa de las 10 plantillas (abrir en el navegador).

### 5.1 Tokens por tema

| Token | Función |
|---|---|
| `--panel`, `--panel-ink` | Barras oscuras: cabecera, rótulos, podio, footer |
| `--blood`, `--blood-strong` | Acento principal (números, bordes, etiquetas) |
| `--gold` | Acento secundario (kicker, estadísticas, cintillo de noticias) |
| `--ta`, `--tb` | Franjas de la cancha (claro); en oscuro se oscurecen automáticamente |
| `--turf-line` | Líneas de yarda |
| `--ez` | Tinte de la zona de anotación |

El modo claro/oscuro sigue siendo automático (`prefers-color-scheme`); cada tema funciona en ambos.

### 5.2 Las 10 plantillas

| # | `data-theme` | Nombre | Ambiente | Panel | Acento | Oro / detalle | Cancha |
|---|---|---|---|---|---|---|---|
| 1 | `gridiron` | Gridiron | Césped clásico (actual) | `#0e1c14` | `#a3231f` | `#d4a437` | verde `#2b6b36` |
| 2 | `nuffle` | Nuffle | Cuero y pergamino | `#1a1109` | `#a8321f` | `#c9a227` | oliva `#55692f` |
| 3 | `caos` | Yermos del Caos | Ceniza y brasas | `#120808` | `#d0361a` | `#e0902b` | ceniza `#3a2f2d` |
| 4 | `elfos` | Reinos Élficos | Marfil, verde azulado y plata | `#0b1f2a` | `#137a6f` | `#c7d5df` | jade `#2f7361` |
| 5 | `no-muertos` | Cripta | Violeta y hueso | `#140f1e` | `#7a45c0` | `#cfd08a` | musgo `#33402f` |
| 6 | `orcos` | Orcos y Goblins | Verde brillante y naranja | `#10200f` | `#b84a08` | `#b6d94c` | verde vivo `#3f7d2b` |
| 7 | `enanos` | Forja Enana | Pizarra y cobre | `#14171c` | `#b34d14` | `#e0b15a` | piedra `#454c56` |
| 8 | `hielo` | Yermos Helados | Hielo y azul | `#0c1a2b` | `#1f6fbf` | `#dfeaf5` | hielo `#8fb7d4` |
| 9 | `desierto` | Copa del Desierto | Arena y terracota | `#2a1c0c` | `#b8391f` | `#f0c05a` | arena `#c2a15e` |
| 10 | `nocturno` | Partido Nocturno | Neón bajo los focos | `#05070d` | `#d01a6c` | `#22e6c3` | verde noche `#123a28` |

**Contraste (WCAG):** medido acento sobre el crema de las tarjetas (`#f8f6ef`) entre 4,1 y 6,9; oro sobre panel entre 7,7 y 14,4; texto sobre panel ≥ 14. El acento de Orcos se oscureció a `#b84a08` para acercarse a 4,5. Pendiente de validar en pantalla: cada tema en modo oscuro con capturas (tarea de Fase 1).

### 5.3 Cómo elegir el tema

- Por torneo: campo `theme` del archivo de torneo → se traduce a `PUBLIC_THEME` en el build.
- (Opcional Fase 3) selector en el pie para que cada persona cambie de tema, guardado en `localStorage`.
- Crear un tema nuevo = añadir un bloque `[data-theme="mi-tema"]` con los 8 tokens y una tarjeta en `docs/temas.html`.

### 5.4 Qué NO cambia entre temas (garantía del «mismo estilo»)

Tipografía (Barlow Condensed + Inter), forma de componentes (cintillo de noticias, rótulos de sección, tablas, podio), iconografía Lucide y distintivos equipo/coach/jugador, espaciado y responsive.

---

## 6. Onboarding de un torneo nuevo (meta: < 30 min)

1. Encontrar el ID del torneo en FUMBBL (URL o `group/tournaments/{grupoId}`).
2. Crear `tournaments/<slug>.json` (ID, nombre, formato, tema, admin).
3. Correr `npm run tournament:init <slug>` → importa equipos y coaches desde la API y crea `coaches` en Supabase.
4. Elegir tema (mirar `docs/temas.html`) y ajustar textos/tono.
5. Desplegar (Netlify/Vercel/GitHub Pages) con `PUBLIC_TOURNAMENT` y `PUBLIC_THEME`.
6. Programar el sincronizador (GitHub Actions si la prueba R1 resulta bien; si no, tarea local).
7. Cada coach completa su WhatsApp en la app.

---

## 7. Cambios concretos por archivo

| Cambio | Archivos |
|---|---|
| Config de torneo + lector | `tournaments/*.json`, `src/lib/tournament.ts` |
| Textos, título, admin, nº de rondas desde config | `src/pages/index.astro`, `Base.astro`, manifiesto |
| Coaches desde la base (no desde `coaches.ts`) | `src/data/coaches.ts` → tabla `coaches` + build-time fetch |
| Rondas desde la base (no `schedule.ts`) | `src/data/schedule.ts` → tabla `matches` |
| Sincronizador API | nuevo `automation/sync-api.mjs`; `sync-fumbbl.mjs` queda como módulo `playerDetail` |
| Multi-torneo en Supabase | `supabase/multi-tournament.sql` |
| Llave para eliminación | `src/components/Bracket.astro` |
| Temas | ya hecho: `themes.css`, `docs/temas.html` |

---

## 8. Hoja de ruta

| Fase | Contenido | Resultado | Esfuerzo estimado |
|---|---|---|---|
| **0 — Hecho** | Investigación de la API, 10 temas, este documento | Base y decisiones | ✔ |
| **1 — Configurable** | Archivo de torneo, textos y tema desde config, coaches/rondas leídos de la base, `tournament:init`, prueba de los 10 temas en claro/oscuro | Otro torneo Swiss en un despliegue aparte | 2–3 días |
| **2 — API primero** | `sync-api.mjs` (calendario, marcadores, clasificación, bajas por equipo), fin de torneo por `status`, prueba en GitHub Actions | Sincronización sin navegador | 1–2 días |
| **3 — Multi-torneo** | Columna `tournament_id`, rutas `/t/<slug>`, portada con historial, selector de tema, componente `Bracket` para eliminatorias | Un sitio para todos los torneos de un grupo | 3–5 días |
| **4 — Pulido** | Documentación para terceros, plantilla de repositorio, pruebas automáticas del sincronizador | Otros grupos pueden usarla | 2 días |

---

## 9. Riesgos y decisiones abiertas

| # | Riesgo / decisión | Mitigación |
|---|---|---|
| R1 | La API responde a `curl` desde este equipo, pero **no está probado desde los servidores de GitHub Actions** (antes las páginas HTML fallaron desde allí) | Probar con un workflow mínimo en Fase 2; si falla, mantener tarea local |
| R2 | La API no está documentada públicamente y puede cambiar | Aislar las llamadas en un módulo, validar con esquemas y fallar de forma clara |
| R3 | Sin login: cualquiera puede editar partidos; en varios torneos aumenta la superficie | Mantener el modelo (confianza + FUMBBL manda en cerrados); considerar políticas RLS por torneo |
| R4 | Los WhatsApp son datos personales; en un sitio multi-torneo público conviene revisar privacidad | Decidir si cada torneo requiere una clave de acceso al directorio |
| R5 | Ligas largas (temporadas, muchas rondas) cambian el peso de la UI | Paginar rondas; resumen de temporada |
| D1 | ¿Un despliegue por torneo (A) o un sitio único (B)? | Empezar por A; migrar a B con ≥ 2 torneos |
| D2 | ¿Se mantiene el módulo con navegador (caídos, MVP, brutalistas)? | Opcional por torneo; requiere equipo propio |
| D3 | Tono del humor negro por torneo | Campo `features.humor` |

---

## 10. Siguiente paso recomendado

Aprobar la Fase 1. Primero: `tournaments/tasting-blood-vi.json` y mover a configuración los textos, el número de rondas, el admin y el tema; el sitio actual debe quedar idéntico (prueba de regresión visual con capturas). Después, probar el sincronizador por API en GitHub Actions (R1), porque de ese resultado depende si se puede eliminar la tarea programada local.

---

## Apéndice A — Fuentes de esta investigación

Todas las rutas anteriores se probaron directamente contra `https://fumbbl.com/api/` el 2026-09-24. No hay documentación oficial accesible sin navegador; conviene confirmar límites de uso con la comunidad/administración de FUMBBL antes de sincronizar muchos torneos a la vez.
