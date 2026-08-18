// 3MF-Export der Lochwand-Module OHNE Browser -- dieselben Module wie die
// App, three aus public/vendor. Schreibt lochwand-test.3mf nach
// Projekt-Daten/kohlilab-skadis; dort prueft lochwand-pruefen.py Drucklage,
// Windung und ob der eingefrorene Haken S70 exakt drin ist.
//
// Aufruf (aus dem kohlilab-Ordner):
//   node werkzeug/lochwand-export-test.mjs
//   python ../Projekt-Daten/kohlilab-skadis/lochwand-pruefen.py
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const threeUrl = pathToFileURL(path.resolve('public/vendor/three/three.module.js')).href;
const THREE = await import(threeUrl);
// Temporaere Kopien der App-Module mit absolutem three-Pfad, damit Node sie laedt.
const dir = mkdtempSync(path.join(tmpdir(), 'lw-'));
for (const n of ['raster', 'haken', 'module', 'preis']) {
  writeFileSync(path.join(dir, n + '.js'), readFileSync('public/lochwand-app/' + n + '.js', 'utf-8').replace(/from 'three'/g, "from '" + threeUrl + "'"));
}
const M = await import(pathToFileURL(path.join(dir, 'module.js')).href);
const P = await import(pathToFileURL(path.join(dir, 'preis.js')).href);

// Dieselbe Drucklage-Logik wie index.html: x -> z (Seitenlage), an den Ursprung.
function modulDreiecke(fam, params) {
  const geos = [...fam.geometrie(params), ...(fam.stuetzen ? fam.stuetzen(params) : [])]; const out = [];
  const Rm = M.drucklageMatrix(fam);
  let minZ = Infinity, minX = Infinity, minY = Infinity; const tmp = [];
  for (const g of geos) {
    const ng = g.index ? g.toNonIndexed() : g; const a = ng.attributes.position.array; const arr = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 3) {
      const v = new THREE.Vector3(a[i], a[i + 1], a[i + 2]).applyMatrix4(Rm);
      arr[i] = v.x; arr[i + 1] = v.y; arr[i + 2] = v.z;
      if (v.z < minZ) minZ = v.z; if (v.x < minX) minX = v.x; if (v.y < minY) minY = v.y;
    }
    tmp.push(arr);
  }
  for (const arr of tmp) { for (let i = 0; i < arr.length; i += 3) { arr[i] -= minX; arr[i + 1] -= minY; arr[i + 2] -= minZ; } out.push(arr); }
  return out;
}

