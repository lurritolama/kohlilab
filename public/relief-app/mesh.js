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
// Farbklassen je Zelle (Neubau 02.10.2026, nach Manolos Slice-Befund: zu
// viele Baeche, Baeche aus dem Nichts, Wald daneben, Farbrauschen).
//
// Alles laeuft auf den ZELLMITTEN des Zielrasters (nx-1)*(ny-1) und in
// Millimetern des Drucks — so sieht das Relief bei 220 Vorschau- und 324
// Druckpunkten gleich aus. Quellen:
//   Wald       swissTLM3D-Waldflaeche (Abdeckung am Rasterpunkt, 0..255)
//   Wasser     Seen (swissTLM3D) + Gewaesserflaechen VECTOR25 (breite Fluesse)
//              + Baeche als VEKTOR-Linien (Strahler), Breite nach Ordnung
//   Fels       VECTOR25 Fels und Geroell
//   Schnee     VECTOR25 Gletscher/Firn, dazu wahlweise alles ueber einer
//              Schneegrenze, was nicht Wald oder Wasser ist
//   Gebaeude   VECTOR25 Gebaeude (Kloetzchen)
//   Route      GPX-Linie
// Danach wird jede Flaeche auf Druckbarkeit bereinigt: Streifen schmaler
// als die Mindestbreite, Inseln und Loecher kleiner als die Mindestflaeche
// verschwinden (sonst druckt der Slicer Farbrauschen).
// Reihenfolge = Prioritaet: Route > Wasser > Gebaeude > Schnee > Wald > Fels > Land
// ---------------------------------------------------------------------------
export const KLASSEN = ['land', 'wald', 'wasser', 'fels', 'schnee', 'gebaeude', 'route'];
export const DRUCK = { minBreite: 1.2, minFlaeche: 3.0 };   // mm, mm²: 3 Duesenbreiten, ~1.7x1.7 mm
// Generalisierung je Flaeche: Kantenglaettung (Gauss-Sigma, mm) und
// Mindestflaeche (mm²). Fels/Geroell ist in VECTOR25 sehr kleinteilig
// (Karrenfelder zwischen Weiden) — im Druck wird daraus sonst Rauschen.
export const GENERAL = { wald: [0.35, 3], fels: [0.7, 6], schnee: [0.5, 4] };

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

/** Gauss-Glaettung, getrennt in x und y; sigma in Zellen, Rand gespiegelt. */
export function gauss(h, nx, ny, sigma) {
  if (!(sigma > 0.05)) return h;
  const R = Math.max(1, Math.ceil(3 * sigma)), w = new Float32Array(2 * R + 1);
  let s = 0; for (let k = -R; k <= R; k++) { w[k + R] = Math.exp(-k * k / (2 * sigma * sigma)); s += w[k + R]; }
  for (let k = 0; k < w.length; k++) w[k] /= s;
  const spiegel = (q, n) => (q < 0 ? -q : q >= n ? 2 * n - 2 - q : q);
  const t = new Float32Array(nx * ny), out = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let v = 0; for (let k = -R; k <= R; k++) v += w[k + R] * h[j * nx + spiegel(i + k, nx)];
    t[j * nx + i] = v;
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let v = 0; for (let k = -R; k <= R; k++) v += w[k + R] * t[spiegel(j + k, ny) * nx + i];
    out[j * nx + i] = v;
  }
  return out;
}

/**
 * Hoehen fuers Zielraster: beim Verkleinern zuerst tiefpassfiltern (sonst
 * Alias-Zacken an Graten), dann bilinear, dann die gewuenschte Glaettung
 * in mm (unabhaengig von der Rasterweite).
 */
export function hoehenFuer(src, sx, sy, nx, ny, pitch, glattMm) {
  const f = (sx - 1) / (nx - 1);
  const vor = f > 1.05 ? gauss(src, sx, sy, 0.45 * f) : src;
  return gauss(resample(vor, sx, sy, nx, ny), nx, ny, glattMm / pitch);
}

