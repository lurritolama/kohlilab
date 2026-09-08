// Geodaten fuer den Relief-Konfigurator (KohliLab).
//
// Alles laeuft im Browser, direkt gegen die offenen swisstopo-Dienste
// (CORS ist dort fuer alles freigegeben, geprueft 07.09.2026):
//   * STAC-API data.geo.admin.ch  — welche 1-km-Kacheln decken das Rechteck?
//   * Cloud Optimized GeoTIFF     — Hoehenmodell swissALTI3D (2 m / 0.5 m),
//                                   nur der benoetigte Ausschnitt per
//                                   HTTP-Range (geotiff.js, public/vendor)
//   * WMS wms.geo.admin.ch         — Flaechenmasken: Wald (swissTLM3D),
//                                   Gewaesser (Seen + Fluesse), Gebaeude
//   * SearchServer api3.geo.admin.ch — Adress-/Ortssuche
//
// Lizenz: swisstopo-OGD, kommerzielle Nutzung erlaubt, Pflicht ist die
// Quellenangabe "© swisstopo" (steht auf der Vorderkante jedes Reliefs).
//
// Koordinaten: intern LV95 (EPSG:2056, Meter, E/N). Die Umrechnung von und
// nach WGS84 nutzt die swisstopo-Naeherungsformeln (Genauigkeit ~1 m).

const STAC = 'https://data.geo.admin.ch/api/stac/v1/collections';
const WMS = 'https://wms.geo.admin.ch/';
export const SUCHE = 'https://api3.geo.admin.ch/rest/services/api/SearchServer';