const H = M.familie('haken'), W = M.familie('wanne'), HA = M.familie('halter'), KL = M.familie('klemme');
const faelle = [
  { fam: H, name: 'Haken-Standard', params: M.startParameter(H) },
  { fam: H, name: 'Haken-Lang-Winkel', params: { ...M.startParameter(H), laenge: 100, winkel: 30, staerke: 9 } },
  { fam: W, name: 'Wanne-2L-Standard', params: M.startParameter(W) },
  { fam: W, name: 'Wanne-3L-Trenner-Neigung', params: { ...M.startParameter(W), breite: 3, trenner: 2, neigung: 15, tiefe: 80, rundung: 11 } },
  { fam: W, name: 'Wanne-2L-Neigung-minus', params: { ...M.startParameter(W), neigung: -20, rundung: 8 } },
  { fam: W, name: 'Wanne-1L-Becher-offen', params: { ...M.startParameter(W), breite: 1, tiefe: 40, hoehe: 90, boden: 1, rundung: 12 } },
  { fam: HA, name: 'Halter-2L-Standard', params: M.startParameter(HA) },
  { fam: HA, name: 'Halter-3L-Schlitze', params: { ...M.startParameter(HA), breite: 3, schlitze: 1, anzahl: 6, durchmesser: 10 } },
  { fam: HA, name: 'Halter-1L-Bohrer', params: { ...M.startParameter(HA), breite: 1, reihen: 3, durchmesser: 5, anzahl: 4, tiefe: 60 } },
  { fam: KL, name: 'Klemme-Flasche-66', params: M.startParameter(KL) },
  { fam: KL, name: 'Klemme-Bohrfutter-40', params: { ...M.startParameter(KL), durchmesser: 40, klemmweite: 30, hoehe: 20 } },
];
// Aufruf: node lochwand-export-test.mjs [familie] [zieldatei]
//   ohne Argumente: alle Faelle -> Projekt-Daten/kohlilab-skadis/lochwand-test.3mf
//   'wanne' G:/.../lochwand-etappe2b-wannen.3mf : nur die Wannen in diese Datei
const nurFamilie = process.argv[2] || null;
const zielDatei = process.argv[3] || 'C:/Users/Allgemein/Projekt-Daten/kohlilab-skadis/lochwand-test.3mf';
const auswahl = nurFamilie ? faelle.filter((f) => f.fam.id === nurFamilie) : faelle;
let objs = '', items = '', tx = 0; const gramm = [];
auswahl.forEach((f, oi) => {
  const fam = f.fam; const tris = modulDreiecke(fam, f.params); let map = new Map(); const verts = [], T = []; let maxX = 0;
  // Ecken je KOERPER zusammenfassen, nicht je Modul: Boden, Waende, Keil und
    // Haken ueberlappen sich; teilen sie Ecken, entstehen nicht-mannigfaltige
    // Stellen (Slicer meckert, der Waechter zaehlt Fetzen). Getrennte, in sich
    // geschlossene Koerper vereinigt jeder Slicer sauber.
    for (const arr of tris) { map = new Map(); for (let i = 0; i < arr.length; i += 9) {
    const ids = [];
    for (let k = 0; k < 9; k += 3) {
      const x = arr[i + k].toFixed(3), y = arr[i + k + 1].toFixed(3), z = arr[i + k + 2].toFixed(3);
      maxX = Math.max(maxX, +x); const key = x + ',' + y + ',' + z; let id = map.get(key);
      if (id === undefined) { id = verts.length; verts.push('<vertex x="' + x + '" y="' + y + '" z="' + z + '"/>'); map.set(key, id); }
      ids.push(id);
    }
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) continue;
    T.push('<triangle v1="' + ids[0] + '" v2="' + ids[1] + '" v3="' + ids[2] + '"/>');
  } }
  objs += '<object id="' + (oi + 10) + '" type="model" name="' + f.name + '"><mesh><vertices>' + verts.join('') + '</vertices><triangles>' + T.join('') + '</triangles></mesh></object>';
  items += '<item objectid="' + (oi + 10) + '" transform="1 0 0 0 1 0 0 0 1 ' + tx.toFixed(2) + ' 0 0"/>'; tx += maxX + 12;
  const g = M.volumenMm3([...f.fam.geometrie(f.params), ...(f.fam.stuetzen ? f.fam.stuetzen(f.params) : [])]) / 1000 * M.DICHTE_G_CM3; gramm.push(g);   // inkl. Abbrechstuetzen, wie modulGramm() in der App
  console.log(f.name.padEnd(16) + ' ' + T.length + ' Dreiecke, ' + g.toFixed(1) + ' g, Umriss ' + JSON.stringify(M.umriss(f.fam, f.params)));
});
const model = '<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>' + objs + '</resources><build>' + items + '</build></model>';

// Minimales Zip (stored), damit wir ohne JSZip auskommen.
function zipStored(files) {
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const parts = [], cd = []; let off = 0;
  for (const [name, data] of files) {
    const nb = Buffer.from(name, 'utf-8'), db = Buffer.from(data, 'utf-8'), c = crc(db);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(c, 14); lh.writeUInt32LE(db.length, 18); lh.writeUInt32LE(db.length, 22); lh.writeUInt16LE(nb.length, 26);
    parts.push(lh, nb, db);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(db.length, 20); ch.writeUInt32LE(db.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    cd.push(ch, nb); off += lh.length + nb.length + db.length;
  }
  const cdBuf = Buffer.concat(cd); const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10); eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdBuf, eocd]);
}
const CT = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
writeFileSync(zielDatei, zipStored([['[Content_Types].xml', CT], ['_rels/.rels', RELS], ['3D/3dmodel.model', model]]));
console.log('\nBrowser-Preis aller Faelle: ' + JSON.stringify(P.wandPreis(gramm)));
console.log('geschrieben: ' + zielDatei);
