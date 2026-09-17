// Küchenschrank-Einsätze nach Mass — Geometrie (DOM-frei, läuft im Browser
// UND in node für den Prüfstand werkzeug/schrank-check.mjs).
//
// Produkt (Manolo, 14.09.2026: «nur das Gitter»): ein GITTER aus Trennwänden,
// das sich selbst zusammenhält und frei in den Schrank-Korpus gestellt wird.
// Keine Umrandung, keine Wanne. Bestandteile:
//
//   * TRENNWÄNDE — je ein flach gedrucktes Druckteil, längs oder quer. Wo
//     eine Trennwand an einer anderen endet (T-Stoss), greifen sie mit einem
//     SCHWALBENSCHWANZ ineinander: die durchgehende Wand trägt eine
//     senkrechte Nut in der Fläche (oben und unten offen), die anstossende
//     Wand eine passende Leiste am Ende — von oben einschieben, sitzt, und
//     jederzeit wieder umsetzbar. Wo eine Wand eine andere KREUZT (zwei
//     Teilstücke stossen von beiden Seiten an derselben Stelle an), wird
//     daraus ein durchgehendes Teil mit halbhohem Steckschlitz (Steckkreuz) —
//     zwei Schwalbenschwanz-Nuten Rücken an Rücken liessen von der Wand
//     nichts mehr übrig.
//   * BODENPLATTE (optional) — Platte mit Schwalbenschwanz-Nuten im 10-mm-
//     Raster in EINER Richtung (längs oder quer, wählbar), an den Kanten
//     offen. Die Trennwände dieser Richtung tragen unten eine Leiste; das
//     fertig gesteckte Gitter wird als Ganzes von der Kante her in die
//     Platte geschoben. Das grobe Raster lässt der Platte zwischen den Nuten
//     genug Material für die Geschirrlast (Übergabe).
//
// Halber Schwalbenschwanz überall: eine Flanke senkrecht, bündig mit der
// Plattenunterseite (so liegt jede Trennwand beim Druck plan auf dem Bett),
// die andere schräg (Hinterschnitt 1.8 auf 2 mm Tiefe = 48°, druckt ohne
// Stütze). Die Leiste ist nie dicker als die Platte, die Nut nie tiefer als
// die halbe Platte — darum Plattendicke 4–6 mm.
//
// ALTERS-REGEL: Trennwände reichen vom Anker bis zur ersten ÄLTEREN Querwand
// oder zum Rand (Aussenmass). Die ältere geht immer durch, die jüngere endet
// (Schwalbenschwanz) — so sind alle Fächer Rechtecke und die Steck-Reihen-
// folge ist eindeutig (erst die älteren, dann die jüngeren, alle von oben).
//
// GITTER-Koordinaten: x = Breite, y = zweite Gitterachse, z = Plattenhöhe.
// Das Gitter steht als REGAL im Schrank (Manolo 16.09.2026: «wie ein
// Schubladeneinsatz» war falsch): die App dreht es um 90° um x — Gitter-y
// wird zur Höhe (Zwischenböden = 'h'-Wände), Gitter-z zur Tiefe (alle
// Verbindungen werden von VORNE gesteckt), Gitter-z=0 liegt an der Rückwand.
// Druckteile werden LIEGEND beschrieben (Druck-Lage): X = längs, Y = Höhe, Z = Dicke.

export const RASTER = 1;                       // Lagen millimetergenau (Manolo 16.09.2026; das 10-mm-Raster galt der Bodenplatte, die es nicht mehr gibt)
export const FACH_MIN = 20;                    // schmalstes Fach (2 Rasterschritte)
export const DOVE = {                          // Schwalbenschwanz Trennwand–Trennwand
  kd: 2.0,        // Nuttiefe in der Fläche der durchgehenden Wand
  hs: 1.8,        // Hinterschnitt: Hals = Dicke − hs, Fuss = Dicke
  spiel: 0.2,     // Luft je Seite (Drucktest offen)
  ende: 0.3,      // Leiste endet 0.3 vor dem Nutgrund, Platte 0.2 vor der Gegenwand
};
export const BODEN = { kd: 1.6, hs: 1.4, spiel: 0.2, ende: 0.3 };   // Schwalbenschwanz Trennwand–Bodenplatte
export const STECK = { spiel: 0.1, ueber: 0.3 }; // Steckschlitz-Luft je Seite, Überlappung der Teilkörper
export const TEXT_HOEHE = 0.8;                 // Beschriftung erhaben auf der Wandfläche
export const BETT = { x: 290, y: 310 };        // H2D 2-Düsen-Betrieb, mit Marge (wie Organizer)

// ---------- Mass-Hilfen ----------
/** Grundfläche des Gitters (= Aussenmass); z0 = Standhöhe der Trennwände. */
export function grundflaeche(P) {
  return { x0: -P.b / 2, x1: P.b / 2, y0: -P.t / 2, y1: P.t / 2, z0: P.boden ? P.bodenDicke : 0, z1: P.h };
}
/** Zulässige Lagen zwischen zwei Kanten: ganze Millimeter, je RASTER. */
export function rasterLinien(lo, hi) {
  const out = [];
  for (let c = Math.ceil(lo + 1); c <= Math.floor(hi - 1) + 1e-6; c += RASTER) out.push(c);
  return out;
}
export function passtAufBett(P) {
  const flach = (P.b <= BETT.x && P.t <= BETT.y) || (P.b <= BETT.y && P.t <= BETT.x);
  const hoch = P.h - (P.boden ? P.bodenDicke : 0);
  return flach && hoch <= BETT.x && Math.max(P.b, P.t) <= BETT.y;
}

