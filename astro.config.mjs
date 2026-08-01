import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

// KohliLab — Inhaltsseiten vorgerendert, Bestellweg (/checkout, /api/*) als
// Netlify-Functions über den Adapter. In Astro 4 = output 'hybrid'.
export default defineConfig({
  site: 'https://kohlilab.ch',
  adapter: netlify(),
  output: 'hybrid',
});