/**
 * Abdeckungsmaske (0..255 an den Rasterpunkten sx*sy) -> Zellmaske
 * (nx-1)*(ny-1) des Zielrasters: bilinear an der Zellmitte, ab 50 %.
 * Ersetzt die alte "irgendein Quellpunkt"-Regel, die Wald um bis zu eine
 * Zelle aufblaehte (Wald-IoU zur Waldflaeche nur 0.71–0.74).
 */
export function zellMaske(cov, sx, sy, nx, ny, schwelle = 128) {
  const out = new Uint8Array((nx - 1) * (ny - 1));
  if (!cov) return out;
  const rx = (sx - 1) / (nx - 1), ry = (sy - 1) / (ny - 1);
  for (let cj = 0; cj < ny - 1; cj++) {
    const fy = (cj + 0.5) * ry; let y0 = Math.floor(fy); if (y0 >= sy - 1) y0 = sy - 2; const ty = fy - y0;
    for (let ci = 0; ci < nx - 1; ci++) {
      const fx = (ci + 0.5) * rx; let x0 = Math.floor(fx); if (x0 >= sx - 1) x0 = sx - 2; const tx = fx - x0;
      const a = cov[y0 * sx + x0], b = cov[y0 * sx + x0 + 1], c = cov[(y0 + 1) * sx + x0], d = cov[(y0 + 1) * sx + x0 + 1];
      if ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty >= schwelle) out[cj * (nx - 1) + ci] = 1;
    }
  }
  return out;
}

// ---------- Morphologie auf Zellmasken (w*h) ----------
function scheibe(r) {
  const o = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 0.5) o.push([dx, dy]);
  return o;
}
function morph(m, w, h, r, dilat) {
  const o = scheibe(r), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dilat ? 0 : 1;
    for (const [dx, dy] of o) {
      const xx = x + dx, yy = y + dy;
      // Rand: ausserhalb gilt als "wie innen" — Flaechen am Rand schrumpfen nicht
      const q = (xx < 0 || yy < 0 || xx >= w || yy >= h) ? m[y * w + x] : m[yy * w + xx];
      if (dilat ? q : !q) { v = dilat ? 1 : 0; break; }
    }
    out[y * w + x] = v;
  }
  return out;
}
/**
 * Zusammenhangskomponenten, 4er- oder 8er-Nachbarschaft. Gezaehlt wird mit
 * 4er: nur ueber Eck verbundene Zellen sind fuer den Slicer getrennte Inseln.
 * Rueckgabe { lab: Int32Array (-1 = nicht dabei), groesse: [] }.
 */
function komponenten(m, w, h, wert, acht) {
  const lab = new Int32Array(w * h).fill(-1), groesse = [], stack = [];
  for (let s = 0; s < w * h; s++) {
    if (m[s] !== wert || lab[s] >= 0) continue;
    const id = groesse.length; let n = 0;
    lab[s] = id; stack.push(s);
    while (stack.length) {
      const k = stack.pop(); n++;
      const x = k % w, y = (k - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!acht && dx && dy)) continue;
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx; if (m[q] === wert && lab[q] < 0) { lab[q] = id; stack.push(q); }
      }
    }
    groesse.push(n);
  }
  return { lab, groesse };
}
/**
 * Flaeche druckbar machen: Kanten weich zeichnen (Gauss sigma Zellen, dann
 * ab 50 % — wie ein Kartograf die Grenze glaettet, die Flaeche bleibt
 * gleich gross), Schliessen + Oeffnen mit Radius r (Zellen) — schmale
 * Luecken zu, schmale Zipfel und Streifen weg —, dann Inseln und Loecher
 * unter minZellen entfernen.
 */
export function bereinige(m, w, h, r, minZellen, sigma = 0) {
  let a = m;
  if (sigma > 0.3) {
    const f = new Float32Array(w * h); for (let k = 0; k < f.length; k++) f[k] = a[k];
    const g = gauss(f, w, h, sigma); a = new Uint8Array(w * h); for (let k = 0; k < a.length; k++) a[k] = g[k] >= 0.5 ? 1 : 0;
  }
  if (r > 0) a = morph(morph(morph(morph(a, w, h, r, true), w, h, r, false), w, h, r, false), w, h, r, true);
  else if (a === m) a = Uint8Array.from(a);
  if (minZellen > 1) {
    for (const wert of [1, 0]) {
      const { lab, groesse } = komponenten(a, w, h, wert, false);
      for (let k = 0; k < a.length; k++) if (lab[k] >= 0 && groesse[lab[k]] < minZellen) a[k] = 1 - wert;
    }
  }
  return a;
}