// ---------- Aufteilung: Fächer und Trennwände (Alters-Regel) ----------
// trenn = [{ id, dir:'v'|'h', c, m }]: c = Lage quer (Rastermass), m = Anker längs.
export function aufteilung(P, trenn) {
  const I = grundflaeche(P), ts = P.ts;
  const faecher = [{ x0: I.x0, x1: I.x1, y0: I.y0, y1: I.y1,
    b: { links: { typ: 'rand' }, rechts: { typ: 'rand' }, vorne: { typ: 'rand' }, hinten: { typ: 'rand' } } }];
  const waende = [], ungueltig = [];
  // AUSSENWÄNDE (Manolo 16.09.2026, je Seite wählbar): lange Trennwände ohne
  // Querverbindung tragen wenig — Aussenwände geben dem Gitter einen Rahmen.
  // Sie sind die ältesten Wände (ids −4…−1, `fest`): unten/oben gehen
  // durch, links/rechts laufen bis zur Kante und ÜBERBLATTEN sich mit ihnen
  // in den Ecken wie ein Steckkreuz (Schlitz von vorne im Boden/Deckel, von
  // hinten in der Seitenwand) — eine Schwalbenschwanz-Nut so dicht an der
  // Plattenkante hätte auf einer Seite keinen Hinterschnitt (17.09.2026).
  // Das Grundfach schrumpft um die Wanddicke, jüngere Wände enden an den
  // Aussenwänden wie an jeder älteren Wand (Nut in der Aussenwand).
  const AW = P.aussen || {}, rand = { typ: 'rand' }, root = faecher[0];
  const ID = { unten: -4, oben: -3, links: -2, rechts: -1 };   // unten/oben = Rack-Boden/-Deckel (im Gitter-Koordinatensystem y0/y1)
  const aussenWand = (id, dir, c, lo, hi, e0, e1) => {
    const eckKreuz = [];                          // Ecke: Schlitz von hinten in dieser Wand, von vorne in der anderen
    for (const e of [e0, e1]) if (e.typ === 'ecke') { const q = waende.find((x) => x.id === e.id); q.eckSchlitze.push(c); eckKreuz.push(q.c); }
    waende.push({ id, dir, c, lo, hi, enden: [e0, e1], nuten: [], eckSchlitze: [], eckKreuz, mNeu: (lo + hi) / 2, fest: true });
  };
  if (AW.unten) { aussenWand(ID.unten, 'h', I.y0 + ts / 2, I.x0, I.x1, rand, rand); root.y0 = I.y0 + ts; root.b.vorne = { typ: 'trenn', id: ID.unten }; }
  if (AW.oben) { aussenWand(ID.oben, 'h', I.y1 - ts / 2, I.x0, I.x1, rand, rand); root.y1 = I.y1 - ts; root.b.hinten = { typ: 'trenn', id: ID.oben }; }
  const eV = AW.unten ? { typ: 'ecke', id: ID.unten } : rand, eH = AW.oben ? { typ: 'ecke', id: ID.oben } : rand;
  if (AW.links) { aussenWand(ID.links, 'v', I.x0 + ts / 2, I.y0, I.y1, eV, eH); root.x0 = I.x0 + ts; root.b.links = { typ: 'trenn', id: ID.links }; }
  if (AW.rechts) { aussenWand(ID.rechts, 'v', I.x1 - ts / 2, I.y0, I.y1, eV, eH); root.x1 = I.x1 - ts; root.b.rechts = { typ: 'trenn', id: ID.rechts }; }
  const sortiert = [...trenn].sort((a, b) => a.id - b.id);
  for (const w of sortiert) {
    const v = w.dir === 'v';
    // Fach finden: zuerst über die gemerkten Nachbarn (zw = [Anfang, Ende] als
    // Wand-id oder 'rand') — so bleibt ein Teil in seinem Fach, auch wenn die
    // ältere Wand daran über den Anker hinaus verschoben wird; sonst über den Anker.
    const key = (b) => (b.typ === 'trenn' ? b.id : 'rand');
    let r = null;
    if (Array.isArray(w.zw)) {
      r = faecher.find((f) => (v ? (w.c > f.x0 && w.c < f.x1) : (w.c > f.y0 && w.c < f.y1))
        && key(v ? f.b.vorne : f.b.links) === w.zw[0] && key(v ? f.b.hinten : f.b.rechts) === w.zw[1]) || null;
    }
    if (!r) for (const f of faecher) {
      const innenQuer = v ? (w.c > f.x0 && w.c < f.x1) : (w.c > f.y0 && w.c < f.y1);
      const innenLaengs = v ? (w.m >= f.y0 - 1e-6 && w.m <= f.y1 + 1e-6) : (w.m >= f.x0 - 1e-6 && w.m <= f.x1 + 1e-6);
      if (innenQuer && innenLaengs) { r = f; break; }
    }
    const lo = v ? (r && r.x0) : (r && r.y0), hi = v ? (r && r.x1) : (r && r.y1);
    if (!r || w.c - lo < FACH_MIN - 1e-6 || hi - w.c < FACH_MIN - 1e-6) { ungueltig.push(w.id); continue; }
    const enden = v ? [r.b.vorne, r.b.hinten] : [r.b.links, r.b.rechts];
    const span = v ? [r.y0, r.y1] : [r.x0, r.x1];
    // Ältere Trennwand am Ende? Dort entsteht ein Anschluss (Nut bzw. — wenn
    // von beiden Seiten je eine jüngere Wand ankommt — ein Steckkreuz).
    enden.forEach((e, k) => {
      if (e.typ !== 'trenn') return;
      const q = waende.find((x) => x.id === e.id);
      let n = q.nuten.find((x) => Math.abs(x.c - w.c) < 1e-6);
      if (!n) { n = { c: w.c, m: null, p: null }; q.nuten.push(n); }
      // k = 0: diese Wand liegt auf der +Seite der älteren (ihr lo = q.c + ts/2), k = 1: auf der −Seite
      if (k === 0) n.p = w.id; else n.m = w.id;
    });
    waende.push({ id: w.id, dir: w.dir, c: w.c, lo: span[0], hi: span[1], enden, nuten: [], mNeu: (span[0] + span[1]) / 2, zwNeu: [key(enden[0]), key(enden[1])] });
    const idx = faecher.indexOf(r);
    const a = { ...r, b: { ...r.b } }, b = { ...r, b: { ...r.b } };
    if (v) { a.x1 = w.c - ts / 2; a.b.rechts = { typ: 'trenn', id: w.id }; b.x0 = w.c + ts / 2; b.b.links = { typ: 'trenn', id: w.id }; }
    else { a.y1 = w.c - ts / 2; a.b.hinten = { typ: 'trenn', id: w.id }; b.y0 = w.c + ts / 2; b.b.vorne = { typ: 'trenn', id: w.id }; }
    faecher.splice(idx, 1, a, b);
  }
  const A = { grund: I, faecher, waende, ungueltig, rasterX: rasterLinien(I.x0, I.x1), rasterY: rasterLinien(I.y0, I.y1) };
  A.teile = teileBilden(A);
  return A;
}

