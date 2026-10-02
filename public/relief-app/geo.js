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
const IDENTIFY = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify';

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
 * klein (bei 10 km Kante liest jede Kachel nur ~60x60 Pixel).
 *
 * Alle Kacheln werden zu EINEM Mosaik zusammengesetzt und erst darauf
 * bilinear abgetastet. Frueher interpolierte jede Kachel fuer sich: Punkte
 * im halben Pixel am Kachelrand lasen ihren Wert um ein ganzes Pixel
 * versetzt — im Relief lagen Grate und Rillen auf dem 1-km-Raster
 * (Analyse 02.10.2026: Kruemmung dort 3–7x hoeher als im Rest).
 *
 * fortschritt(anzahlFertig, anzahlTotal) optional.
 */
export async function hoehenRaster(rect, nx, ny, o = {}) {
  const dE = (rect.E1 - rect.E0) / (nx - 1), dN = (rect.N1 - rect.N0) / (ny - 1);
  const ziel = Math.min(dE, dN);
  const aufl = ziel < 1.6 ? '0.5' : '2';
  const liste = await kacheln(rect, 'ch.swisstopo.swissalti3d', aufl, o.signal);
  if (liste.length === 0) throw new Error('Für diesen Ausschnitt gibt es kein Höhenmodell — er liegt ausserhalb der Schweiz.');
  let fertig = 0;
  const GT = window.GeoTIFF;
  const stuecke = new Map();                      // "E-N" -> { px0, py0, fw, fh, band, nodata }
  let W0 = 0;                                     // Pixel je Kachelseite auf der gewaehlten Stufe
  const warteschlange = liste.slice();
  const arbeiter = async () => {
    while (warteschlange.length) {
      const k = warteschlange.shift();
      const tiff = await GT.fromUrl(k.url, { allowFullFile: false, cache: true, blockSize: 65536 });
      const n = await tiff.getImageCount();
      // Stufe waehlen: groesste Pixelgroesse <= ziel. Overviews tragen keine
      // eigenen Geo-Schluessel — Aufloesung ueber das Breitenverhaeltnis.
      const img0 = await tiff.getImage(0);
      const res0 = Math.abs(img0.getResolution()[0]);
      let img = img0, res = res0;
      for (let s = 1; s < n; s++) {
        const cand = await tiff.getImage(s); const r = res0 * img0.getWidth() / cand.getWidth();
        if (r <= ziel * 1.001) { img = cand; res = r; } else break;
      }
      const W = img.getWidth(), H = img.getHeight();
      if (!W0) W0 = W;
      if (W !== W0) { fertig++; continue; }       // andere Pixelzahl (kommt nicht vor) — Kachel auslassen
      // Schnitt Kachel x Rechteck, 2 Pixel Rand fuer die Interpolation
      const rand = 2 * res;
      const e0 = Math.max(rect.E0 - rand, k.E), e1 = Math.min(rect.E1 + rand, k.E + 1000);
      const n0 = Math.max(rect.N0 - rand, k.N), n1 = Math.min(rect.N1 + rand, k.N + 1000);
      if (e1 <= e0 || n1 <= n0) { fertig++; continue; }
      const px0 = Math.max(0, Math.floor((e0 - k.E) / res)), px1 = Math.min(W, Math.ceil((e1 - k.E) / res));
      const py0 = Math.max(0, Math.floor((k.N + 1000 - n1) / res)), py1 = Math.min(H, Math.ceil((k.N + 1000 - n0) / res));
      if (px1 <= px0 || py1 <= py0) { fertig++; continue; }
      const [band] = await img.readRasters({ window: [px0, py0, px1, py1], samples: [0], signal: o.signal });
      stuecke.set(`${k.E}-${k.N}`, { px0, py0, fw: px1 - px0, fh: py1 - py0, band, nodata: img0.getGDALNoData() });
      fertig++;
      if (o.fortschritt) o.fortschritt(fertig, liste.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, liste.length) }, arbeiter));
  if (!W0) throw new Error('Keine Höhendaten im Ausschnitt.');
  // Mosaik: globale Pixelspalte gx = (E - E00) / res, Zeile gy = (N11 - N) / res
  const res = 1000 / W0;
  const E00 = Math.floor(rect.E0 / 1000) * 1000 - 1000, N11 = Math.ceil(rect.N1 / 1000) * 1000 + 1000;
  const wert = (gx, gy) => {
    const ti = Math.floor(gx / W0), tj = Math.floor(gy / W0);
    const st = stuecke.get(`${E00 + ti * 1000}-${N11 - (tj + 1) * 1000}`);
    if (!st) return NaN;
    const lx = gx - ti * W0 - st.px0, ly = gy - tj * W0 - st.py0;
    if (lx < 0 || ly < 0 || lx >= st.fw || ly >= st.fh) return NaN;
    const v = st.band[ly * st.fw + lx];
    return (v === st.nodata || v < -100 || !Number.isFinite(v)) ? NaN : v;
  };
  const h = new Float32Array(nx * ny).fill(NaN);
  for (let j = 0; j < ny; j++) {
    const fy = (N11 - (rect.N0 + j * dN)) / res - 0.5;          // Pixelmitte = +0.5
    const y0 = Math.floor(fy), ty = fy - y0;
    for (let i = 0; i < nx; i++) {
      const fx = (rect.E0 + i * dE - E00) / res - 0.5;
      const x0 = Math.floor(fx), tx = fx - x0;
      const a = wert(x0, y0), b = wert(x0 + 1, y0), c = wert(x0, y0 + 1), d = wert(x0 + 1, y0 + 1);
      let v;
      if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) {
        const g = [a, b, c, d].filter((q) => !Number.isNaN(q)); v = g.length ? g.reduce((s, q) => s + q, 0) / g.length : NaN;
      } else v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      h[j * nx + i] = v;
    }
  }
  // Loecher (Landesgrenze, fehlende Kachel): auf den tiefsten bekannten Wert
  let min = Infinity, fehlt = 0;
  for (let k = 0; k < h.length; k++) { if (Number.isNaN(h[k])) fehlt++; else if (h[k] < min) min = h[k]; }
  if (fehlt === h.length) throw new Error('Keine Höhendaten im Ausschnitt.');
  if (fehlt) for (let k = 0; k < h.length; k++) if (Number.isNaN(h[k])) h[k] = min;
  return { h, fehlt, aufl, kacheln: liste.length, quellRes: res };
}

