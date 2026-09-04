import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

// KohliLab — Inhaltsseiten vorgerendert, Bestellweg (/checkout, /api/*) als
// Netlify-Functions über den Adapter. In Astro 4 = output 'hybrid'.
export default defineConfig({
  site: 'https://kohlilab.ch',
  adapter: netlify(),
  output: 'hybrid',
  // Seiten als /golf-tees.html statt /golf-tees/index.html (UX-Durchgang
  // 31.08.2026): Netlify leitete jeden Klick auf /golf-tees per 301 nach
  // /golf-tees/ um — 0.3-0.5 s Umweg pro Klick. Mit Dateien statt Ordnern
  // liefert Netlify /golf-tees direkt aus (Pretty URLs), ohne Umleitung.
  trailingSlash: 'never',
  build: { format: 'file' },
});
