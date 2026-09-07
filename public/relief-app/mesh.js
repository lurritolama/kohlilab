// Geometrie fuer den Relief-Konfigurator (KohliLab).
//
// Ein Relief ist ein Hoehenfeld auf einem Sockel: Deckflaeche aus einem
// Raster nx*ny (mm), vier senkrechte Waende bis z=0, flacher Boden. Farben
// haengen am Dreieck (Klasse je Rasterzelle: Land, Wald, Wasser, Fels,
// Schnee, Gebaeude, Route) und landen als m:colorgroup im 3MF — buendig,
// fuer das AMS.
//
// Die Waende sind in Reihen unterteilt (alle vier gleich, sonst gaebe es an
// den Ecken T-Kreuzungen). Auf der Vorderkante (Sueden) traegt der Streifen
// zwischen z=0 und der Sockeloberkante eine erhabene Schrift: links der
// Wunschtext, rechts "© swisstopo" (Lizenzpflicht). Erhaben = die Reihen-
// punkte im Schriftraster ruecken um `praegung` mm nach aussen.
//
// Wasserdicht durch Bauart: alle Kanten werden von genau zwei Dreiecken
// gegenlaeufig benutzt (pruefe). Laeuft im Browser und in Node
// (werkzeug/relief-check.mjs), darum keine DOM-/three.js-Abhaengigkeit.

/**
 * Baut das Relief.
 *   nx, ny     Rasterpunkte (Spalten Ost, Zeilen Nord)
 *   pitch      Punktabstand mm (Zellen quadratisch)
 *   z          Float32Array nx*ny: Hoehe der Deckflaeche in mm (>= sockel)
 *   klasse     Uint8Array (nx-1)*(ny-1): Farbindex je Zelle
 *   sockel     Farbindex fuer Waende/Boden
 *   reihen     Hoehen der Zwischenreihen an den Waenden (mm, aufsteigend,
 *              alle < min(z am Rand)); [] = eine Reihe (nur oben/unten)
 *   praegung   { tiefe (mm), maske(i, r) -> true wenn Punkt (Spalte i der
 *              Suedkante, Zwischenreihe r) erhaben ist, klasse (Farbindex
 *              der Schrift oder null = Sockelfarbe) } oder null
 * Rueckgabe { pos, idx, farbe (Uint8Array je Dreieck), topCount }
 */