// Druckteile: Teilstücke, die eine ältere Wand von beiden Seiten an derselben
// Stelle treffen, werden zu EINEM Teil mit Steckschlitz (Steckkreuz) verbunden.
function teileBilden(A) {
  const byId = new Map(A.waende.map((w) => [w.id, w]));
  const chef = new Map(A.waende.map((w) => [w.id, w.id]));
  const find = (i) => { while (chef.get(i) !== i) i = chef.get(i); return i; };
  const union = (a, b) => { chef.set(find(a), find(b)); };
  for (const q of A.waende) for (const n of q.nuten) if (n.m != null && n.p != null) union(n.m, n.p);
  const gruppen = new Map();
  for (const w of A.waende) { const g = find(w.id); if (!gruppen.has(g)) gruppen.set(g, []); gruppen.get(g).push(w); }
  const teile = [];
  for (const glieder of gruppen.values()) {
    glieder.sort((a, b) => a.lo - b.lo);
    const erste = glieder[0], letzte = glieder[glieder.length - 1];
    // Kreuzungen: ältere Wand, durch die dieses Teil hindurchgeht
    const kreuz = [];
    for (let i = 0; i < glieder.length - 1; i++) {
      const e = glieder[i].enden[1];          // hi-Ende → ältere Wand
      if (e.typ === 'trenn') kreuz.push(byId.get(e.id).c);
    }
    // Anschlüsse jüngerer Wände an dieses Teil: einseitig → Nut, beidseitig → Steckschlitz oben
    const nuten = [], schlitzeOben = [];
    for (const g of glieder) { kreuz.push(...(g.eckKreuz || [])); schlitzeOben.push(...(g.eckSchlitze || [])); }   // Ecken der Aussenwände
    for (const g of glieder) for (const n of g.nuten) {
      if (n.m != null && n.p != null) schlitzeOben.push(n.c);
      else nuten.push({ c: n.c, seite: n.m != null ? -1 : +1, id: n.m ?? n.p });
    }
    teile.push({ id: Math.min(...glieder.map((g) => g.id)), dir: erste.dir, c: erste.c, glieder, fest: glieder.some((g) => g.fest),
      lo: erste.lo, hi: letzte.hi, endeLo: erste.enden[0], endeHi: letzte.enden[1], kreuz, nuten, schlitzeOben });
  }
  teile.sort((a, b) => a.id - b.id);
  return teile;
}

/** Fach, in dem der Punkt (x, y) liegt — oder null. */
export function fachAn(A, x, y) {
  return A.faecher.find((f) => x > f.x0 && x < f.x1 && y > f.y0 && y < f.y1) || null;
}
/** Nächste zulässige Rasterlage für eine neue Trennwand mitten im Fach (oder null). */
export function teilLage(A, f, dir) {
  const lo = dir === 'v' ? f.x0 : f.y0, hi = dir === 'v' ? f.x1 : f.y1;
  const linien = (dir === 'v' ? A.rasterX : A.rasterY).filter((c) => c - lo >= FACH_MIN - 1e-6 && hi - c >= FACH_MIN - 1e-6);
  if (!linien.length) return null;
  const mitte = (lo + hi) / 2;
  return linien.reduce((best, c) => (Math.abs(c - mitte) < Math.abs(best - mitte) ? c : best), linien[0]);
}
/** Zusammenhang: wie viele lose Gruppen bilden die Teile (ohne Bodenplatte)? */
export function gruppen(A) {
  const teile = A.teile;
  if (!teile.length) return 0;
  const idx = new Map(); teile.forEach((t, i) => { for (const g of t.glieder) idx.set(g.id, i); });
  const chef = teile.map((_, i) => i);
  const find = (i) => { while (chef[i] !== i) i = chef[i]; return i; };
  teile.forEach((t, i) => {
    for (const e of [t.endeLo, t.endeHi]) if (e.typ === 'trenn' || e.typ === 'ecke') chef[find(i)] = find(idx.get(e.id));
    for (const g of t.glieder) for (const e of g.enden) if (e.typ === 'trenn' || e.typ === 'ecke') chef[find(i)] = find(idx.get(e.id));
  });
  return new Set(teile.map((_, i) => find(i))).size;
}