// ---------- WMS-Masken ----------
/**
 * Flaechenmasken aus EINEM WMS-Bild, getrennt nach Pixelfarbe:
 *   filter = { name: (r, g, b, a) => bool, … }
 * Rueckgabe je Name ein Uint8Array nx*ny mit der ABDECKUNG 0..255 am
 * Rasterpunkt (Zeile 0 = Sueden), nicht mehr nur 0/1: das Bild wird
 * `ueber`-fach feiner geholt und gemittelt, Kantenpixel zaehlen nach ihrer
 * Deckkraft. Die BBOX ist um eine halbe Zelle erweitert, damit die
 * Pixelmitten genau auf den Rasterpunkten des Hoehenmodells liegen
 * (vorher bis zu einer halben Zelle Versatz zum Rand hin).
 */
export async function wmsMasken(rect, nx, ny, layer, filter, signal, ueber = 3) {
  const s = Math.max(1, Math.min(ueber, Math.floor(2000 / Math.max(nx, ny))));
  const dE = (rect.E1 - rect.E0) / (nx - 1), dN = (rect.N1 - rect.N0) / (ny - 1);
  const w = nx * s, hh = ny * s;
  const url = `${WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer}&STYLES=&CRS=EPSG:2056` +
    `&BBOX=${rect.E0 - dE / 2},${rect.N0 - dN / 2},${rect.E1 + dE / 2},${rect.N1 + dN / 2}&WIDTH=${w}&HEIGHT=${hh}&FORMAT=image/png&TRANSPARENT=true`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`WMS ${layer}: ${r.status}`);
  const bmp = await createImageBitmap(await r.blob());
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = false;
  x.drawImage(bmp, 0, 0, w, hh);
  const d = x.getImageData(0, 0, w, hh).data;
  const namen = Object.keys(filter);
  const summe = namen.map(() => new Uint32Array(nx * ny));
  for (let py = 0; py < hh; py++) {
    const j = ny - 1 - Math.floor(py / s);                       // Bildzeile 0 = Norden
    for (let px = 0; px < w; px++) {
      const o = (py * w + px) * 4, a = d[o + 3];
      if (a < 8) continue;
      const k = j * nx + Math.floor(px / s);
      for (let q = 0; q < namen.length; q++) if (filter[namen[q]](d[o], d[o + 1], d[o + 2], a)) summe[q][k] += a;
    }
  }
  const aus = {};
  namen.forEach((n, q) => {
    const m = new Uint8Array(nx * ny), t = summe[q], div = s * s;
    for (let k = 0; k < m.length; k++) m[k] = Math.min(255, Math.round(t[k] / div));
    aus[n] = m;
  });
  return aus;
}
export async function wmsMaske(rect, nx, ny, layer, signal) {
  return (await wmsMasken(rect, nx, ny, layer, { alle: () => true }, signal)).alle;
}
export const LAYER = {
  wald: 'ch.swisstopo.swisstlm3d-wald',                 // Waldflaeche swissTLM3D (offizielle Abgrenzung)
  seen: 'ch.swisstopo.swisstlm3d-gewaessernetz',        // nur die Seeflaechen daraus
  primaer: 'ch.swisstopo.vec25-primaerflaechen',        // Bodenbedeckung 1:25'000: Fels, Geroell, Gletscher, Gewaesserflaeche
  gebaeude: 'ch.swisstopo.vec25-gebaeude',
  strahler: 'ch.bafu.flussordnungszahlen-strahler',     // Gewaessernetz mit Flussordnung (Vektor)
};
// Farben gemessen (02.10.2026). Gewaessernetz: Seen als Flaeche (158,186,255);
// die Linien dort (Baeche, Seeufer, Dolen, Druckleitungen) braucht es nicht
// mehr. VECTOR25 Primaerflaechen zeichnet jede Bodenbedeckung in EINER
// Farbe: Fels und Geroell (210,210,210), Gletscher/Firn (240,255,255),
// Gewaesserflaeche — auch breite Fluesse wie Thur oder Sitter — (82,209,255).
const nah = (r, g, b, R, G, B, t) => Math.abs(r - R) <= t && Math.abs(g - G) <= t && Math.abs(b - B) <= t;
export const SEEN_FILTER = { seen: (r, g, b) => r > 130 && r < 185 && g > 160 && g < 210 && b > 230 };
export const PRIMAER_FILTER = {
  fels: (r, g, b) => nah(r, g, b, 210, 210, 210, 12),
  gletscher: (r, g, b) => nah(r, g, b, 240, 255, 255, 8) && r < 250,
  wasser: (r, g, b) => nah(r, g, b, 82, 209, 255, 30),
};

