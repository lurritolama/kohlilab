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
import { reliefMesh, praegungAus, pruefe, modelXml, klassifiziere, CONTENT_TYPES, RELS } from '../public/relief-app/mesh.js';

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
  const masken = { wald: new Uint8Array(nx * ny), wasser: new Uint8Array(nx * ny), gebaeude: new Uint8Array(nx * ny), route: new Uint8Array(nx * ny) };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u = i / (nx - 1), v = j / (ny - 1), k = j * nx + i;
    if (u > 0.4 && u < 0.7 && v < 0.4) masken.wald[k] = 1;
    if (Math.hypot(u - 0.2, v - 0.25) < 0.12) masken.wasser[k] = 1;
    if (u > 0.1 && u < 0.14 && v > 0.6 && v < 0.64) masken.gebaeude[k] = 1;
    if (Math.abs(v - 0.8) < 0.01) masken.route[k] = 1;
  }
  const klasse = klassifiziere({ nx, ny, hM, zellM: kmM / (nx - 1), masken, an: { wald: 1, wasser: 1, fels: 1, schnee: 1, gebaeude: 1, route: 1 }, schnee: 1350, fels: 35 });
  const reihen = []; for (let zz = 1.0; zz <= sockel - 1.0 + 1e-9; zz += 0.3) reihen.push(+zz.toFixed(3));
  let praegung = null;
  if (mitSchrift) {
    const zellen = reihen.map((zz, r) => { const row = new Uint8Array(nx); for (let i = 6; i < nx - 6; i++) if (((i >> 2) + r) % 3 === 0) row[i] = 1; return row; });
    praegung = praegungAus(zellen, 0.6, null);
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
