// Pruefstand fuer die Relief-Geometrie (public/relief-app/mesh.js): baut ein
// synthetisches Gelaende mit allen Farbklassen und Praegung, prueft
// Wasserdichtheit und Volumen und misst die 3MF-Groesse (Grenze: 4.5 MB je
// Bestellung als Base64, siehe checkout.astro).
//
//   node werkzeug/relief-check.mjs             Pruefung
//   node werkzeug/relief-check.mjs --schreibe  zusaetzlich Test-3MF nach
//                                              Projekt-Daten/kohlilab-relief
import { zipSync, strToU8 } from 'fflate';
import { mkdirSync, writeFileSync } from 'node:fs';
import { reliefMesh, praegungAus, pruefe, modelXml, farbklassen, linienZellen, waehleBaeche, bachBreite, bereinige, zellMaske, gauss, KLASSEN, CONTENT_TYPES, RELS } from '../public/relief-app/mesh.js';

// --- Baeche als Vektorlinien, Auswahl, Bereinigung (Neubau 02.10.2026) ------
{
  // Linie schraeg durchs Raster, 1.2 mm breit bei 0.56 mm Zellen: lueckenlos, 2–3 Zellen breit
  const nx = 200, ny = 200, pitch = 0.56, rect = { E0: 0, E1: 1990, N0: 0, N1: 1990 };
  const m = linienZellen([{ p: [[100, 300], [1900, 1500]] }], rect, nx, ny, pitch, () => 1.2);
  let luecken = 0, maxB = 0;
  for (let ci = 12; ci < 185; ci++) { let c = 0; for (let cj = 0; cj < ny - 1; cj++) c += m[cj * (nx - 1) + ci]; if (!c) luecken++; maxB = Math.max(maxB, c); }
  const okL = luecken === 0 && maxB >= 2 && maxB <= 5;
  console.log(`${okL ? 'OK ' : 'FEHLER'} Bachlinie: ${luecken} Spalten ohne Linie, Breite bis ${maxB} Zellen`);
  if (!okL) process.exitCode = 1;
  // Auswahl: Lauflaenge bis zur Quelle (waechst talwaerts) und Ordnung
  const L = [{ o: 1, l: 300 }, { o: 1, l: 900 }, { o: 2, l: 1500 }, { o: 5, l: 30000 }];
  const okW = waehleBaeche(L, 600).length === 3 && waehleBaeche(L, 0, 4).length === 1 && bachBreite(5, 1.2) > bachBreite(1, 1.2) && bachBreite(1, 1.2) === 1.2;
  console.log(`${okW ? 'OK ' : 'FEHLER'} Bachauswahl nach Lauflaenge/Ordnung, Breite nach Ordnung`);
  if (!okW) process.exitCode = 1;
  // Bereinigung: grosser Block bleibt, 1-Zellen-Streifen, Einzelzelle und 1-Zellen-Loch weg
  const w = 60, h = 60, q = new Uint8Array(w * h);
  for (let y = 10; y < 40; y++) for (let x = 10; x < 40; x++) q[y * w + x] = 1;
  q[25 * w + 25] = 0;                                         // Loch
  for (let x = 40; x < 55; x++) q[20 * w + x] = 1;            // Zipfel 1 Zelle breit
  q[50 * w + 50] = 1;                                         // Einzelzelle
  const r = bereinige(q, w, h, 1, 10, 0.6);
  const okB = r[25 * w + 25] === 1 && r[20 * w + 50] === 0 && r[50 * w + 50] === 0 && r[30 * w + 30] === 1;
  console.log(`${okB ? 'OK ' : 'FEHLER'} Bereinigung: Loch zu ${r[25 * w + 25] === 1}, Zipfel weg ${r[20 * w + 50] === 0}, Einzelzelle weg ${r[50 * w + 50] === 0}`);
  if (!okB) process.exitCode = 1;
  // Zellmaske: halbe Abdeckung an der Kante blaeht nicht auf (alte Regel: +1 Zelle)
  const sx = 101, cov = new Uint8Array(sx * sx); for (let j = 0; j < sx; j++) for (let i = 0; i < 50; i++) cov[j * sx + i] = 255;
  const zm = zellMaske(cov, sx, sx, 101, 101); let anteil = 0; for (const v of zm) anteil += v; anteil /= zm.length;
  const okZ = Math.abs(anteil - 0.5) < 0.02;
  console.log(`${okZ ? 'OK ' : 'FEHLER'} Zellmaske ohne Aufblaehen: Anteil ${anteil.toFixed(3)} (soll 0.49–0.50)`);
  if (!okZ) process.exitCode = 1;
  // Gauss: Ebene bleibt Ebene (auch am Rand)
  const g = gauss(new Float32Array(50 * 40).fill(7), 50, 40, 1.5); let dmax = 0; for (const v of g) dmax = Math.max(dmax, Math.abs(v - 7));
  console.log(`${dmax < 1e-4 ? 'OK ' : 'FEHLER'} Gauss erhaelt Ebenen (Abweichung ${dmax.toExponential(1)})`);
  if (dmax >= 1e-4) process.exitCode = 1;
}