// ---------- Mesh-Bauer: Prismen aus 2D-Polygonen, je Körper eine Schale ----------
export function meshBauer(palette) {
  const pos = [], idx = [], farbe = [];
  let map = new Map(), schaleStart = 0;
  const neueSchale = () => { map = new Map(); schaleStart = idx.length; };
  const punkt = (x, y, z) => {
    const k = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    let i = map.get(k);
    if (i === undefined) { i = pos.length / 3; pos.push(x, y, z); map.set(k, i); }
    return i;
  };
  const tri = (a, b, c, f) => { if (a === b || b === c || a === c) return; idx.push(a, b, c); farbe.push(f); };
  const schaleFertig = () => {
    let v = 0;
    for (let k = schaleStart; k < idx.length; k += 3) {
      const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
      v += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
          + pos[a + 1] * (pos[b + 2] * pos[c] - pos[b] * pos[c + 2])
          + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6;
    }
    if (v < 0) for (let k = schaleStart; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    return Math.abs(v);
  };
  return {
    /** Polygon `aussen` (mit `loecher`) in der Ebene (a, b), extrudiert d0…d1; `ab` bildet (a, b, d) auf (x, y, z) ab. */
    prisma(aussen, loecher, ab, d0, d1, f, triangulate) {
      neueSchale();
      const flaeche = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0);
      const A = flaeche(aussen) < 0 ? [...aussen].reverse() : aussen;
      const H = loecher.map((h) => (flaeche(h) > 0 ? [...h].reverse() : h));
      const ringe = [A, ...H];
      const alle = ringe.flat();
      const tris = triangulate(A, H);
      const P = (p, d) => { const [x, y, z] = ab(p[0], p[1], d); return punkt(x, y, z); };
      for (let [i, j, k] of tris) {
        if (flaeche([alle[i], alle[j], alle[k]]) < 0) { const t = j; j = k; k = t; }
        tri(P(alle[i], d1), P(alle[j], d1), P(alle[k], d1), f); tri(P(alle[i], d0), P(alle[k], d0), P(alle[j], d0), f);
      }
      for (const ring of ringe) for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        const p0 = P(p, d0), q0 = P(q, d0), q1 = P(q, d1), p1 = P(p, d1);
        tri(p0, q0, q1, f); tri(p0, q1, p1, f);
      }
      return schaleFertig();
    },
    quader(x0, x1, y0, y1, z0, z1, f, triangulate) {
      return this.prisma([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [], (a, b, d) => [a, b, d], z0, z1, f, triangulate);
    },
    fertig() {
      return { pos: new Float32Array(pos), idx: new Uint32Array(idx), farbe: new Uint8Array(farbe), palette, n: pos.length / 3 };
    },
  };
}
function saeubern(poly) {
  const out = [];
  for (const p of poly) { const l = out[out.length - 1]; if (!l || Math.abs(l[0] - p[0]) > 1e-6 || Math.abs(l[1] - p[1]) > 1e-6) out.push(p); }
  while (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-6 && Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
  const res = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
    const kreuz = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(kreuz) > 1e-9) res.push(b);
  }
  return res;
}
// Rechteck [a0,a1]×[b0,b1] mit halben Schwalbenschwanz-Nuten in der Kante b1
// (oben) bzw. b0 (unten). Nut: senkrechte Flanke bei fl, öffnet sich nach
// `richtung` (±1) mit Hals `hals` an der Kante und Grund `grund` in Tiefe kd.
function rechteckMitNuten(a0, a1, b0, b1, nuten, kd) {
  const oben = nuten.filter((n) => n.kante === 'oben').sort((x, y) => x.fl - y.fl);
  const unten = nuten.filter((n) => n.kante === 'unten').sort((x, y) => x.fl - y.fl);
  const X = (x) => Math.min(a1, Math.max(a0, x));   // Kerbe an einer Naht: nur der Teil im Rechteck
  const pts = [[a0, b0]];
  for (const n of unten) {                       // Unterkante von links nach rechts
    const r = n.richtung;
    if (r > 0) pts.push([X(n.fl), b0], [X(n.fl), b0 + kd], [X(n.fl + n.grund), b0 + kd], [X(n.fl + n.hals), b0]);
    else pts.push([X(n.fl - n.hals), b0], [X(n.fl - n.grund), b0 + kd], [X(n.fl), b0 + kd], [X(n.fl), b0]);
  }
  pts.push([a1, b0], [a1, b1]);
  for (const n of [...oben].reverse()) {         // Oberkante von rechts nach links
    const r = n.richtung;
    if (r > 0) pts.push([X(n.fl + n.hals), b1], [X(n.fl + n.grund), b1 - kd], [X(n.fl), b1 - kd], [X(n.fl), b1]);
    else pts.push([X(n.fl), b1], [X(n.fl), b1 - kd], [X(n.fl - n.grund), b1 - kd], [X(n.fl - n.hals), b1]);
  }
  pts.push([a0, b1]);
  return saeubern(pts);
}