// ---------- Gewaessernetz (Vektor) ----------
/**
 * Fliessgewaesser im Rechteck als Linien mit Flussordnung nach Strahler
 * (BAFU, aus dem Gewaessernetz 1:25'000). Das Netz ist durchgehend — auch
 * eingedolte Abschnitte sind drin. Darum beginnt kein Bach mehr mitten im
 * Gelaende: unterhalb eines Bachs der Ordnung k liegt immer Ordnung >= k,
 * und die Laenge bis zur Quelle waechst talwaerts.
 * Rueckgabe [{ o: Ordnung, l: Laenge bis zur Quelle (m), p: [[E,N],…] }].
 */
export async function gewaesserLinien(rect, signal) {
  const g = `${rect.E0},${rect.N0},${rect.E1},${rect.N1}`;
  const aus = [], ids = new Set();
  for (let off = 0; off < 20000; off += 200) {
    const url = `${IDENTIFY}?geometryType=esriGeometryEnvelope&geometry=${g}&imageDisplay=1000,1000,96&mapExtent=${g}` +
      `&tolerance=0&layers=all:${LAYER.strahler}&sr=2056&geometryFormat=geojson&returnGeometry=true&limit=200&offset=${off}`;
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`Gewässernetz: ${r.status}`);
    const res = (await r.json()).results || [];
    for (const f of res) {
      if (ids.has(f.id)) continue; ids.add(f.id);
      const pr = f.properties || {}, geo = f.geometry || {};
      const linien = geo.type === 'LineString' ? [geo.coordinates] : geo.type === 'MultiLineString' ? geo.coordinates : [];
      for (const p of linien) if (p.length >= 2) aus.push({ o: +pr.floz || 0, l: +pr.main_len || 0, p });
    }
    if (res.length < 200) break;
  }
  return aus;
}

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