// ---------- Koordinaten ----------
export function wgs2lv95(lat, lon) {
  const p = (lat * 3600 - 169028.66) / 10000, l = (lon * 3600 - 26782.5) / 10000;
  const E = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l * l * l;
  const N = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p * p * p;
  return [E, N];
}
export function lv952wgs(E, N) {
  const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  const l = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const p = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x * x * x;
  return [p * 100 / 36, l * 100 / 36];            // [lat, lon]
}
/** Rechteck in LV95 -> bbox in WGS84 (lon0,lat0,lon1,lat1) fuer die STAC-Suche. */
function bboxWgs(r) {
  const ecken = [lv952wgs(r.E0, r.N0), lv952wgs(r.E1, r.N0), lv952wgs(r.E0, r.N1), lv952wgs(r.E1, r.N1)];
  const lats = ecken.map((e) => e[0]), lons = ecken.map((e) => e[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

// ---------- STAC: Kacheln finden ----------
/**
 * Alle Items der Collection, die das Rechteck beruehren. Bei mehreren
 * Jahrgaengen derselben Kachel gewinnt der neueste. Rueckgabe: Array
 * { id, url } mit der URL des passenden GeoTIFF-Assets.
 *   aufl: '2' | '0.5'  (Metersuffix im Asset-Namen von swissALTI3D)
 */
export async function kacheln(rect, collection, aufl, signal) {
  const bb = bboxWgs(rect).map((v) => v.toFixed(6)).join(',');
  let url = `${STAC}/${collection}/items?bbox=${bb}&limit=100`;
  const beste = new Map();                        // "E-N" -> { jahr, id, url }
  for (let seite = 0; url && seite < 20; seite++) {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`swisstopo STAC antwortet nicht (${r.status})`);
    const d = await r.json();
    for (const f of d.features || []) {
      const m = /_(\d{4})_(\d{4})-(\d{4})$/.exec(f.id);   // ..._2020_2723-1216
      if (!m) continue;
      const key = `${m[2]}-${m[3]}`, jahr = +m[1];
      const asset = Object.entries(f.assets || {}).find(([k]) => new RegExp(`_${aufl.replace('.', '\\.')}_2056_\\d+\\.tif$`).test(k));
      if (!asset) continue;
      const alt = beste.get(key);
      if (!alt || alt.jahr < jahr) beste.set(key, { jahr, id: f.id, url: asset[1].href, E: +m[2] * 1000, N: +m[3] * 1000 });
    }
    const next = (d.links || []).find((l) => l.rel === 'next');
    url = next ? next.href : null;
  }
  return [...beste.values()];
}

// ---------- Hoehenmodell lesen ----------
/**
 * Hoehenraster (Meter ue. M.) fuer das Rechteck als nx*ny Float32Array,
 * Zeile 0 = SUEDEN (Mesh-Konvention: y nach Norden). Punkt (i,j) liegt bei
 * E = E0 + i*(E1-E0)/(nx-1), N = N0 + j*(N1-N0)/(ny-1).
 *
 * Quelle: swissALTI3D als COG. Es wird die Overview-Stufe gewaehlt, deren
 * Pixel hoechstens so gross ist wie der Zielabstand — so bleibt der Abruf
 * klein (bei 10 km Kante liest jede Kachel nur ~60x60 Pixel). Zwischen den
 * Quellpixeln wird bilinear interpoliert.
 *
 * fortschritt(anzahlFertig, anzahlTotal) optional.
 */
export async function hoehenRaster(rect, nx, ny, o = {}) {
  const dE = (rect.E1 - rect.E0) / (nx - 1), dN = (rect.N1 - rect.N0) / (ny - 1);
  const ziel = Math.min(dE, dN);
  const aufl = ziel < 1.6 ? '0.5' : '2';
  const liste = await kacheln(rect, 'ch.swisstopo.swissalti3d', aufl, o.signal);
  if (liste.length === 0) throw new Error('Für diesen Ausschnitt gibt es kein Höhenmodell — er liegt ausserhalb der Schweiz.');
  const h = new Float32Array(nx * ny).fill(NaN);
  let fertig = 0;
  const GT = window.GeoTIFF;
  // bis zu 6 Kacheln gleichzeitig
  const warteschlange = liste.slice();
  const arbeiter = async () => {
    while (warteschlange.length) {
      const k = warteschlange.shift();
      // Schnitt Kachel x Rechteck (Kachel = 1 km ab E,N)
      const e0 = Math.max(rect.E0, k.E), e1 = Math.min(rect.E1, k.E + 1000);
      const n0 = Math.max(rect.N0, k.N), n1 = Math.min(rect.N1, k.N + 1000);
      if (e1 <= e0 || n1 <= n0) { fertig++; continue; }
      const tiff = await GT.fromUrl(k.url, { allowFullFile: false, cache: true, blockSize: 65536 });
      const n = await tiff.getImageCount();
      // Stufe waehlen: groesste Pixelgroesse <= ziel. Overviews tragen keine
      // eigenen Geo-Schluessel — Ursprung vom Vollbild, Aufloesung ueber das
      // Breitenverhaeltnis.
      const img0 = await tiff.getImage(0);
      const res0 = Math.abs(img0.getResolution()[0]);
      const [ox, oy] = img0.getOrigin();            // Ecke oben links (E, N)
      let img = img0, res = res0;
      for (let s = 1; s < n; s++) {
        const cand = await tiff.getImage(s); const r = res0 * img0.getWidth() / cand.getWidth();
        if (r <= ziel * 1.001) { img = cand; res = r; } else break;
      }
      const W = img.getWidth(), H = img.getHeight();
      // Pixelfenster (mit 1 Pixel Rand fuer die Interpolation)
      const px0 = Math.max(0, Math.floor((e0 - ox) / res) - 1), px1 = Math.min(W, Math.ceil((e1 - ox) / res) + 1);
      const py0 = Math.max(0, Math.floor((oy - n1) / res) - 1), py1 = Math.min(H, Math.ceil((oy - n0) / res) + 1);
      if (px1 <= px0 || py1 <= py0) { fertig++; continue; }
      const [band] = await img.readRasters({ window: [px0, py0, px1, py1], samples: [0], signal: o.signal });
      const fw = px1 - px0, fh = py1 - py0;
      const nodata = img0.getGDALNoData();
      const wert = (px, py) => { const v = band[py * fw + px]; return (v === nodata || v < -100 || !Number.isFinite(v)) ? NaN : v; };
      // Zielpunkte, die in diesem Schnitt liegen
      const i0 = Math.max(0, Math.ceil((e0 - rect.E0) / dE - 1e-6)), i1 = Math.min(nx - 1, Math.floor((e1 - rect.E0) / dE + 1e-6));
      const j0 = Math.max(0, Math.ceil((n0 - rect.N0) / dN - 1e-6)), j1 = Math.min(ny - 1, Math.floor((n1 - rect.N0) / dN + 1e-6));
      for (let j = j0; j <= j1; j++) {
        const N = rect.N0 + j * dN;
        const fy = (oy - N) / res - 0.5 - py0;          // Pixelmitte = +0.5
        for (let i = i0; i <= i1; i++) {
          const E = rect.E0 + i * dE;
          const fx = (E - ox) / res - 0.5 - px0;
          let x0 = Math.floor(fx), y0 = Math.floor(fy);
          const tx = fx - x0, ty = fy - y0;
          x0 = Math.max(0, Math.min(fw - 2, x0)); y0 = Math.max(0, Math.min(fh - 2, y0));
          const a = wert(x0, y0), b = wert(x0 + 1, y0), c = wert(x0, y0 + 1), d = wert(x0 + 1, y0 + 1);
          let v;
          if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) {
            const g = [a, b, c, d].filter((q) => !Number.isNaN(q)); v = g.length ? g.reduce((s, q) => s + q, 0) / g.length : NaN;
          } else v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
          if (!Number.isNaN(v)) h[j * nx + i] = v;
        }
      }
      fertig++;
      if (o.fortschritt) o.fortschritt(fertig, liste.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, liste.length) }, arbeiter));
  // Loecher (Landesgrenze, fehlende Kachel): auf den tiefsten bekannten Wert
  let min = Infinity, fehlt = 0;
  for (let k = 0; k < h.length; k++) { if (Number.isNaN(h[k])) fehlt++; else if (h[k] < min) min = h[k]; }
  if (fehlt === h.length) throw new Error('Keine Höhendaten im Ausschnitt.');
  if (fehlt) for (let k = 0; k < h.length; k++) if (Number.isNaN(h[k])) h[k] = min;
  return { h, fehlt, aufl, kacheln: liste.length };
}