// ---------- Linien (Baeche, Route) ----------
/**
 * Linien als Zellmaske: jede Zelle, deren Mitte naeher als die halbe
 * Breite an der Linie liegt. Breite in mm, je Linie (breite(linie)).
 *   linien  [{ p: [[E,N],…], … }]   rect  { E0, E1, N0, N1 }
 */
export function linienZellen(linien, rect, nx, ny, pitch, breite) {
  const w = nx - 1, h = ny - 1, out = new Uint8Array(w * h);
  const sx = (nx - 1) / (rect.E1 - rect.E0), sy = (ny - 1) / (rect.N1 - rect.N0);
  for (const L of linien) {
    const hw = Math.max(0.55, breite(L) / 2 / pitch), hw2 = hw * hw;
    const p = L.p;
    for (let k = 0; k < p.length - 1; k++) {
      const ax = (p[k][0] - rect.E0) * sx - 0.5, ay = (p[k][1] - rect.N0) * sy - 0.5;
      const bx = (p[k + 1][0] - rect.E0) * sx - 0.5, by = (p[k + 1][1] - rect.N0) * sy - 0.5;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hw)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + hw));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - hw)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + hw));
      if (x0 > x1 || y0 > y1) continue;
      const vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy || 1e-9;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        let t = ((x - ax) * vx + (y - ay) * vy) / vv; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - ax - t * vx, dy = y - ay - t * vy;
        if (dx * dx + dy * dy <= hw2) out[y * w + x] = 1;
      }
    }
  }
  return out;
}
/**
 * Welche Baeche kommen aufs Relief? Generalisierung nach Massstab: ein
 * Abschnitt bleibt, wenn sein Lauf bis zur Quelle mindestens minLen Meter
 * lang ist (und, fuer "nur Hauptgewaesser", seine Ordnung >= minOrd).
 * Beides waechst talwaerts — der Rest des Netzes bleibt zusammenhaengend.
 */
export function waehleBaeche(linien, minLen, minOrd = 0) {
  return linien.filter((L) => L.l >= minLen && L.o >= minOrd);
}
/**
 * Bachlinien auf die Talsohle des Hoehenmodells legen. Das Gewaessernetz
 * stammt aus der Karte 1:25'000 und liegt in engen Tobeln oft einige Meter
 * am Hang (Analyse Buehler: Median 2–3 m ueber der Sohle) — im Druck wurde
 * die Linie dort zu einem Strichel auf den Schichtkanten. Jede Linie wird
 * auf Rasterweite verdichtet, jeder Punkt sucht im Umkreis radiusM den
 * tiefsten Punkt, die Verschiebungen werden entlang der Linie geglaettet.
 *   h: Hoehenraster nx*ny (Zeile 0 = Sueden) ueber rect
 */