// ---------- Druckbett: Teilung grosser Platten ----------
// Ein Druckteil, das nicht aufs Bett passt (Breite bis 450, Tiefe/Höhe bis
// 350), wird in STÜCKE geteilt, die mit Steck-Schwalbenschwänzen im Umriss
// (Puzzle-Zapfen, durch die Dicke) zusammenhalten: Hals 8, Fuss 12, 6 tief,
// Luft 0.15 je Seite. Die Stücke werden flach liegend ineinandergedrückt und
// bilden dann eine Platte; im Gitter halten zusätzlich die Nachbarwände.
// Senkrechte Nähte meiden Nuten und Schlitze; eine waagrechte Naht liegt
// auf halber Höhe — genau am Grund der Steckschlitze, darum zerfällt die
// betroffene Reihe dort in Teilstücke, die die andere Reihe überbrückt.
// ZWISCHENBÖDEN tragen Last: eine Naht frei im Fach wäre ein Gelenk. Ihre
// Nähte liegen darum an einer STÜTZE — an einer kreuzenden Trennwand (deren
// Schlitz beide Stücke über die halbe Tiefe fasst) oder an einer von unten
// anstossenden (ihre Schwalbenschwanz-Leiste hält beide Stücke). Gibt es im
// zulässigen Bereich keine, bleibt die Naht ungestützt und wird gemeldet
// (naehte.gestuetzt), die App verlangt dann eine Stütz-Trennwand.
export const ZAPFEN = { hals: 8, fuss: 12, tiefe: 6, spiel: 0.15, abstand: 42, rand: 9 };
/** Kachelung einer len×wid-Platte aufs Bett: wenige Stücke, Bett drehbar. */
export function kacheln(len, wid) {
  const a = { nx: Math.ceil(len / BETT.y - 1e-9), ny: Math.ceil(wid / BETT.x - 1e-9) };
  const b = { nx: Math.ceil(len / BETT.x - 1e-9), ny: Math.ceil(wid / BETT.y - 1e-9) };
  return a.nx * a.ny <= b.nx * b.ny ? a : b;
}
// Nahtlagen längs (senkrechte Nähte) im Abstand ≥ 8 von Sperrzonen
function nahtLagen(L, n, sperren) {
  const out = [];
  for (let i = 1; i < n; i++) {
    const ideal = L * i / n;
    let best = null;
    for (let d = 0; d <= 60 && best === null; d += 1) for (const c of d ? [ideal - d, ideal + d] : [ideal]) {
      if (c < 25 || c > L - 25) continue;
      if (sperren.some(([a, b]) => c > a - 8 && c < b + 8)) continue;
      best = c; break;
    }
    out.push(best ?? ideal);
  }
  return out;
}
// Zapfenlagen entlang einer Naht der Länge [lo, hi], Sperrzonen meiden
function zapfenLagen(lo, hi, sperren) {
  const len = hi - lo;
  if (len < 2 * ZAPFEN.rand + ZAPFEN.fuss) return [];
  const n = Math.max(1, Math.floor((len - 2 * ZAPFEN.rand) / ZAPFEN.abstand) + 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const ideal = n === 1 ? (lo + hi) / 2 : lo + ZAPFEN.rand + (len - 2 * ZAPFEN.rand) * i / (n - 1);
    let best = null;
    for (let d = 0; d <= 30 && best === null; d += 1) for (const c of d ? [ideal - d, ideal + d] : [ideal]) {
      if (c < lo + ZAPFEN.rand || c > hi - ZAPFEN.rand) continue;
      if (sperren.some(([a, b]) => c > a - ZAPFEN.fuss / 2 - 1 && c < b + ZAPFEN.fuss / 2 + 1)) continue;
      if (out.some((x) => Math.abs(x - c) < ZAPFEN.fuss + 4)) continue;
      best = c; break;
    }
    if (best !== null) out.push(best);
  }
  return out;
}

// Umriss eines Plattenstücks [a,b]×[ya,yb] (gegen den Uhrzeigersinn) mit
// Kanten-Merkmalen: Schlitze (rechteckige Kerben), Zapfen (Puzzle-Schwalben-
// schwanz nach aussen) und Zapfenkerben (nach innen, mit Luft).
//   kanten = { unten:[…], rechts:[…], oben:[…], links:[…] }, Merkmal =
//   { p: Lage entlang der Kante, art: 'schlitz'|'zapfen'|'kerbe', tiefe?, s0?, s1? }
//   Ein Schlitz reicht von s0 bis s1 — liegt eine Naht mitten im Schlitz, trägt
//   jedes Stück nur seine Hälfte, die Kerbe endet dann an der Stückkante.
function stueckUmriss(a, b, ya, yb, kanten) {
  const Z = ZAPFEN, s = Z.spiel;
  const pts = [];
  const kante = (liste, von, bis, entlang, quer, vz) => {
    const sort = [...liste].sort((x, y) => (x.p - y.p) * vz);
    pts.push(entlang(von));
    for (const m of sort) {
      if (m.art === 'schlitz') {
        const [u, w] = vz > 0 ? [m.s0, m.s1] : [m.s1, m.s0];
        pts.push(entlang(u), quer(u, m.tiefe), quer(w, m.tiefe), entlang(w));
      } else if (m.art === 'zapfen') {                  // nach aussen (quer negativ)
        pts.push(entlang(m.p - vz * Z.hals / 2), quer(m.p - vz * Z.fuss / 2, -Z.tiefe), quer(m.p + vz * Z.fuss / 2, -Z.tiefe), entlang(m.p + vz * Z.hals / 2));
      } else {                                          // Kerbe nach innen, mit Luft
        pts.push(entlang(m.p - vz * (Z.hals / 2 + s)), quer(m.p - vz * (Z.fuss / 2 + s), Z.tiefe + s), quer(m.p + vz * (Z.fuss / 2 + s), Z.tiefe + s), entlang(m.p + vz * (Z.hals / 2 + s)));
      }
    }
    pts.push(entlang(bis));
  };
  kante(kanten.unten || [], a, b, (t) => [t, ya], (t, d) => [t, ya + d], +1);       // unten, links → rechts
  kante(kanten.rechts || [], ya, yb, (t) => [b, t], (t, d) => [b - d, t], +1);      // rechts, unten → oben
  kante(kanten.oben || [], b, a, (t) => [t, yb], (t, d) => [t, yb - d], -1);        // oben, rechts → links
  kante(kanten.links || [], yb, ya, (t) => [a, t], (t, d) => [a + d, t], -1);       // links, oben → unten
  return saeubern(pts);
}

