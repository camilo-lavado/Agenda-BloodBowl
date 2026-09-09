// @ts-check
import { defineConfig } from 'astro/config';

// Sitio 100% estático. Se puede desplegar en Netlify, Vercel, GitHub Pages, etc.
// La persistencia la aporta Supabase desde el navegador (ver README.md).
export default defineConfig({
  // Si publicas en un dominio fijo, ponlo aquí (ayuda a SEO / canonical).
  // site: 'https://tasting-blood-vi.netlify.app',
});
