import { defineConfig } from 'astro/config';

// KohliLab — statischer Start. Sobald der Bestellweg kommt, wechseln wir wie
// bei TeeLab auf den Netlify-Adapter mit output 'hybrid' (Astro 4).
export default defineConfig({
  site: 'https://kohlilab.ch',
  output: 'static',
});