export function reliefMesh(o) {
  const { nx, ny, pitch, z, klasse, sockel = 0, reihen = [], praegung = null } = o;
  const W = (nx - 1) * pitch, H = (ny - 1) * pitch;
  const pos = [], idx = [], farbe = [];
  const push = (x, y, zz) => { pos.push(x, y, zz); return pos.length / 3 - 1; };
  const tri = (a, b, c, f) => { if (a !== b && b !== c && a !== c) { idx.push(a, b, c); farbe.push(f); } };

  // Deckflaeche
  const top = new Int32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) top[j * nx + i] = push(i * pitch - W / 2, j * pitch - H / 2, z[j * nx + i]);
  for (let cj = 0; cj < ny - 1; cj++) for (let ci = 0; ci < nx - 1; ci++) {
    const a = top[cj * nx + ci], b = top[cj * nx + ci + 1], c = top[(cj + 1) * nx + ci], d = top[(cj + 1) * nx + ci + 1];
    const k = klasse[cj * (nx - 1) + ci];
    // Diagonale entlang der kleineren Hoehendifferenz: Grate und Taeler
    // bleiben scharf statt zu Saegezaehnen zu werden.
    const za = z[cj * nx + ci], zb = z[cj * nx + ci + 1], zc = z[(cj + 1) * nx + ci], zd = z[(cj + 1) * nx + ci + 1];
    if (Math.abs(za - zd) <= Math.abs(zb - zc)) { tri(a, b, d, k); tri(a, d, c, k); }
    else { tri(a, b, c, k); tri(b, d, c, k); }
  }
  const topCount = pos.length / 3;

  // Rand gegen den Uhrzeigersinn (von oben): Sued, Ost, Nord, West
  const rand = [];                                  // { i, j, seite, s }  s = Laufindex entlang der Seite
  for (let i = 0; i < nx; i++) rand.push({ i, j: 0, seite: 0, s: i });
  for (let j = 1; j < ny; j++) rand.push({ i: nx - 1, j, seite: 1, s: j });
  for (let i = nx - 2; i >= 0; i--) rand.push({ i, j: ny - 1, seite: 2, s: i });
  for (let j = ny - 2; j >= 1; j--) rand.push({ i: 0, j, seite: 3, s: j });
  const L = rand.length;
  const R = reihen.length;                          // Zwischenreihen
  const tiefe = praegung ? praegung.tiefe : 0;
  const erhaben = (k, r) => !!(praegung && rand[k].seite === 0 && praegung.maske(rand[k].i, r));
  // Reihenpunkte: reihe[r][k], r=0 Boden (z=0), r=1..R Zwischenreihen
  const reihe = [];
  for (let r = 0; r <= R; r++) {
    const ids = new Int32Array(L);
    for (let k = 0; k < L; k++) {
      const p = rand[k];
      const x = p.i * pitch - W / 2, y = p.j * pitch - H / 2;
      const off = r >= 1 && erhaben(k, r) ? tiefe : 0;   // Sueden: nach -y
      ids[k] = push(x, y - off, r === 0 ? 0 : reihen[r - 1]);
    }
    reihe.push(ids);
  }
  // Waende: Streifen zwischen Reihe r und r+1 (bzw. Deckflaeche)
  const oben = (r, k) => (r === R ? top[rand[k].j * nx + rand[k].i] : reihe[r + 1][k]);
  for (let r = 0; r <= R; r++) for (let k = 0; k < L; k++) {
    const k2 = (k + 1) % L;
    const l0 = reihe[r][k], l1 = reihe[r][k2], u0 = oben(r, k), u1 = oben(r, k2);
    let f = sockel;
    if (praegung && praegung.klasse != null && rand[k].seite === 0 && rand[k2].seite === 0) {
      // Schriftfarbe: Zelle gilt als Schrift, wenn ihre obere Kante erhaben ist
      if (r < R && (erhaben(k, r + 1) || erhaben(k2, r + 1))) f = praegung.klasse;
    }
    tri(u0, l0, u1, f); tri(u1, l0, l1, f);
  }
  // Boden: Faecher um die Mitte
  const c = push(0, 0, 0);
  for (let k = 0; k < L; k++) tri(c, reihe[0][(k + 1) % L], reihe[0][k], sockel);

  const mesh = { pos: new Float32Array(pos), idx: new Uint32Array(idx), farbe: new Uint8Array(farbe), topCount };
  orientiere(mesh);
  return mesh;
}

/**
 * Schriftmaske fuer die Vorderkante aus einer Zellmatrix (Canvas-Rendering
 * im Browser): zellen[r-1][i] -> 1/0, r = Zwischenreihe (1 = unterste).
 */
export function praegungAus(zellen, tiefe, klasse = null) {
  return { tiefe, klasse, maske: (i, r) => { const row = zellen[r - 1]; return !!(row && row[i]); } };
}

/** Signiertes Volumen in mm³ (positiv = Normalen zeigen nach aussen). */
export function volumen(mesh) {
  const p = mesh.pos, t = mesh.idx;
  let v = 0;
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
        + p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2])
        + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return v;
}
function orientiere(mesh) {
  if (volumen(mesh) >= 0) return;
  const t = mesh.idx;
  for (let k = 0; k < t.length; k += 3) { const x = t[k + 1]; t[k + 1] = t[k + 2]; t[k + 2] = x; }
}

/** Wasserdicht? Jede Kante genau einmal je Richtung. */
export function pruefe(mesh) {
  const t = mesh.idx, n = mesh.pos.length / 3;
  const m = new Map();
  const key = (a, b) => a * n + b;
  for (let k = 0; k < t.length; k += 3) {
    const e = [[t[k], t[k + 1]], [t[k + 1], t[k + 2]], [t[k + 2], t[k]]];
    for (const [a, b] of e) { const kk = key(a, b); m.set(kk, (m.get(kk) || 0) + 1); }
  }
  let offen = 0, doppelt = 0;
  for (const [kk, c] of m) {
    if (c > 1) doppelt++;
    const a = Math.floor(kk / n), b = kk % n;
    if (!m.has(key(b, a))) offen++;
  }
  return { geschlossen: offen === 0 && doppelt === 0, offen, doppelt, volumenMm3: volumen(mesh), dreiecke: t.length / 3 };
}