function gelaende(nx, ny) {
  const h = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u = i / (nx - 1), v = j / (ny - 1);
    let z = 600 + 900 * Math.exp(-((u - 0.6) ** 2 + (v - 0.55) ** 2) * 14) + 120 * Math.sin(u * 17) * Math.cos(v * 11);
    if (Math.hypot(u - 0.2, v - 0.25) < 0.12) z = 520;      // See: flach
    h[j * nx + i] = z;
  }
  return h;
}
function bau(nx, ny, W, sockel, mitSchrift) {
  const pitch = W / (nx - 1);
  const hM = gelaende(nx, ny);
  let hmin = Infinity; for (const v of hM) if (v < hmin) hmin = v;
  const kmM = 2000, mmJeM = W / kmM;
  const z = new Float32Array(nx * ny);
  for (let k = 0; k < z.length; k++) z[k] = sockel + (hM[k] - hmin) * mmJeM * 1.5;
  // Zellmasken (nx-1)*(ny-1): Wald, See, Gebaeude, Route, Fels, Gletscher
  const w = nx - 1, hh = ny - 1, Z = () => new Uint8Array(w * hh);
  const zm = { wald: Z(), seen: Z(), gebaeude: Z(), route: Z(), fels: Z(), gletscher: Z() };
  for (let cj = 0; cj < hh; cj++) for (let ci = 0; ci < w; ci++) {
    const u = (ci + 0.5) / w, v = (cj + 0.5) / hh, k = cj * w + ci;
    if (u > 0.4 && u < 0.7 && v < 0.4) zm.wald[k] = 1;
    if (Math.hypot(u - 0.2, v - 0.25) < 0.12) zm.seen[k] = 1;
    if (u > 0.1 && u < 0.14 && v > 0.6 && v < 0.64) zm.gebaeude[k] = 1;
    if (Math.abs(v - 0.8) < 0.01) zm.route[k] = 1;
    if (u > 0.55 && u < 0.65 && v > 0.5 && v < 0.6) zm.fels[k] = 1;
    if (Math.hypot(u - 0.6, v - 0.55) < 0.04) zm.gletscher[k] = 1;
  }
  const klasse = farbklassen({ nx, ny, pitch, hM, z: zm, an: { wald: 1, wasser: 1, fels: 1, schnee: 1, gebaeude: 1, route: 1 }, schnee: 1350 });
  const reihen = []; for (let zz = 1.0; zz <= sockel - 1.0 + 1e-9; zz += 0.3) reihen.push(+zz.toFixed(3));
  let praegung = null;
  if (mitSchrift) {
    // heute: Tasche fuer das separat gedruckte Schild (nach INNEN, 1.4 mm)
    // ueber die mittleren 60 % der Vorderkante und die Reihen 2..R-1
    const zellen = reihen.map((zz, r) => { const row = new Uint8Array(nx); if (r >= 1 && r < reihen.length - 1) for (let i = Math.round(nx * 0.2); i < Math.round(nx * 0.8); i++) row[i] = 1; return row; });
    praegung = praegungAus(zellen, -1.4, null);
  }
  return reliefMesh({ nx, ny, pitch, z, klasse, sockel: 0, reihen, praegung });
}
function dreiMF(mesh) {
  const xml = modelXml([{ name: 'Relief', mesh, palette: ['#C8C2A0', '#3E7A4C', '#2A6F97', '#7A7E7A', '#FBFBF9', '#B04A3A', '#E63946'] }]);
  return zipSync({ '[Content_Types].xml': strToU8(CONTENT_TYPES), '_rels/.rels': strToU8(RELS), '3D/3dmodel.model': strToU8(xml) }, { level: 9 });
}
const faelle = [
  ['klein 40x30 ohne Schrift', () => bau(40, 30, 100, 5, false)],
  ['klein 40x30 mit Schrift', () => bau(40, 30, 100, 5, true)],
  ['mittel 200x150 mit Schrift', () => bau(200, 150, 180, 6, true)],
  ['druck 346x346 mit Schrift', () => bau(346, 346, 200, 6, true)],
];
let letztes = null;
for (const [name, fn] of faelle) {
  const mesh = fn();
  const p = pruefe(mesh);
  const ok = p.geschlossen && p.volumenMm3 > 0;
  console.log(`${ok ? 'OK ' : 'FEHLER'} ${name.padEnd(30)} ${String(p.dreiecke).padStart(7)} Dreiecke  ${(p.volumenMm3 / 1000).toFixed(1).padStart(7)} cm³  offen ${p.offen} doppelt ${p.doppelt}`);
  if (!ok) process.exitCode = 1;
  letztes = mesh;
}
const z = dreiMF(letztes);
console.log(`3MF (druck): ${(z.length / 1e6).toFixed(2)} MB, als Base64 ${(z.length * 4 / 3 / 1e6).toFixed(2)} MB (Grenze 4.5)`);
if (process.argv.includes('--schreibe')) {
  const dir = 'C:/Users/Allgemein/Projekt-Daten/kohlilab-relief';
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/relief-test.3mf`, z);
  console.log(`geschrieben: ${dir}/relief-test.3mf`);
}
