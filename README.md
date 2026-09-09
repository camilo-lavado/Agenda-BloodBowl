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
  con código de país y sin `+` ni espacios (ej. `34600123456`, `56912345678`).
- Pulsa **Guardar**. Queda guardado para todos.
- El botón verde **WhatsApp** abre el chat con un mensaje preescrito para cuadrar el partido.
- Cada tarjeta muestra el **rival de la ronda** para saber a quién escribir.

## Cambiar de ronda

Edita [`src/data/schedule.ts`](src/data/schedule.ts): actualiza `currentRoundLabel`
y la lista `currentRound` con los nuevos pares (usa los `id` de `coaches.ts`).
Vuelve a desplegar. Los contactos guardados no se tocan.

## Estructura

```
src/
  data/coaches.ts      semilla fija de equipos y coaches
  data/schedule.ts     emparejamientos de la ronda actual
  components/CoachCard.astro
  layouts/Base.astro
  pages/index.astro    página + lógica de Supabase (cliente)
  styles/global.css
supabase/schema.sql    script de creación + semilla
```
