// Der Skadis-Einhaengehaken S70 — eingefroren am 17.08.2026 nach fuenf
// Testrunden an Manolos Platte. Dieses Modul ist die JavaScript-Fassung von
// Projekt-Daten/kohlilab-skadis/haken.py; die beiden muessen deckungsgleich
// bleiben. Ein Test vergleicht die Profilflaeche mit dem Python-Wert
// (66.77 mm2) — weicht sie ab, ist etwas verrutscht.
//
// Jede Modulfamilie importiert `hakenProfil()` bzw. `hakenGeometrie()` von
// hier und haengt es an ihre Geometrie. NICHTS davon wird in den Familien
// nachgebaut oder abgewandelt.
//
// Koordinaten des Profils: (y = Hoehe, z = Tiefe). z = 0 ist die RUECKSEITE
// des Moduls, das an der Platte anliegt; der Haken ragt in +z. y = 0 ist die
// Halsunterkante = die Kante, die im Sitz auf dem unteren Lochrand aufliegt.

import * as THREE from 'three';

export const HALS_BREITE = 4.5;
export const HALS_HOEHE = 5.5;
export const NUT = 5.15;
export const ZUNGE_LAENGE = 7.0;
export const ZUNGE_DICKE = 3.0;
export const INNENRADIUS = 1.0;
export const AUFLAGEFASE = 0.6;
export const SPITZENFASE_HINTEN = 2.0;
export const SPITZENFASE_VORN = 1.0;
export const UEBERLAPPUNG = 0.5;

export const HAKEN_TIEFE = NUT + ZUNGE_DICKE;      // 8.15 hinter der Modulrueckseite
export const EINFAEDELMASS = ZUNGE_LAENGE + HALS_HOEHE;

/** Profilpunkte [y, z] im Uhrzeigersinn, exakt wie haken.py. */
export function hakenProfil() {
  const y0 = 0, y1 = HALS_HOEHE, zR = 0, zN = NUT, zH = NUT + ZUNGE_DICKE;
  const yS = -ZUNGE_LAENGE, r = INNENRADIUS, f = AUFLAGEFASE;
  const fh = SPITZENFASE_HINTEN, fv = SPITZENFASE_VORN;
  const pts = [
    [y1, zR - UEBERLAPPUNG], [y1, zH],
    [yS + fh, zH], [yS, zH - fh],
    [yS, zN + fv], [yS + fv, zN],
  ];
  // Innenbogen: Mittelpunkt (y0 - r, zN - r), Winkel 0..90 Grad
  for (let i = 0; i < 10; i++) {
    const a = (i / 9) * Math.PI / 2;
    pts.push([y0 - r + r * Math.sin(a), zN - r + r * Math.cos(a)]);
  }
  pts.push([y0, zR + f], [y0 - f, zR], [y0 - f, zR - UEBERLAPPUNG]);
  return pts;
}

/** Flaeche des Profils (Schnuersenkelformel) — fuer den Abgleich mit Python. */
export function profilFlaeche() {
  const p = hakenProfil();
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [y1, z1] = p[i], [y2, z2] = p[(i + 1) % p.length];
    s += y1 * z2 - y2 * z1;
  }
  return Math.abs(s) / 2;
}

/**
 * Der Haken als three.js-Geometrie: x = Breite (zentriert), y = Hoehe,
 * z = Tiefe. Extrusion des Profils entlang x.
 */
export function hakenGeometrie() {
  const shape = new THREE.Shape();
  const p = hakenProfil();
  // Shape liegt in (y, z) -> wir bauen sie in (a, b) = (z, y), damit die
  // Extrusion entlang der dritten Achse laeuft; danach umsortieren.
  shape.moveTo(p[0][1], p[0][0]);
  for (let i = 1; i < p.length; i++) shape.lineTo(p[i][1], p[i][0]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: HALS_BREITE, bevelEnabled: false });
  // ExtrudeGeometry liefert (a, b, extrude) = (z, y, x'). Die Umsortierung
  // (a,b,e) -> (e,b,a) ist eine SPIEGELUNG (Determinante -1) und kehrt die
  // Windung um: der Haken kaeme inside-out heraus, Normalen nach innen,
  // signiertes Volumen negativ. Ein Slicer liest das als Hohlraum. Beim
  // ersten Export genau so passiert (67 mm2 "Ueberhang" waren in Wahrheit
  // der nach innen zeigende Deckel). Deshalb: umsortieren UND jedes Dreieck
  // in der Reihenfolge umkehren — dann stimmt die Windung wieder.
  const ng = geo.index ? geo.toNonIndexed() : geo;
  const pos = ng.attributes.position;
  const a = pos.array;
  for (let i = 0; i < a.length; i += 9) {
    // drei Ecken lesen, umsortieren, in umgekehrter Reihenfolge schreiben
    const ecken = [];
    for (let k = 0; k < 9; k += 3) ecken.push([a[i+k+2] - HALS_BREITE / 2, a[i+k+1], a[i+k]]);
    ecken.reverse();
    for (let k = 0; k < 3; k++) { a[i+k*3] = ecken[k][0]; a[i+k*3+1] = ecken[k][1]; a[i+k*3+2] = ecken[k][2]; }
  }
  pos.needsUpdate = true;
  ng.computeVertexNormals();
  return ng;
}
