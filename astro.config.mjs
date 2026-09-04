import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';

// Sitemap (UX-Durchgang, Punkt 7): nur oeffentliche Seiten. Kasse, Warenkorb,
// Danke-Seite, Offerten, Werber-Ansichten und die Lochwand (Testphase, noindex)
// bleiben draussen. SSR-Seiten stehen nicht im Build und werden explizit
// genannt (customPages).
const NICHT_IN_SITEMAP = ['/checkout', '/warenkorb', '/bestellung', '/offerte', '/werber', '/w/', '/lochwand', '/404'];

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
  integrations: [
    sitemap({
      filter: (seite) => !NICHT_IN_SITEMAP.some((p) => seite.includes(p)),
      customPages: ['https://kohlilab.ch/organizer', 'https://kohlilab.ch/ventilkappen'],
    }),
  ],
});