// ---------- WMS-Masken ----------
/**
 * Flaechenmaske aus einem WMS-Layer: Uint8Array nx*ny, 1 = Flaeche, Zeile 0
 * = Sueden. Es zaehlt nur die Deckkraft — die Layer zeichnen ihre Flaechen
 * gefuellt (Wald, Gebaeude, Seen) bzw. als Linien (Fluesse).
 */
export async function wmsMaske(rect, nx, ny, layer, signal) {
  const m = await wmsMasken(rect, nx, ny, layer, { alle: () => true }, signal);
  return m.alle;
}
/**
 * Mehrere Masken aus EINEM WMS-Bild, getrennt nach Pixelfarbe:
 *   filter = { name: (r, g, b) => bool, … }  (nur deckende Pixel, a > 90)
 * Der Gewaesser-Layer zeichnet Seen als hellblaue Flaeche (158,186,255) und
 * Fluesse/Baeche als blaue Linie (0,0,255) — so lassen sie sich trennen.
 */
export async function wmsMasken(rect, nx, ny, layer, filter, signal) {
  const w = Math.min(2000, nx), hh = Math.min(2000, ny);
  const url = `${WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer}&STYLES=&CRS=EPSG:2056` +
    `&BBOX=${rect.E0},${rect.N0},${rect.E1},${rect.N1}&WIDTH=${w}&HEIGHT=${hh}&FORMAT=image/png&TRANSPARENT=true`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`WMS ${layer}: ${r.status}`);
  const bmp = await createImageBitmap(await r.blob());
  const c = document.createElement('canvas'); c.width = nx; c.height = ny;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = false;
  x.drawImage(bmp, 0, 0, nx, ny);
  const d = x.getImageData(0, 0, nx, ny).data;
  const namen = Object.keys(filter);
  const aus = Object.fromEntries(namen.map((n) => [n, new Uint8Array(nx * ny)]));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const src = ((ny - 1 - j) * nx + i) * 4;      // Bildzeile 0 = Norden
    if (d[src + 3] <= 90) continue;
    for (const n of namen) if (filter[n](d[src], d[src + 1], d[src + 2])) aus[n][j * nx + i] = 1;
  }
  return aus;
}
export const LAYER = {
  wald: 'ch.swisstopo.swisstlm3d-wald',
  wasser: 'ch.swisstopo.swisstlm3d-gewaessernetz',
  haupt: 'ch.swisstopo.vec200-hydrography',          // Landeskarte 1:200'000: nur die Hauptgewaesser
  gebaeude: 'ch.swisstopo.vec25-gebaeude',
};
// Gewaesser-Layer, Farben gemessen (08.09.2026): Seen als Flaeche
// (158,186,255), Wasserlaeufe als Linie (0,0,253..255), Seeufer als dunklere
// Linie (0,92,230), dazu graue Punktreihen (102,102,102) und Antialiasing.
// Nur die ersten beiden sind Wasser — Grau lief vorher als "See" durch.
export const WASSER_FILTER = {
  seen: (r, g, b) => r > 130 && r < 185 && g > 160 && g < 210 && b > 230,
  fluesse: (r, g, b) => r < 40 && g < 40 && b > 200,
};

