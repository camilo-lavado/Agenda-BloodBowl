# Tasting Blood VI · Contactos

Página estática (Astro) para asociar a cada entrenador del torneo **Tasting Blood VI 2026** (FUMBBL)
con la persona real y su número de WhatsApp, y abrir un chat `wa.me` para agendar los partidos.

- **Sin login.** Cualquiera con el enlace puede editar.
- Los datos editables (quién es / WhatsApp / notas) **se guardan en Supabase** y se ven para todo el grupo.
- La lista de equipos/coaches es fija y vive en [`src/data/coaches.ts`](src/data/coaches.ts).
- Los emparejamientos de la ronda actual están en [`src/data/schedule.ts`](src/data/schedule.ts).

---

## 1. Crear la base de datos (una sola vez, ~2 min)

1. Entra en <https://supabase.com>, crea una cuenta y un proyecto nuevo (plan Free).
2. En el proyecto: menú lateral → **SQL Editor** → **New query**.
3. Copia y pega TODO el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
   Esto crea la tabla `coaches`, las reglas de acceso público y mete los 14 equipos.
4. Menú lateral → **Project Settings** → **API**. Apunta dos valores:
   - **Project URL** → `PUBLIC_SUPABASE_URL`
   - **Project API keys → `anon` `public`** → `PUBLIC_SUPABASE_ANON_KEY`

> La clave `anon` es pública por diseño; es seguro exponerla en el navegador.
> El acceso está limitado por las políticas del `schema.sql` (leer / insertar / actualizar en `coaches`, nada más; nadie puede borrar).

## 2. Configurar el proyecto en local

```bash
npm install
copy .env.example .env   # en PowerShell:  Copy-Item .env.example .env
```

Abre `.env` y pega tus dos valores:

```
PUBLIC_SUPABASE_URL="https://xxxxxxxx.supabase.co"
PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOi..."
```

Arranca en local:

```bash
npm run dev
```

Abre <http://localhost:4321>.

## 3. Publicar (elige una)

El resultado de `npm run build` es HTML estático en `dist/`. Sirve en cualquier hosting.

### Netlify (arrastrar y soltar)
1. `npm run build`
2. <https://app.netlify.com/drop> y suelta la carpeta `dist/`.

### Netlify / Vercel conectado a Git (recomendado)
- Build command: `npm run build`
- Publish directory: `dist`
- Añade las variables `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` en los
  *Environment variables* del panel del hosting (mismos valores que tu `.env`).

## Uso

- Escribe en **Quién es** el nombre de la persona y en **WhatsApp** el número
  (Chile: solo `9 1234 5678`, se añade el 56; otro país: número completo con código, sin `+`).
- Pulsa **Guardar**. Queda guardado para todos. También hay **Copiar número** y **Copiar enlace** (a la ficha).
- El botón verde **WhatsApp** abre el chat con un mensaje preescrito.
- **Soy…**: elige tu coach (se recuerda solo en tu móvil) y se fija arriba tu partido de la ronda con botón directo al rival.
- **Centro de cada partido**: fija día/hora, resultado (TD + bajas) y envía recordatorios por WhatsApp.
- La **clasificación** se calcula sola con los resultados (V 3 / E 1 / D 0; desempate por TD±, bajas±).
- El buscador muestra los resultados en un panel bajo el campo.

## PWA (instalable)

La web es instalable en el móvil (Añadir a pantalla de inicio) y funciona sin
conexión para lo ya visto. El *service worker* solo se activa en producción
(`dist/`), no en `npm run dev`. Tras cada despliegue puede hacer falta un
refresco para ver los cambios; el `CACHE` en [`public/sw.js`](public/sw.js) se
puede subir de versión (`tb6-v2`, …) para forzar la limpieza.

## Cambiar de ronda