/** Kompakte Zahl fuers XML (3 Nachkommastellen, ohne Nullenschwanz). */
function z3(v) { const s = v.toFixed(3); return s.indexOf('.') < 0 ? s : s.replace(/\.?0+$/, ''); }

/**
 * 3MF-Modell (XML) — ein Objekt je Koerper, Farben als m:colorgroup mit p1
 * je Dreieck (Bambu-erprobtes Muster aus QR-Schild/Lithophane; Hex-Werte in
 * GROSSBUCHSTABEN, Bambu Studio ignoriert Kleinschreibung).
 *   koerper: [{ name, mesh, palette: ['#RRGGBB', …] }]
 */
export function modelXml(koerper, app = 'KohliLab Relief') {
  const objekte = [], items = [];
  let ressourcen = '', naechsteId = 1;
  koerper.forEach((k) => {
    const p = k.mesh.pos, t = k.mesh.idx, f = k.mesh.farbe, pal = k.palette;
    const v = new Array(p.length / 3), tr = new Array(t.length / 3);
    for (let i = 0; i < p.length; i += 3) v[i / 3] = `<vertex x="${z3(p[i])}" y="${z3(p[i + 1])}" z="${z3(p[i + 2])}"/>`;
    let pid = '';
    if (pal && f) {
      const cg = naechsteId++;
      ressourcen += `<m:colorgroup id="${cg}">${pal.map((h) => `<m:color color="${h.toUpperCase()}FF"/>`).join('')}</m:colorgroup>`;
      pid = ` pid="${cg}" pindex="0"`;
      for (let i = 0; i < t.length; i += 3) tr[i / 3] = `<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}" p1="${f[i / 3]}"/>`;
    } else {
      for (let i = 0; i < t.length; i += 3) tr[i / 3] = `<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>`;
    }
    const id = naechsteId++;
    objekte.push(`<object id="${id}" name="${k.name}" type="model"${pid}><mesh><vertices>${v.join('')}</vertices><triangles>${tr.join('')}</triangles></mesh></object>`);
    items.push(`<item objectid="${id}"/>`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"><metadata name="Application">${app}</metadata><resources>${ressourcen}${objekte.join('')}</resources><build>${items.join('')}</build></model>`;
}
export const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
export const RELS = `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;

// ---------------------------------------------------------------------------
// Klassifizierung: aus Hoehen (Meter) und Masken die Farbklasse je Zelle.
// Reihenfolge = Prioritaet: Route > Wasser > Gebaeude > Schnee > Fels > Wald > Land
// ---------------------------------------------------------------------------
export const KLASSEN = ['land', 'wald', 'wasser', 'fels', 'schnee', 'gebaeude', 'route'];

/**
 *   hM        Float32Array nx*ny Hoehen in Metern
 *   zellM     Zellgroesse in Metern
 *   masken    { wald, wasser, gebaeude, route } Uint8Array nx*ny (Punktmasken) oder null
 *   an        { wald, wasser, fels, schnee, gebaeude, route } bool
 *   schnee    Hoehe in m ab der Schnee gilt
 *   fels      Hangneigung in Grad ab der Fels gilt
 * Rueckgabe Uint8Array (nx-1)*(ny-1) mit Index in KLASSEN.
 */
export function klassifiziere(o) {
  const { nx, ny, hM, zellM, masken, an, schnee, fels } = o;
  const k = new Uint8Array((nx - 1) * (ny - 1));
  const tanFels = Math.tan(fels * Math.PI / 180);
  const m = (name, i, j) => masken && masken[name] ? masken[name][j * nx + i] : 0;
  // Zelle = 4 Eckpunkte; Maske gilt, wenn >= 2 Ecken drin (Linien: >= 1)
  for (let cj = 0; cj < ny - 1; cj++) for (let ci = 0; ci < nx - 1; ci++) {
    const p = [[ci, cj], [ci + 1, cj], [ci, cj + 1], [ci + 1, cj + 1]];
    const zaehl = (name) => p.reduce((s, q) => s + m(name, q[0], q[1]), 0);
    const a = hM[cj * nx + ci], b = hM[cj * nx + ci + 1], c = hM[(cj + 1) * nx + ci], d = hM[(cj + 1) * nx + ci + 1];
    const mitte = (a + b + c + d) / 4;
    let kl = 0;
    if (an.wald && zaehl('wald') >= 2) kl = 1;
    if (an.fels) {
      const gx = ((b + d) - (a + c)) / (2 * zellM), gy = ((c + d) - (a + b)) / (2 * zellM);
      if (Math.hypot(gx, gy) > tanFels) kl = 3;
    }
    if (an.schnee && mitte >= schnee) kl = 4;
    if (an.gebaeude && zaehl('gebaeude') >= 2) kl = 5;
    if (an.wasser && zaehl('wasser') >= 1) kl = 2;
    if (an.route && zaehl('route') >= 1) kl = 6;
    k[cj * (nx - 1) + ci] = kl;
  }
  return k;
}

/**
 * Raster umrechnen: bilinear von (sx*sy) nach (nx*ny), beide Zeile 0 = Sueden
 * und ueber dasselbe Rechteck gespannt.
 */
export function resample(src, sx, sy, nx, ny) {
  const out = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const fy = j * (sy - 1) / (ny - 1); let y0 = Math.floor(fy); if (y0 >= sy - 1) y0 = sy - 2; const ty = fy - y0;
    for (let i = 0; i < nx; i++) {
      const fx = i * (sx - 1) / (nx - 1); let x0 = Math.floor(fx); if (x0 >= sx - 1) x0 = sx - 2; const tx = fx - x0;
      const a = src[y0 * sx + x0], b = src[y0 * sx + x0 + 1], c = src[(y0 + 1) * sx + x0], d = src[(y0 + 1) * sx + x0 + 1];
      out[j * nx + i] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}
/**
 * Maske umrechnen: eine Zielzelle ist gesetzt, wenn IRGENDEINE Quellzelle in
 * ihrem Einzugsbereich gesetzt ist. Der naechste-Punkt-Weg liess bei duennen
 * Linien (Fluesse, 1 Zelle breit) jede dritte Zelle fallen — im Druck wurden
 * daraus Striche (Manolo, 07.09.2026).
 */
export function resampleMaske(src, sx, sy, nx, ny) {
  const out = new Uint8Array(nx * ny);
  const rx = (sx - 1) / (nx - 1), ry = (sy - 1) / (ny - 1);
  for (let j = 0; j < ny; j++) {
    const y0 = Math.max(0, Math.floor((j - 0.5) * ry + 0.5)), y1 = Math.min(sy - 1, Math.ceil((j + 0.5) * ry - 0.5));
    for (let i = 0; i < nx; i++) {
      const x0 = Math.max(0, Math.floor((i - 0.5) * rx + 0.5)), x1 = Math.min(sx - 1, Math.ceil((i + 0.5) * rx - 0.5));
      let v = 0;
      for (let y = y0; y <= y1 && !v; y++) for (let x = x0; x <= x1; x++) if (src[y * sx + x]) { v = 1; break; }
      out[j * nx + i] = v;
    }
  }
  return out;
}
/** Maske um r Zellen verbreitern (Quadrat). */
export function dilatiere(m, nx, ny, r) {
  if (r <= 0) return m;
  const out = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!m[j * nx + i]) continue;
    for (let dj = -r; dj <= r; dj++) { const jj = j + dj; if (jj < 0 || jj >= ny) continue;
      for (let di = -r; di <= r; di++) { const ii = i + di; if (ii >= 0 && ii < nx) out[jj * nx + ii] = 1; } }
  }
  return out;
}

/**
 * Fluesse zusammenhaengend machen.
 *
 * Der Gewaesser-Layer zeichnet eingedolte Abschnitte (unter Doerfern,
 * Strassen, Bahnlinien) nicht — im Relief tauchten Baeche mitten im Objekt
 * auf und verschwanden wieder (Manolo, 07.09.2026). Vorgehen:
 *   1. Zusammenhangskomponenten von Fluessen+Seen (8er-Nachbarschaft).
 *   2. Verbunden = beruehrt den Rand oder enthaelt See-Zellen.
 *   3. Jede andere Komponente sucht vom tiefsten Punkt einen Weg zum
 *      verbundenen Netz oder zum Rand — Dijkstra ueber dem Hoehenmodell,
 *      bergab billig, bergauf teuer (folgt also dem Talweg wie die Dole).
 *      Gefunden: Weg wird Fluss, Komponente gilt als verbunden.
 *      Nicht gefunden (Budget): Komponente wird gestrichen.
 * Rueckgabe { fluesse (neu), verbunden, gestrichen, ueberbrueckt }.
 *   hM: Hoehen (m), maxSchritte: Budget je Komponente (Zellen im Heap).
 */
export function fluesseVerbinden(fluesse, seen, hM, nx, ny, maxSchritte = 60000) {
  const N = nx * ny;
  const F = new Uint8Array(N);
  for (let k = 0; k < N; k++) F[k] = (fluesse[k] || (seen && seen[k])) ? 1 : 0;
  const komp = new Int32Array(N).fill(-1);
  const komps = [];                                  // { zellen: [], verbunden }
  const rand = (k) => { const i = k % nx, j = (k - i) / nx; return i === 0 || j === 0 || i === nx - 1 || j === ny - 1; };
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (!F[s] || komp[s] >= 0) continue;
    const id = komps.length, zellen = []; let verbunden = false;
    komp[s] = id; stack.push(s);
    while (stack.length) {
      const k = stack.pop(); zellen.push(k);
      if (rand(k) || (seen && seen[k])) verbunden = true;
      const i = k % nx, j = (k - i) / nx;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const q = jj * nx + ii; if (F[q] && komp[q] < 0) { komp[q] = id; stack.push(q); }
      }
    }
    komps.push({ zellen, verbunden });
  }
  const netz = new Uint8Array(N);                    // verbundenes Wasser (waechst)
  for (const c of komps) if (c.verbunden) for (const k of c.zellen) netz[k] = 1;
  const aus = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (fluesse[k] && netz[k]) aus[k] = 1;
  let gestrichen = 0, ueberbrueckt = 0;
  // Binaerer Heap fuer Dijkstra
  const heap = []; const hpush = (c, k) => { heap.push([c, k]); let a = heap.length - 1; while (a > 0) { const p = (a - 1) >> 1; if (heap[p][0] <= heap[a][0]) break; [heap[p], heap[a]] = [heap[a], heap[p]]; a = p; } };
  const hpop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let a = 0; for (;;) { let l = 2 * a + 1, r = l + 1, m = a; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === a) break; [heap[m], heap[a]] = [heap[a], heap[m]]; a = m; } } return top; };
  const dist = new Float32Array(N), vor = new Int32Array(N);
  const offen = komps.filter((c) => !c.verbunden).sort((a, b) => b.zellen.length - a.zellen.length);
  for (const c of offen) {
    dist.fill(Infinity); vor.fill(-1); heap.length = 0;
    const cid = komp[c.zellen[0]];
    for (const k of c.zellen) { dist[k] = 0; hpush(0, k); }
    let ziel = -1, schritte = 0;
    while (heap.length && schritte < maxSchritte) {
      const [d, k] = hpop(); if (d > dist[k]) continue;
      schritte++;
      if (komp[k] !== cid && (netz[k] || rand(k))) { ziel = k; break; }
      const i = k % nx, j = (k - i) / nx;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const q = jj * nx + ii;
        const dh = hM[q] - hM[k];
        const kosten = (di && dj ? 1.414 : 1) + (dh > 0 ? 40 * dh : 0.5 * Math.max(-2, dh) + 1);   // bergauf teuer, bergab leicht billiger
        const nd = d + Math.max(0.05, kosten);
        if (nd < dist[q]) { dist[q] = nd; vor[q] = k; hpush(nd, q); }
      }
    }
    if (ziel < 0) { gestrichen++; continue; }
    // Weg zurueckverfolgen und einzeichnen
    for (let k = ziel; k >= 0 && dist[k] > 0; k = vor[k]) { aus[k] = 1; netz[k] = 1; }
    for (const k of c.zellen) { netz[k] = 1; if (fluesse[k]) aus[k] = 1; }
    c.verbunden = true; ueberbrueckt++;
  }
  return { fluesse: aus, verbunden: komps.filter((c) => c.verbunden).length, gestrichen, ueberbrueckt };
}
/** Glaetten (Boxfilter 3x3), n Durchgaenge — gegen Rasterrauschen bei grober Stufe. */
export function glaette(h, nx, ny, n) {
  let a = h;
  for (let p = 0; p < n; p++) {
    const b = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let s = 0, c = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        s += a[jj * nx + ii]; c++;
      }
      b[j * nx + i] = s / c;
    }
    a = b;
  }
  return a;
}