// ---------- Trennwand-Teil (liegend) ----------
// Platte in (X = längs, Y = Höhe), Dicke in Z (0 … ts); bündige Fläche = Z = 0.
// texte: [{ laeufe: [[x0, x1, z0, z1], …] }] in Gitterkoordinaten (x längs des
// Zwischenbodens, z = Tiefe), erhaben auf der Fläche Z = 0 — das ist beim
// Zwischenboden die OBERSEITE; für den Druck wird ein beschrifteter Boden
// gedreht (Oberseite nach oben) exportiert.
// Rückgabe: stuecke = [{ mesh, xa, xb, ya, yb, reihe, spalte }] — mehrere,
// wenn die Platte nicht aufs Bett passt; alle in denselben Plattenkoordinaten.
export function teilMesh(P, A, teil, triangulate, farben, texte) {
  const ts = P.ts, th = P.h - (P.boden ? P.bodenDicke : 0), o = STECK.ueber;
  const s = DOVE.spiel, kd = DOVE.kd, wn = ts - DOVE.hs, hals = wn + 2 * s, grund = ts + 2 * s;
  const byId = new Map(A.waende.map((w) => [w.id, w]));
  const ende = (e, kante, seite) => {
    if (e.typ !== 'trenn') return { u: kante, leiste: false };
    const q = byId.get(e.id);
    return { u: q.c - seite * (ts / 2) - seite * (DOVE.ende - 0.1), leiste: true };
  };
  const E0 = ende(teil.endeLo, teil.lo, -1), E1 = ende(teil.endeHi, teil.hi, +1);
  const L = E1.u - E0.u, U = (welt) => welt - E0.u;
  const sgnFl = teil.dir === 'v' ? +1 : -1;
  const nutX = (c) => ({ fl: U(c + sgnFl * (ts / 2 + s)), richtung: -sgnFl });
  const nutFlaeche = (seite) => (teil.dir === 'v' ? (seite < 0 ? 0 : ts) : (seite < 0 ? ts : 0));
  const rand = 1.2;
  const nutAbschnitte = teil.nuten.map((n) => {
    const { fl, richtung } = nutX(n.c);
    const x0 = Math.min(fl, fl + richtung * grund) - rand, x1 = Math.max(fl, fl + richtung * grund) + rand;
    return { x0, x1, fl, richtung, kante: nutFlaeche(n.seite) === ts ? 'oben' : 'unten', hals, grund };
  }).sort((a, b) => a.x0 - b.x0);
  const hw = ts / 2 + STECK.spiel;
  const schlitze = [...teil.schlitzeOben.map((c) => ({ x: U(c), art: 'oben' })), ...teil.kreuz.map((c) => ({ x: U(c), art: 'unten' }))];
  // ---- Teilung: Spalten (senkrechte Nähte) und ggf. zwei Reihen
  const plan = th <= BETT.x ? { spaltenL: BETT.y, reihen: 1 } : th <= BETT.y ? { spaltenL: BETT.x, reihen: 1 } : { spaltenL: BETT.y, reihen: 2 };
  const nSpalten = Math.ceil(L / plan.spaltenL - 1e-9);
  // Sperrzonen für senkrechte Nähte: Nuten, Schlitze — bei Reihenteilung
  // schneidet ein Schlitz die Reihe durch, die Naht bleibt darum 24 mm weg,
  // damit kein schmaler Splitter ohne Platz für einen Zapfen entsteht
  const splitter = plan.reihen === 2 ? 24 : 0;
  const sperrX = [...nutAbschnitte.map((n) => [n.x0, n.x1]), ...schlitze.map((q) => [q.x - hw - splitter, q.x + hw + splitter])];
  const stuetzen = teil.dir === 'h' && !teil.fest;   // Zwischenboden: Naht an eine Stütze (Aussenwand unten liegt auf, oben trägt nichts)
  let sx = [], gestuetzt = [];
  if (nSpalten > 1) {
    const frei = nahtLagen(L, nSpalten, sperrX);
    if (!stuetzen) { sx = frei; gestuetzt = frei.map(() => true); }
    else {
      const kand = [...teil.kreuz, ...teil.schlitzeOben, ...teil.nuten.filter((n) => n.seite < 0).map((n) => n.c)].map((c) => U(c)).sort((a, b) => a - b);
      let prev = 0;
      for (let i = 1; i < nSpalten; i++) {
        const ideal = L * i / nSpalten;
        const lo = Math.max(prev + 25, L - (nSpalten - i) * plan.spaltenL), hi = Math.min(prev + plan.spaltenL, L - 25);
        const ok = kand.filter((c) => c >= lo && c <= hi).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
        if (ok.length) { sx.push(ok[0]); gestuetzt.push(true); }
        else { sx.push(Math.min(hi, Math.max(lo, frei[i - 1]))); gestuetzt.push(false); }
        prev = sx[sx.length - 1];
      }
    }
  }
  const sy = plan.reihen === 2 ? [th / 2] : [];
  const xGrenzen = [0, ...sx, L], yGrenzen = [0, ...sy, th];
  const zapfenY = sy.length ? zapfenLagen(0, L, [...nutAbschnitte.map((n) => [n.x0, n.x1]), ...schlitze.map((q) => [q.x - hw - 6, q.x + hw + 6]), ...sx.map((x) => [x - 8, x + 8])]) : [];
  const stuecke = [];
  let vol = 0;
  const z0 = P.boden ? P.bodenDicke : 0;
  const bodenLeiste = !!P.boden && P.bodenNuten === teil.dir;
  const tiefe = kd - DOVE.ende, tb = BODEN.kd - BODEN.ende;
  for (let r = 0; r < yGrenzen.length - 1; r++) for (let c = 0; c < xGrenzen.length - 1; c++) {
    const xa = xGrenzen[c], xb = xGrenzen[c + 1], ya = yGrenzen[r], yb = yGrenzen[r + 1];
    const inX = (q) => q.x + hw > xa + 0.01 && q.x - hw < xb - 0.01;   // Schlitz ragt ins Stück (auch halb, über eine Naht)
    // Schlitze: ohne Reihenteilung halbhohe Kerben; mit Reihenteilung schneiden
    // sie die betroffene Reihe ganz durch — das Stück zerfällt dort in
    // Teilstücke, die je für sich über die Zapfen an der anderen Reihe hängen
    const kerbenOben = sy.length ? [] : schlitze.filter((q) => q.art === 'oben' && inX(q));
    const kerbenUnten = sy.length ? [] : schlitze.filter((q) => q.art === 'unten' && inX(q));
    const durch = sy.length ? schlitze.filter((q) => inX(q) && ((q.art === 'oben' && r === 1) || (q.art === 'unten' && r === 0))).sort((p, q) => p.x - q.x) : [];
    const teilstuecke = []; let von = xa;
    for (const q of durch) { teilstuecke.push([von, Math.max(von, q.x - hw)]); von = Math.min(xb, q.x + hw); }
    teilstuecke.push([von, xb]);
    // Zapfen an der Naht nur, wo kein halber Schlitz die Kante verkürzt
    const nahtSperr = (x) => [...kerbenOben.filter((q) => Math.abs(q.x - x) < hw + 0.01).map(() => [th / 2 - 1, th + 1]), ...kerbenUnten.filter((q) => Math.abs(q.x - x) < hw + 0.01).map(() => [-1, th / 2 + 1])];
    for (const [sa, sb] of teilstuecke) {
      if (sb - sa < 3) continue;
      const M = meshBauer([farben.trenn, farben.text || farben.trenn]);
      let v = 0;
      // Nuten im Teilstück — eine Nut auf der Naht liegt halb in jedem Stück (geclippt)
      const trenner = nutAbschnitte.filter((n) => n.x1 > sa + 0.5 && n.x0 < sb - 0.5).map((n) => ({ a: Math.max(n.x0, sa), b: Math.min(n.x1, sb), nut: n })).sort((p, q) => p.a - q.a);
      const bereiche = []; let cursor = sa;
      for (const t of trenner) { if (t.a - cursor > 0.5) bereiche.push({ a: cursor, b: t.a, nut: null }); bereiche.push({ a: t.a, b: t.b, nut: t.nut }); cursor = t.b; }
      if (sb - cursor > 0.5) bereiche.push({ a: cursor, b: sb, nut: null });
      // Zapfen der waagrechten Naht in diesem Teilstück; keiner drin → einen in die Mitte
      let zY = zapfenY.filter((x) => x > sa + ZAPFEN.fuss / 2 + 1 && x < sb - ZAPFEN.fuss / 2 - 1);
      if (sy.length && !zY.length && sb - sa >= ZAPFEN.fuss + 6) zY = [(sa + sb) / 2];
      for (let k = 0; k < bereiche.length; k++) {
        const br = bereiche[k];
        if (br.nut) {                                     // Nut-Abschnitt: Profil (X, Z) über die Reihenhöhe
          const prof = rechteckMitNuten(br.a, br.b, 0, ts, [br.nut], kd);
          v += M.prisma(prof, [], (x, z, d) => [x, d, z], ya, yb, 0, triangulate);
          continue;
        }
        const a = br.a - (k > 0 && bereiche[k - 1].nut ? o : 0), b = br.b + (k < bereiche.length - 1 && bereiche[k + 1].nut ? o : 0);
        const kanten = { unten: [], oben: [], links: [], rechts: [] };
        for (const q of kerbenUnten) if (q.x + hw > a && q.x - hw < b) kanten.unten.push({ p: q.x, art: 'schlitz', s0: Math.max(q.x - hw, sa), s1: Math.min(q.x + hw, sb), tiefe: th / 2 });
        for (const q of kerbenOben) if (q.x + hw > a && q.x - hw < b) kanten.oben.push({ p: q.x, art: 'schlitz', s0: Math.max(q.x - hw, sa), s1: Math.min(q.x + hw, sb), tiefe: th / 2 });
        for (const x of zY) if (x > a + ZAPFEN.fuss / 2 && x < b - ZAPFEN.fuss / 2) (r === 0 ? kanten.oben : kanten.unten).push({ p: x, art: r === 0 ? 'zapfen' : 'kerbe' });
        if (br.b === xb && c < xGrenzen.length - 2) for (const y of zapfenLagen(ya, yb, nahtSperr(xb))) kanten.rechts.push({ p: y, art: 'zapfen' });
        if (br.a === xa && c > 0) for (const y of zapfenLagen(ya, yb, nahtSperr(xa))) kanten.links.push({ p: y, art: 'kerbe' });
        v += M.prisma(stueckUmriss(a, b, ya, yb, kanten), [], (x, y, d) => [x, y, d], 0, ts, 0, triangulate);
      }
      if (E0.leiste && sa === xa && c === 0) v += M.prisma([[o, 0], [-tiefe, 0], [-tiefe, ts], [0, ts - DOVE.hs], [o, ts - DOVE.hs]], [], (x, z, d) => [x, d, z], ya, yb, 0, triangulate);
      if (E1.leiste && sb === xb && c === xGrenzen.length - 2) v += M.prisma([[L - o, 0], [L + tiefe, 0], [L + tiefe, ts], [L, ts - DOVE.hs], [L - o, ts - DOVE.hs]], [], (x, z, d) => [x, d, z], ya, yb, 0, triangulate);
      if (bodenLeiste && r === 0) v += M.prisma([[o, 0], [-tb, 0], [-tb, ts], [0, ts - BODEN.hs], [o, ts - BODEN.hs]], [], (y, z, d) => [d, y, z], sa + (sa > 0 ? 0.5 : 0), sb - (sb < L ? 0.5 : 0), 0, triangulate);
      for (const t of texte || []) for (const [wx0, wx1, wz0, wz1] of t.laeufe) {
        const mx = (U(wx0) + U(wx1)) / 2, my = (wz0 + wz1) / 2 - z0;
        if (mx > sa && mx <= sb && my > ya && my <= yb) v += M.quader(U(wx0), U(wx1), wz0 - z0, wz1 - z0, -TEXT_HOEHE, o, 1, triangulate);
      }
      const mesh = M.fertig(); mesh.volMm3 = v; vol += v;
      stuecke.push({ mesh, xa: sa, xb: sb, ya, yb, reihe: r, spalte: c });
    }
  }
  const lage = teil.dir === 'v'
    ? { ursprung: [teil.c - ts / 2, E0.u, z0], X: [0, 1, 0], Y: [0, 0, 1], Z: [1, 0, 0] }
    : { ursprung: [E0.u, teil.c + ts / 2, z0], X: [1, 0, 0], Y: [0, 0, 1], Z: [0, -1, 0] };
  return { stuecke, volMm3: vol, L, th, lage, u0: E0.u, leisten: [E0.leiste, E1.leiste], bodenLeiste, naehte: { x: sx, y: sy, gestuetzt } };
}

