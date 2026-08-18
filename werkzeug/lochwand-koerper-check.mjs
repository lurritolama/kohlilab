// Prueft jeden Teilkoerper einer Familie einzeln auf Geschlossenheit
// (jede Kante genau zweimal, entgegengesetzt) und signiertes Volumen.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
const threeUrl = pathToFileURL(path.resolve('public/vendor/three/three.module.js')).href;
const dir = mkdtempSync(path.join(tmpdir(), 'lw-'));
for (const n of ['raster', 'haken', 'module', 'preis']) {
  writeFileSync(path.join(dir, n + '.js'), readFileSync('public/lochwand-app/' + n + '.js', 'utf-8').replace(/from 'three'/g, "from '" + threeUrl + "'"));
}
const M = await import(pathToFileURL(path.join(dir, 'module.js')).href);
const fam = M.familie(process.argv[2] || 'wanne');
const params = { ...M.startParameter(fam), ...(process.argv[3] ? JSON.parse(process.argv[3]) : {}) };
const geos = fam.geometrie(params);
geos.forEach((g, i) => {
  const ng = g.index ? g.toNonIndexed() : g; const a = ng.attributes.position.array;
  const key = (j) => a[j].toFixed(3) + ',' + a[j + 1].toFixed(3) + ',' + a[j + 2].toFixed(3);
  const kanten = new Map(); let vol = 0, degen = 0, n = 0;
  for (let t = 0; t < a.length; t += 9) {
    const k = [key(t), key(t + 3), key(t + 6)];
    if (k[0] === k[1] || k[1] === k[2] || k[0] === k[2]) { degen++; continue; }
    n++;
    for (let e = 0; e < 3; e++) { const kk = k[e] + '|' + k[(e + 1) % 3]; kanten.set(kk, (kanten.get(kk) || 0) + 1); }
    const [x1, y1, z1, x2, y2, z2, x3, y3, z3] = [...a.slice(t, t + 9)];
    vol += (x1 * (y2 * z3 - y3 * z2) - x2 * (y1 * z3 - y3 * z1) + x3 * (y1 * z2 - y2 * z1)) / 6;
  }
  let offen = 0, doppelt = 0;
  for (const [k, c] of kanten) { const [p, q] = k.split('|'); const gegen = kanten.get(q + '|' + p) || 0; if (gegen === 0) offen++; if (c > 1) doppelt++; }
  console.log(`Koerper ${i}: ${n} Dreiecke, ${degen} degeneriert, Vol ${vol.toFixed(1)}, offene Kanten ${offen}, mehrfach ${doppelt}`);
});

// Etikett (Beschriftung) pruefen — im Node gibt es kein Canvas, deshalb
// eine Schachbrett-Testmaske; es geht um Windung und Geschlossenheit.
globalThis.__testMaske = (txt, hMm, res) => { const cols = Math.round(hMm * 0.6 * txt.length / res), rows = Math.round(hMm / res); return { cols, rows, res, w: cols * res, h: rows * res, drin: (i, j) => (i + j) % 2 === 0 }; };
function pruefeKoerper(name, geo, extra) {
  const a = geo.attributes.position.array;
  const key = (j) => a[j].toFixed(3) + ',' + a[j + 1].toFixed(3) + ',' + a[j + 2].toFixed(3);
  const kanten = new Map(); let vol = 0, n = 0;
  for (let t = 0; t < a.length; t += 9) {
    const k = [key(t), key(t + 3), key(t + 6)]; n++;
    for (let e = 0; e < 3; e++) { const kk = k[e] + '|' + k[(e + 1) % 3]; kanten.set(kk, (kanten.get(kk) || 0) + 1); }
    const [x1, y1, z1, x2, y2, z2, x3, y3, z3] = [...a.slice(t, t + 9)];
    vol += (x1 * (y2 * z3 - y3 * z2) - x2 * (y1 * z3 - y3 * z1) + x3 * (y1 * z2 - y2 * z1)) / 6;
  }
  let offen = 0; for (const [k] of kanten) { const [p, q] = k.split('|'); if (!kanten.get(q + '|' + p)) offen++; }
  console.log(`${name}: ${n} Dreiecke, Vol ${vol.toFixed(2)}, offene Kanten ${offen}${extra || ''}`);
}
const sc = M.schild(fam, params, 'TEST', 0, '#1c1c1c', '#eceff0');
if (sc) pruefeKoerper('Schild', sc.geo, `, Schrift ${sc.groesse} mm, ${sc.breite.toFixed(1)} x ${sc.hoehe.toFixed(1)} mm`); else console.log('Schild: keins');
const et = M.etikett(fam, params, 'TEST', 0, '#1c1c1c', '#ef7d1a');
if (et) {
  const a = et.geo.attributes.position.array;
  const key = (j) => a[j].toFixed(3) + ',' + a[j + 1].toFixed(3) + ',' + a[j + 2].toFixed(3);
  const kanten = new Map(); let vol = 0, n = 0;
  for (let t = 0; t < a.length; t += 9) {
    const k = [key(t), key(t + 3), key(t + 6)]; n++;
    for (let e = 0; e < 3; e++) { const kk = k[e] + '|' + k[(e + 1) % 3]; kanten.set(kk, (kanten.get(kk) || 0) + 1); }
    const [x1, y1, z1, x2, y2, z2, x3, y3, z3] = [...a.slice(t, t + 9)];
    vol += (x1 * (y2 * z3 - y3 * z2) - x2 * (y1 * z3 - y3 * z1) + x3 * (y1 * z2 - y2 * z1)) / 6;
  }
  let offen = 0; for (const [k] of kanten) { const [p, q] = k.split('|'); if (!kanten.get(q + '|' + p)) offen++; }
  console.log(`Etikett: ${n} Dreiecke, Vol ${vol.toFixed(2)}, offene Kanten ${offen}, Schrift ${et.groesse} mm, Farben ${new Set(et.farben).size}`);
} else console.log('Etikett: keins (kein Platz oder keine Flaeche)');