Normalmente no hace falta: el [sincronizador automático](#sincronizacion-automatica-con-fumbbl)
añade la ronda nueva solo. Si alguna vez hay que hacerlo a mano: edita
[`src/data/schedule.ts`](src/data/schedule.ts) y añade un bloque nuevo al
final del array `rounds` (usa los `id` de `coaches.ts`); la última entrada es
siempre la ronda "actual" que se ve al abrir la web. Las rondas anteriores se
quedan ahí para verlas en el carrusel. Vuelve a desplegar. Los contactos
guardados no se tocan.

## Sincronización automática con FUMBBL

Hay un script ([`automation/sync-fumbbl.mjs`](automation/sync-fumbbl.mjs)) que lee el calendario
del torneo en FUMBBL con un navegador real (la página tiene protección anti-bots que bloquea un
`curl`/`fetch` normal) y:

- Si hay una **ronda nueva** que no está en `schedule.ts`, la añade (hay que commitear + pushear ese cambio).
- Para cada partido ya **cerrado** en FUMBBL (con marcador), entra a su ficha de partido y sube a Supabase el
  **resultado (TD), las bajas (Cas), el MVP de cada lado, la lista de jugadores muertos/heridos graves y cuándo
  se jugó de verdad**. Un partido cerrado en FUMBBL no cambia nunca, así que ese dato manda siempre y pisa lo
  que hubiera antes (incluida una carga a mano equivocada). **Nota** y **fecha/hora agendada** son cosas que
  solo existen en la web —FUMBBL no las tiene— y esas nunca se tocan.

Con esos datos la web arma solita: un mini-ranking de **líderes** (más touchdowns, más bajas, más pasador,
MVP acumulado — este último por jugador, ya que en Blood Bowl cada equipo nombra su propio MVP en cada
partido), un **recap** de una línea por partido ("Equipo A venció a Equipo B 3-1..."), un **"Salón de los
caídos"** con las bajas graves del torneo, y un enlace directo a la ficha del partido en FUMBBL.

Antes de la primera corrida hay que ejecutar, una sola vez cada uno, en Supabase → SQL Editor:
[`supabase/fumbbl-extras.sql`](supabase/fumbbl-extras.sql) y
[`supabase/fumbbl-completions.sql`](supabase/fumbbl-completions.sql) (agregan las columnas nuevas a `matches`).

El script vive en [`automation/`](automation), separado del sitio (Astro) para no meterle Playwright al build de la web.

### Corre como tarea programada en un computador (no en GitHub Actions)

Se intentó primero como workflow de GitHub Actions con un cron diario, pero **FUMBBL bloquea a
nivel de red las conexiones desde los runners de GitHub** (IP de datacenter) — se confirmó con
`net::ERR_TIMED_OUT` en varias corridas, no es un tema de tiempo de espera ni de disfrazar el
navegador. El workflow ([`.github/workflows/sync-fumbbl.yml`](.github/workflows/sync-fumbbl.yml))
se dejó con disparo manual (`workflow_dispatch`) por si algún día se agrega un runner
*self-hosted* desde una IP que sí funcione, pero **el cron automático está desactivado**.

En cambio, corre como **tarea programada de Windows** en un computador normal (probado y
funcionando de verdad, no solo en teoría):

1. `cd automation && npm install`
2. Instala Chromium **dentro del proyecto** (no en el caché global — una tarea programada a veces
   no lo encuentra ahí aunque exista):
   ```powershell
   $env:PLAYWRIGHT_BROWSERS_PATH = "0"
   npx playwright install chromium
   ```
3. Copia `automation/.env.example` a `automation/.env` y pon ahí los mismos dos valores que en el
   `.env` de la raíz (`SUPABASE_URL` y `SUPABASE_ANON_KEY`, sin el prefijo `PUBLIC_`).
4. Registra la tarea (una vez; corre a diario a las 9:00, se ajusta con `-At`):
   ```powershell
   $scriptPath = "$PWD\automation\run-sync.ps1"
   $action = New-ScheduledTaskAction -Execute "powershell.exe" `
     -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
   $trigger = New-ScheduledTaskTrigger -Daily -At 9:00AM
   $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd `
     -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
   Register-ScheduledTask -TaskName "TastingBloodVI-SyncFUMBBL" -Action $action -Trigger $trigger `
     -Settings $settings -Description "Sincroniza rondas y resultados de Tasting Blood VI desde FUMBBL a Supabase."
   ```

Con `StartWhenAvailable`, si el computador está apagado a esa hora simplemente se salta ese día
(no rompe nada; la próxima corrida se pone al día sola). El resultado de cada corrida queda en
[`automation/sync.log`](automation/sync.log) (no se sube al repo). Para lanzarlo a mano:
`Start-ScheduledTask -TaskName "TastingBloodVI-SyncFUMBBL"`, o directamente `npm run sync` dentro
de `automation/`.

Si una corrida agrega una ronda nueva a `schedule.ts`, ese cambio queda en el working tree del
computador — falta el `git commit` + `push` para que se despliegue (a diferencia de los resultados,
que van directo a Supabase y se ven al toque sin deploy).

## Estructura

```
src/
  data/coaches.ts       semilla fija de equipos y coaches
  data/schedule.ts      emparejamientos + clave de la ronda actual
  layouts/Base.astro    <head>, PWA, registro del service worker
  pages/index.astro     página + lógica de Supabase (cliente)
  styles/global.css
public/
  manifest.webmanifest  metadatos de la PWA
  sw.js                 service worker (offline básico)
  icon.svg / icon-maskable.svg
supabase/
  schema.sql            tabla coaches + semilla
  matches.sql           tabla matches (día/hora + resultado)
  fumbbl-extras.sql     columnas de mvp/bajas nombradas/fecha jugada/id de FUMBBL
  fumbbl-completions.sql columnas de pases completados (comp_home/comp_away)
automation/
  sync-fumbbl.mjs       lee FUMBBL y sincroniza rondas/resultados
  run-sync.ps1          envoltorio para la tarea programada (con log)
  .env                  claves de Supabase para el script (no se sube)
```

## Novedades: iconos, brutalistas y clasificación de FUMBBL

- Iconos Lucide (`src/lib/icons.ts`) en lugar de emojis; Líderes muestra el top 5 y es colapsable.
- «Brutalistas y asesinos»: bajas causadas por jugador y muertes causadas por equipo.
- La clasificación se copia de la tabla «Tournament Members» de FUMBBL (si no hay datos, se calcula localmente).
- **Requiere ejecutar `supabase/fumbbl-more.sql`** en el SQL Editor y luego correr el sincronizador.
- Fondo de cancha de fútbol americano (CSS puro, respeta `prefers-reduced-motion`).