// ---------- Bodenplatte (optional) ----------
// Platte b × t × bodenDicke mit halben Schwalbenschwanz-Nuten in EINER
// Richtung, an den Kanten offen. Passt sie nicht aufs Bett, wird sie in
// Stücke gekachelt: Nähte parallel zu den Nuten liegen auf einem Steg
// zwischen zwei Nuten, Nähte quer dazu dürfen überall liegen — die Nuten
// laufen durch, die Leisten der Trennwände überbrücken die Naht. Die
// Stücke liegen lose nebeneinander; das gesteckte Gitter hält sie zusammen.
export function bodenMesh(P, A, triangulate, farbe) {
  const ts = P.ts, s = BODEN.spiel, hals = ts - BODEN.hs + 2 * s, grund = ts + 2 * s, kd = Math.min(BODEN.kd, P.bodenDicke - 1.2);
  const laengs = P.bodenNuten === 'v';
  const aLen = laengs ? P.b : P.t, eLen = laengs ? P.t : P.b;    // a quer zu den Nuten, e längs
  const raster = laengs ? A.rasterX : A.rasterY;
  const nuten = raster.map((c) => laengs
    ? { kante: 'oben', fl: c - ts / 2 - s, richtung: +1, hals, grund }
    : { kante: 'oben', fl: c + ts / 2 + s, richtung: -1, hals, grund });
  const k = kacheln(aLen, eLen);
  const stegMitte = (c) => (laengs ? c + RASTER / 2 : c - RASTER / 2);
  const aNaehte = [];
  for (let i = 1; i < k.nx; i++) {
    const ideal = -aLen / 2 + aLen * i / k.nx;
    const kandidaten = raster.map(stegMitte).filter((x) => Math.abs(x) < aLen / 2 - 15);
    aNaehte.push(kandidaten.length ? kandidaten.reduce((b, x) => (Math.abs(x - ideal) < Math.abs(b - ideal) ? x : b), kandidaten[0]) : ideal);
  }
  const aGrenzen = [-aLen / 2, ...aNaehte, aLen / 2];
  const eGrenzen = []; for (let j = 0; j <= k.ny; j++) eGrenzen.push(-eLen / 2 + eLen * j / k.ny);
  const stuecke = []; let vol = 0;
  for (let i = 0; i < aGrenzen.length - 1; i++) for (let j = 0; j < eGrenzen.length - 1; j++) {
    const M = meshBauer([farbe]);
    const drin = nuten.filter((n) => Math.min(n.fl, n.fl + n.richtung * grund) > aGrenzen[i] && Math.max(n.fl, n.fl + n.richtung * grund) < aGrenzen[i + 1]);
    const prof = rechteckMitNuten(aGrenzen[i], aGrenzen[i + 1], 0, P.bodenDicke, drin, kd);
    const v = laengs
      ? M.prisma(prof, [], (x, z, d) => [x, d, z], eGrenzen[j], eGrenzen[j + 1], 0, triangulate)
      : M.prisma(prof, [], (y, z, d) => [d, y, z], eGrenzen[j], eGrenzen[j + 1], 0, triangulate);
    const mesh = M.fertig(); mesh.volMm3 = v; vol += v;
    stuecke.push({ mesh, a0: aGrenzen[i], a1: aGrenzen[i + 1], e0: eGrenzen[j], e1: eGrenzen[j + 1] });
  }
  return { stuecke, volMm3: vol, laengs };
}

/** Mesh-Punkte verschieben (für den Export mehrerer Teile in einer Datei). */
export function verschoben(mesh, dx, dy, dz) {
  const pos = new Float32Array(mesh.pos);
  for (let i = 0; i < pos.length; i += 3) { pos[i] += dx; pos[i + 1] += dy; pos[i + 2] += dz; }
  return { ...mesh, pos };
}
