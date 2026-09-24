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

Un workflow de GitHub Actions ([`.github/workflows/sync-fumbbl.yml`](.github/workflows/sync-fumbbl.yml))
corre todos los días, lee el calendario del torneo en FUMBBL con un navegador
real (la página tiene protección anti-bots que bloquea un `curl`/`fetch`
normal) y:

- Si hay una **ronda nueva** que no está en `schedule.ts`, la añade y hace commit + push (dispara el redeploy).
- Sube a Supabase los **resultados (TD)** que falten o hayan cambiado, sin tocar nunca las bajas, la nota o la fecha
  que alguien haya puesto a mano en la web (esos campos no se envían, así que Supabase no los pisa).

El script vive en [`automation/`](automation), separado del sitio (Astro) para no meterle Playwright al build de la web.

**Configuración (una vez):** en GitHub → tu repo → *Settings → Secrets and variables → Actions*,
añade dos *repository secrets* con los mismos valores que tu `.env`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Con eso el workflow ya corre solo. También se puede lanzar a mano desde la pestaña
**Actions → Sync FUMBBL → Run workflow** (por ejemplo, justo después de que salga una ronda,
en vez de esperar a la corrida diaria).

> **Bajas (Cas):** por ahora quedan fuera de la sincronización automática. La ficha de
> partido de FUMBBL sí tiene un dato de bajas por equipo, pero no logré confirmar con
> certeza qué representa exactamente (no cuadraba con partidos ya cargados a mano) — y
> escribir un número de bajas equivocado sería peor que no escribir nada, porque afecta
> el desempate de la clasificación. Las bajas se siguen cargando a mano en la ficha del
> partido, como hasta ahora.

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
```