export function baecheEinpassen(linien, rect, h, nx, ny, radiusM) {
  const dE = (rect.E1 - rect.E0) / (nx - 1), dN = (rect.N1 - rect.N0) / (ny - 1);
  const wert = (E, N) => {
    const fx = (E - rect.E0) / dE, fy = (N - rect.N0) / dN;
    const x0 = Math.max(0, Math.min(nx - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    return (h[y0 * nx + x0] * (1 - tx) + h[y0 * nx + x0 + 1] * tx) * (1 - ty) + (h[(y0 + 1) * nx + x0] * (1 - tx) + h[(y0 + 1) * nx + x0 + 1] * tx) * ty;
  };
  const schritt = Math.min(dE, dN);
  const ring = []; for (let r = schritt; r <= radiusM + 1e-6; r += schritt) for (let a = 0; a < 16; a++) ring.push([r * Math.cos(a * Math.PI / 8), r * Math.sin(a * Math.PI / 8), r]);
  return linien.map((L) => {
    const p = [];
    for (let k = 0; k < L.p.length - 1; k++) {
      const [ax, ay] = L.p[k], [bx, by] = L.p[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / schritt));
      for (let t = 0; t < n; t++) p.push([ax + (bx - ax) * t / n, ay + (by - ay) * t / n]);
    }
    p.push(L.p[L.p.length - 1].slice());
    const d = p.map(([E, N]) => {
      let best = wert(E, N), bx = 0, by = 0;
      // leichte Strafe fuer Distanz: bei gleicher Hoehe bleibt die Linie, wo sie ist
      for (const [ox, oy, r] of ring) { const v = wert(E + ox, N + oy) + 0.02 * r; if (v < best) { best = v; bx = ox; by = oy; } }
      return [bx, by];
    });
    const g = d.map((_, i) => { let sx = 0, sy = 0, c = 0; for (let j = Math.max(0, i - 3); j <= Math.min(d.length - 1, i + 3); j++) { sx += d[j][0]; sy += d[j][1]; c++; } return [sx / c, sy / c]; });
    return { ...L, p: p.map(([E, N], i) => [E + g[i][0], N + g[i][1]]) };
  });
}
/**
 * Baeche als flache Rinne eintiefen: alle Rasterpunkte an Bachzellen auf die
 * tiefste Hoehe ihrer 3x3-Nachbarschaft, dann um tiefeM tiefer. Der Slicer
 * druckt den Bachgrund so als eigene, blaue Deckflaeche statt als Strichel
 * auf den Schichtkanten am Hang.
 */
export function rinne(hM, nx, ny, zellen, tiefeM) {
  const p = punkteAn(zellen, nx, ny), out = Float32Array.from(hM);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!p[j * nx + i]) continue;
    let mn = hM[j * nx + i];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny || !p[jj * nx + ii]) continue;
      if (hM[jj * nx + ii] < mn) mn = hM[jj * nx + ii];
    }
    out[j * nx + i] = mn - tiefeM;
  }
  return out;
}
/** Strichbreite (mm) nach Strahler-Ordnung: Grundbreite, ab Ordnung 3 breiter. */
export function bachBreite(o, basis) { return basis * (1 + 0.18 * Math.max(0, Math.min(o, 8) - 2)); }

/** Automatische Mindestlaenge der Baeche (m): ~35 mm Lauf im Druck. */
export function bachMinAuto(mmJeM) { return Math.round(35 / mmJeM / 50) * 50; }

/**
 *   nx, ny, pitch   Zielraster, Zellgroesse mm
 *   hM              Float32Array nx*ny Hoehen in Metern
 *   z               { wald, seen, wasserFl, baeche, fels, gletscher, gebaeude, route } Zellmasken oder null
 *   an              { wald, wasser, fels, schnee, gebaeude, route } bool
 *   schnee          Hoehe in m ab der alles Offene Schnee ist (>= 4200: nur Gletscher)
 * Rueckgabe Uint8Array (nx-1)*(ny-1) mit Index in KLASSEN.
 */