// ---------- GPX ----------
/** Trackpunkte einer GPX-Datei als [[E,N], …] (LV95). */
export function gpxPunkte(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  let pts = [...doc.getElementsByTagName('trkpt')];
  if (pts.length < 2) pts = [...doc.getElementsByTagName('rtept')];
  if (pts.length < 2) pts = [...doc.getElementsByTagName('wpt')];
  const aus = [];
  for (const p of pts) {
    const lat = parseFloat(p.getAttribute('lat')), lon = parseFloat(p.getAttribute('lon'));
    if (Number.isFinite(lat) && Number.isFinite(lon)) aus.push(wgs2lv95(lat, lon));
  }
  return aus;
}
/**
 * Route ins Raster brennen: Uint8Array nx*ny, 1 = Route. radius in Zellen.
 * Punkte ausserhalb des Rechtecks werden geclippt (Segmente laufen durch).
 */
export function routeMaske(rect, nx, ny, punkte, radius) {
  const m = new Uint8Array(nx * ny);
  if (!punkte || punkte.length < 2) return m;
  const sx = (nx - 1) / (rect.E1 - rect.E0), sy = (ny - 1) / (rect.N1 - rect.N0);
  const r2 = radius * radius;
  const punkt = (x, y) => {
    for (let j = Math.floor(y - radius); j <= Math.ceil(y + radius); j++) {
      if (j < 0 || j >= ny) continue;
      for (let i = Math.floor(x - radius); i <= Math.ceil(x + radius); i++) {
        if (i < 0 || i >= nx) continue;
        if ((i - x) ** 2 + (j - y) ** 2 <= r2) m[j * nx + i] = 1;
      }
    }
  };
  for (let k = 0; k < punkte.length - 1; k++) {
    const ax = (punkte[k][0] - rect.E0) * sx, ay = (punkte[k][1] - rect.N0) * sy;
    const bx = (punkte[k + 1][0] - rect.E0) * sx, by = (punkte[k + 1][1] - rect.N0) * sy;
    // beide Enden weit draussen: Segment auslassen, ausser es kreuzt das Raster
    const draussen = (x, y) => x < -radius || y < -radius || x > nx - 1 + radius || y > ny - 1 + radius;
    if (draussen(ax, ay) && draussen(bx, by) && (Math.max(ax, bx) < 0 || Math.min(ax, bx) > nx - 1 || Math.max(ay, by) < 0 || Math.min(ay, by) > ny - 1)) continue;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
    for (let t = 0; t <= n; t++) punkt(ax + (bx - ax) * t / n, ay + (by - ay) * t / n);
  }
  return m;
}
