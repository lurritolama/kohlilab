// Prüfstand für die Küchenschrank-Einsätze (public/schrank-app/geometrie.js):
// Aufteilung nach der Alters-Regel, Druckteile (Schwalbenschwanz-Nuten und
// -Leisten, Steckkreuze, Bodenleisten, Beschriftung), Teilung grosser Platten
// in Stücke mit Puzzle-Zapfen und die optionale Bodenplatte — jede Schale
// geschlossen, Volumen positiv, jedes Stück passt aufs Bett.
//
//   node werkzeug/schrank-check.mjs            Prüfung
//   node werkzeug/schrank-check.mjs <ordner>   zusätzlich Test-3MFs dorthin schreiben
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { pruefe, modelXml, CONTENT_TYPES, RELS } from '../public/schrank-app/dreimf.js';
import { aufteilung, teilMesh, bodenMesh, verschoben, teilLage, gruppen, BETT } from '../public/schrank-app/geometrie.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const THREE = await import(pathToFileURL(path.join(root, 'public/vendor/three/three.module.js')).href);
const triangulate = (outer, holes) => THREE.ShapeUtils.triangulateShape(outer.map((p) => new THREE.Vector2(p[0], p[1])), holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1]))));
const ziel = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (ziel) fs.mkdirSync(ziel, { recursive: true });

const FARBEN = { trenn: '#ef7d1a', text: '#1c1c1c', boden: '#c9cfd2' };
let fehler = 0;
function melde(name, mesh, erwartetVol) {
  const p = pruefe(mesh);
  const ok = p.geschlossen && p.volumenMm3 > 0 && (erwartetVol == null || Math.abs(p.volumenMm3 - erwartetVol) / erwartetVol < 0.02);
  if (!ok) fehler++;
  console.log(`${ok ? 'OK    ' : 'FEHLER'} ${name.padEnd(58)} ${String(p.dreiecke).padStart(5)} Dreiecke ${(p.volumenMm3 / 1000).toFixed(2).padStart(7)} cm³  offen ${p.offen} doppelt ${p.doppelt}`);
  return p;
}
// Passt das Stück aufs Bett (drehbar)?
function bettOk(mesh) {
  const p = mesh.pos; let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
  for (let i = 0; i < p.length; i += 3) { mnx = Math.min(mnx, p[i]); mxx = Math.max(mxx, p[i]); mny = Math.min(mny, p[i + 1]); mxy = Math.max(mxy, p[i + 1]); }
  const a = mxx - mnx, b = mxy - mny;
  return (a <= BETT.x + 8 && b <= BETT.y + 8) || (a <= BETT.y + 8 && b <= BETT.x + 8);   // +8: Zapfen ragen über die Naht
}
function dreiMF(koerper, datei) {
  const xml = modelXml(koerper, 'KohliLab Schrank-Einsatz');
  const zip = zipSync({ '[Content_Types].xml': strToU8(CONTENT_TYPES), '_rels/.rels': strToU8(RELS), '3D/3dmodel.model': strToU8(xml) }, { level: 9 });
  fs.writeFileSync(datei, zip);
  console.log(`      → ${path.basename(datei)} (${(zip.length / 1024).toFixed(0)} kB)`);
}
function fall(name, P, trenn, dateiName, texte) {
  const A = aufteilung(P, trenn);
  console.log(`\n${name}: ${A.faecher.length} Fächer · ${A.waende.length} Wände → ${A.teile.length} Teile · ${gruppen(A)} Gruppe(n) · ungültig ${A.ungueltig.length}`);
  const koerper = []; let dx = 0;
  for (const t of A.teile) {
    const tx = texte && texte[t.id] ? [{ laeufe: texte[t.id] }] : [];
    const m = teilMesh(P, A, t, triangulate, FARBEN, tx);
    const n = m.stuecke.length;
    const info = `${t.dir} c=${t.c} L=${m.L.toFixed(0)} th=${m.th} Leisten ${m.leisten.map((x) => (x ? 'S' : '-')).join('')} Nuten ${t.nuten.length} Kreuz ${t.kreuz.length}/${t.schlitzeOben.length}${m.bodenLeiste ? ' Boden' : ''}${n > 1 ? ` · ${n} Stücke (Nähte x ${m.naehte.x.map((x) => x.toFixed(0)).join(',')} y ${m.naehte.y.map((y) => y.toFixed(0)).join(',')})` : ''}`;
    console.log(`  Teil ${t.id} ${info}`);
    m.stuecke.forEach((st, i) => {
      melde(`    Stück ${i + 1}/${n} [${st.xa.toFixed(0)}–${st.xb.toFixed(0)}]×[${st.ya.toFixed(0)}–${st.yb.toFixed(0)}]`, st.mesh, st.mesh.volMm3);
      if (!bettOk(st.mesh)) { console.log('FEHLER: Stück passt nicht aufs Bett'); fehler++; }
      koerper.push({ name: `Trennwand ${t.id}${n > 1 ? ` Stück ${i + 1}/${n}` : ''}`, mesh: verschoben(st.mesh, dx - st.xa, -st.ya, 0) }); dx += (st.xb - st.xa) + 14;
    });
  }
  let boden = null;
  if (P.boden) {
    boden = bodenMesh(P, A, triangulate, FARBEN.boden);
    boden.stuecke.forEach((st, i) => { melde(`  Bodenplatte Stück ${i + 1}/${boden.stuecke.length} ${P.b}×${P.t}×${P.bodenDicke} Nuten ${P.bodenNuten}`, st.mesh, st.mesh.volMm3); if (!bettOk(st.mesh)) { console.log('FEHLER: Bodenstück passt nicht aufs Bett'); fehler++; } });
  }
  if (ziel && dateiName) {
    if (koerper.length) dreiMF(koerper, path.join(ziel, `${dateiName}-trennwaende.3mf`));
    if (boden) dreiMF(boden.stuecke.map((st, i) => ({ name: `Bodenplatte${boden.stuecke.length > 1 ? ` Stück ${i + 1}` : ''}`, mesh: st.mesh })), path.join(ziel, `${dateiName}-boden.3mf`));
  }
  return A;
}
let id = 0;
const neu = (dir, c, m) => ({ id: ++id, dir, c, m });
const P0 = { b: 250, t: 250, h: 80, ts: 5, boden: false, bodenDicke: 3, bodenNuten: 'v' };