export function farbklassen(o) {
  const { nx, ny, pitch, hM, z, an, schnee } = o;
  const w = nx - 1, h = ny - 1, N = w * h;
  const r = Math.max(0, Math.round(DRUCK.minBreite / 2 / pitch));
  const minZ = Math.max(2, Math.ceil(DRUCK.minFlaeche / (pitch * pitch)));
  const leer = new Uint8Array(N);
  const zz = (k) => z[k] || leer;
  // Wasserflaechen: Seen + breite Fluesse; nur Kleinstweiher weg, keine
  // Oeffnung (ein schmaler Fluss soll nicht zerfallen — die Bachlinie
  // laeuft ohnehin mitten durch)
  const wFl = new Uint8Array(N); { const a = zz('seen'), b = zz('wasserFl'); for (let k = 0; k < N; k++) wFl[k] = a[k] | b[k]; }
  const wasserFl = bereinige(wFl, w, h, 0, minZ);
  const wasser = new Uint8Array(N); { const b = zz('baeche'); for (let k = 0; k < N; k++) wasser[k] = wasserFl[k] | b[k]; }
  const gen = (name, m) => bereinige(m, w, h, r, Math.max(minZ, Math.ceil(GENERAL[name][1] / (pitch * pitch))), GENERAL[name][0] / pitch);
  const wald = an.wald ? gen('wald', zz('wald')) : leer;
  const fels = an.fels ? gen('fels', zz('fels')) : leer;
  let sch = leer;
  if (an.schnee) {
    const s = Uint8Array.from(zz('gletscher'));
    if (schnee < 4200) {
      for (let cj = 0; cj < h; cj++) for (let ci = 0; ci < w; ci++) {
        const mitte = (hM[cj * nx + ci] + hM[cj * nx + ci + 1] + hM[(cj + 1) * nx + ci] + hM[(cj + 1) * nx + ci + 1]) / 4;
        const k = cj * w + ci;
        if (mitte >= schnee && !wald[k] && !wasser[k]) s[k] = 1;
      }
    }
    sch = gen('schnee', s);
  }
  const geb = an.gebaeude ? zz('gebaeude') : leer, route = an.route ? zz('route') : leer;
  const k = new Uint8Array(N);
  for (let q = 0; q < N; q++) {
    let kl = 0;
    if (fels[q]) kl = 3;
    if (wald[q]) kl = 1;
    if (sch[q]) kl = 4;
    if (geb[q]) kl = 5;
    if (an.wasser && wasser[q]) kl = 2;
    if (route[q]) kl = 6;
    k[q] = kl;
  }
  return inselnWeg(k, w, h, minZ, new Set([5, 6]));
}

/**
 * Letzter Durchgang auf der fertigen Karte: Farbinseln unter minZ Zellen
 * (z. B. ein Zipfel Land zwischen Wald und Bach) bekommen die haeufigste
 * Nachbarfarbe. Gebaeude und Route bleiben, wie sie sind.
 */
export function inselnWeg(k, w, h, minZ, schutz) {
  for (let pass = 0; pass < 2; pass++) {
    let geaendert = false;
    for (let c = 0; c < KLASSEN.length; c++) {
      if (schutz.has(c)) continue;
      const m = new Uint8Array(w * h); let n = 0; for (let q = 0; q < m.length; q++) if (k[q] === c) { m[q] = 1; n++; }
      if (!n) continue;
      const { lab, groesse } = komponenten(m, w, h, 1, false);
      const klein = groesse.map((g) => g < minZ);
      if (!klein.some(Boolean)) continue;
      const zaehl = groesse.map(() => new Uint32Array(KLASSEN.length));
      for (let q = 0; q < m.length; q++) {
        const id = lab[q]; if (id < 0 || !klein[id]) continue;
        const x = q % w, y = (q - x) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const nb = k[yy * w + xx]; if (nb !== c) zaehl[id][nb]++;
        }
      }
      for (let q = 0; q < m.length; q++) {
        const id = lab[q]; if (id < 0 || !klein[id]) continue;
        let best = -1, bn = 0; zaehl[id].forEach((v, i) => { if (v > bn && !schutz.has(i)) { bn = v; best = i; } });
        if (best >= 0) { k[q] = best; geaendert = true; }
      }
    }
    if (!geaendert) break;
  }
  return k;
}

/** Rasterpunkte, die an mindestens eine Zelle der Maske grenzen (fuer Kloetzchen/Route-Erhoehung). */
export function punkteAn(zellen, nx, ny) {
  const p = new Uint8Array(nx * ny), w = nx - 1;
  for (let cj = 0; cj < ny - 1; cj++) for (let ci = 0; ci < nx - 1; ci++) {
    if (!zellen[cj * w + ci]) continue;
    p[cj * nx + ci] = p[cj * nx + ci + 1] = p[(cj + 1) * nx + ci] = p[(cj + 1) * nx + ci + 1] = 1;
  }
  return p;
}
