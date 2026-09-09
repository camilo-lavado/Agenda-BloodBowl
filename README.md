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

## Bloqueo de edición

Por defecto la web es de **solo lectura**. Para poder guardar cambios:

1. En Supabase → SQL Editor, abre [`supabase/lock.sql`](supabase/lock.sql),
   **cambia `'CAMBIA-ESTA-CLAVE'` por tu clave real** y ejecútalo. Esto cierra la
   escritura directa: a partir de ahí solo se guarda a través de funciones que
   exigen esa clave.
2. En la web, pulsa **🔒 Bloqueado** (barra superior), escribe la clave y
   *Desbloquear*. Queda recordada en ese navegador.
3. Reglas de quién puede editar qué (se comprueban en la web):
   - Cada quien edita **su propia ficha** (la del coach elegido en «Soy»).
   - Cada partido lo editan **sus dos coaches**.
   - **kroszover** (La orden del Santo Pernil) = **admin**: edita todo.

> El servidor solo comprueba la clave; el «solo tu ficha / admin» es de la
> interfaz. Para un grupo cerrado es suficiente. Para cambiar la clave, vuelve a
> ejecutar el `INSERT … ON CONFLICT` de `lock.sql` con el nuevo valor.

## PWA (instalable)

La web es instalable en el móvil (Añadir a pantalla de inicio) y funciona sin
conexión para lo ya visto. El *service worker* solo se activa en producción
(`dist/`), no en `npm run dev`. Tras cada despliegue puede hacer falta un
refresco para ver los cambios; el `CACHE` en [`public/sw.js`](public/sw.js) se
puede subir de versión (`tb6-v2`, …) para forzar la limpieza.

## Cambiar de ronda

Edita [`src/data/schedule.ts`](src/data/schedule.ts): actualiza `currentRoundLabel`
y la lista `currentRound` con los nuevos pares (usa los `id` de `coaches.ts`).
Vuelve a desplegar. Los contactos guardados no se tocan.

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
  lock.sql              cierra la escritura + funciones con clave de edición
```