// Fall 1: T-Stösse — ältere quer, drei längs enden daran
{
  const A = fall('T-Stösse', P0, [neu('h', 0, 0), neu('v', -60, -60), neu('v', 40, -60), neu('v', -20, 60)], 'schrank-t');
  if (A.teile.length !== 4 || A.teile[0].nuten.length !== 3) { console.log('FEHLER: 4 Teile, 3 Nuten in der Querwand erwartet'); fehler++; }
}
// Fall 2: Steckkreuz
{
  const A = fall('Steckkreuz', P0, [neu('h', 0, 0), neu('v', 0, -60), neu('v', 0, 60)], 'schrank-kreuz');
  if (A.teile.length !== 2 || A.teile[0].schlitzeOben.length !== 1 || A.teile[1].kreuz.length !== 1 || gruppen(A) !== 1) { console.log('FEHLER Steckkreuz'); fehler++; }
}
// Fall 3: Raster 3×3 mit Bodenplatte + Beschriftung
{
  const P = { ...P0, boden: true };
  const trenn = [neu('h', -40, 0), neu('h', 40, 0)];
  for (const c of [-40, 40]) for (const m of [-90, 0, 90]) trenn.push(neu('v', c, m));
  const A = fall('Raster 3×3 + Boden', P, trenn, 'schrank-3x3', { 1: laufBlock(-20, 30, 24, 7, 0.4) });
  if (A.teile.length !== 4) { console.log('FEHLER: 4 Teile erwartet'); fehler++; }
}
// Fall 4: Kollision + lose Gruppen
{
  if (aufteilung(P0, [neu('v', 20, 0), neu('v', 20, 0)]).ungueltig.length !== 1) { console.log('FEHLER Kollision'); fehler++; }
  if (gruppen(aufteilung(P0, [neu('v', -40, 0), neu('v', 40, 0)])) !== 2) { console.log('FEHLER lose Gruppen'); fehler++; }
  console.log('\nKollision + lose Gruppen: OK');
}
// Fall 5: GROSS — 450×350×350 mit Bodenplatte quer: Spalten- UND Reihenteilung, Bodenplatte gekachelt
{
  const P = { ...P0, b: 450, t: 350, h: 350, boden: true, bodenDicke: 4, bodenNuten: 'h' };
  const trenn = [neu('h', 0, 0), neu('v', -100, -80), neu('v', -100, 80), neu('v', 100, 80), neu('h', -100, -150)];
  const A = fall('Gross 450×350×350 + Boden quer', P, trenn, 'schrank-gross', { 1: laufBlock(-60, 150, 30, 9, 0.4) });
  const st = A.teile.map((t) => teilMesh(P, A, t, triangulate, FARBEN, []).stuecke.length);
  if (st[0] < 4) { console.log('FEHLER: Querwand 450×346 sollte ≥ 4 Stücke haben'); fehler++; }
}
// Fall 6: nur breit — 450×200×120 ohne Boden (Spaltenteilung, keine Reihen)
{
  const P = { ...P0, b: 450, t: 200, h: 120 };
  fall('Breit 450×200×120', P, [neu('h', 0, 0), neu('v', -120, -50), neu('v', 120, 50)], 'schrank-breit');
}
// Fall 7: Drucktest-Muster klein — 120×100×50 (T + Kreuz), mit und ohne Boden
{
  const P = { ...P0, b: 120, t: 100, h: 50 };
  const trenn = [neu('h', 0, 0), neu('v', -20, -30), neu('v', 20, -30), neu('v', 20, 30)];
  fall('Muster ohne Boden', P, trenn, 'muster-120x100x50', { 1: laufBlock(-52, 20, 22, 6, 0.4) });
  fall('Muster mit Boden', { ...P, boden: true, bodenDicke: 3, bodenNuten: 'v' }, trenn, 'muster-120x100x50-boden');
  // Muster für die Naht: 120 lang, künstlich geteilt? — Bett ist grösser; Nahtmuster über Fall 6 (schrank-breit)
}

console.log(fehler ? `\n${fehler} FEHLER` : '\nalles geschlossen');
process.exitCode = fehler ? 1 : 0;

function laufBlock(x0, y0, w, h, res) {
  const out = [];
  for (let y = y0; y < y0 + h; y += res) {
    const j = Math.round((y - y0) / res), n = Math.round(h / res);
    if (j === 0 || j === n - 1 || j === Math.floor(n / 2)) out.push([x0, x0 + w, y, y + res]);
    else out.push([x0, x0 + res * 3, y, y + res]);
  }
  return out;
}
