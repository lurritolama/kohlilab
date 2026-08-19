// Modulfamilien des Lochwand-Planers.
//
// Der Brief (§4) verlangt wenige parametrische Grundtypen statt vieler
// Einzelmodelle, und eine Architektur, bei der eine fuenfte Familie ohne
// Umbau dazukommt. Deshalb ist eine Familie hier EIN Eintrag in FAMILIEN
// mit vier Pflichtteilen:
//
//   parameter   — was der Kunde einstellen kann (mit Grenzen, Schrittweite)
//   geometrie   — Parameter -> three.js-Geometrie des Moduls MIT Haken
//                 (die Haken kommen aus haken.js und werden hier angehaengt)
//   haken       — Parameter -> wo die Haken sitzen: dx = Loecher nach rechts
//                 vom Ankerloch aus, dy = Reihen nach oben (Rastereinheiten)
//   drucklage   — 'seite' (Modul-x wird Bauhoehe; Haken/Arm an einer Kante)
//                 oder 'stehend' (Modul-y wird Bauhoehe; Boden am Bett).
//                 Der Export dreht danach; lochwand-pruefen.py prueft beide.
//
// Die BELEGUNG (welchen Platz das Modul auf der Platte braucht, fuer die
// Kollision §5) pflegt niemand von Hand: `umriss()` leitet sie aus der
// Geometrie ab (Huellquader). Was gezeichnet wird, kollidiert — nichts kann
// auseinanderlaufen.
//
// Etappe 2 kennt zwei Familien: Haken und Wanne. Halter und Klemme folgen
// als weitere Eintraege in dieser Liste.
//
// Rasterlogik (§3): ein Modul sitzt an einem Loch (reihe, spalte, brett) =
// dem ANKERLOCH, in dem sein erster Haken haengt (vom Betrachter aus der
// linke). Millimeter entstehen erst in `geometrie()`.
//
// MODULRAUM. x = Breite, y = Hoehe (oben +y), z = Tiefe (+z = hinter der
// Platte, dort haengt der Haken; -z = zum Betrachter). Ursprung (0,0,0) =
// Mitte der Halsunterkante des ERSTEN Hakens = Unterkante des Ankerlochs.
// ACHTUNG x: der Modulraum ist "von hinten" definiert (aus haken.py geerbt,
// z zeigt hinter die Platte). Auf der Buehne wird das Modul um 180 Grad um y
// gedreht, damit der Haken hinter die Platte kommt — dabei kippt x: Modul
// +x ist fuer den BETRACHTER LINKS. Weitere Haken (dx nach rechts) sitzen
// deshalb bei Modul-x = -dx * RASTER. `umriss()` rechnet das in Betrachter-
// koordinaten um, ausserhalb dieser Datei muss das niemand wissen.
//
// Drucklage (Etappe 0, Lasttest): alle Haken eines Moduls sitzen an DER-
// SELBEN Modulkante, damit das Modul auf der Seite liegend stuetzenfrei
// druckt. Fuer die Hakenfamilie heisst das: der Einhaengehaken sitzt oben
// buendig an der Modulplatte, der Tragarm darunter.

import * as THREE from 'three';
import { RASTER, REIHEN_TEILUNG, PLATTE_DICKE } from './raster.js';
import { hakenGeometrie, HALS_BREITE, HALS_HOEHE, HAKEN_TIEFE } from './haken.js';

// Materialdaten fuer den Preis (wie Organizer: PETG, 25 g/h)
export const DICHTE_G_CM3 = 1.27;

/** Rundet auf die Schrittweite eines Parameters. */
function rastere(wert, p) {
  const v = Math.round((wert - p.min) / p.schritt) * p.schritt + p.min;
  return Math.min(p.max, Math.max(p.min, v));
}

// ---------------------------------------------------------------- Familie: Haken
//
// Ein einfacher Wandhaken: Modulplatte (liegt an der Skadis an), daran der
// Einhaengehaken oben, und ein Tragarm nach vorne mit aufgebogener Spitze.
// Parameter (§4.3): Laenge, Winkel, Durchmesser (hier: Armstaerke), Endkappe.
const HAKEN = {
  id: 'haken',
  name: 'Haken',
  kurz: 'für Werkzeug, Kabel, Taschen',
  drucklage: 'seite',     // auf der Seite: Modul-x wird Bauhoehe (Testkamm/Lasttest)
  parameter: {
    // Manolo 18.08.2026: Laenge max 60, Armstaerke min 8; die Endkappe ist weg —
    // die Nase ist jetzt Teil des geschwungenen Profils.
    laenge:  { name: 'Länge',        min: 20,  max: 60,  schritt: 5,  einheit: 'mm', start: 40 },
    winkel:  { name: 'Aufbiegung',   min: 0,   max: 60,  schritt: 5,  einheit: '°',  start: 30 },
    staerke: { name: 'Armstärke',    min: 8,   max: 12,  schritt: 1,  einheit: 'mm', start: 8 },
  },
  // DRUCKREGEL (Etappe 0, Lasttest; hier beim ersten Export gleich wieder
  // gestolpert): In der Seitenlage steht das Modul auf seiner -x-Kante.
  // ALLES, was tragen soll — Einhaengehaken UND Tragarm — muss an dieser
  // Kante buendig sitzen, sonst schwebt es auf halber Bauhoehe. Beim ersten
  // Export sass beides mittig auf einer 16-mm-Platte: 471 mm2 Ueberhang.
  // Deshalb: die Modulplatte ist genau so breit wie der Arm bzw. der Haken
  // (das groessere von beiden), und beide liegen an derselben Kante an.
  masse(p) {
    const plattenB = Math.max(HALS_BREITE, p.staerke);   // so breit wie noetig
    const plattenH = 34;                                  // 34 (statt 30): Platz fuer Arm + Fusskehle bei 12 mm Armstaerke
    return { plattenB, plattenH, plattenT: 5 };
  },
  haken(p) {
    return [{ dx: 0, dy: 0 }];
  },
  // Keine Beschriftung (Manolo, 18.08.2026): der Arm ist zu schmal, es
  // gaebe nur eine winzige, teure Schrift. Weder Ebene noch Schild.
  geometrie(p) {
    const { plattenB, plattenH, plattenT } = this.masse(p);
    const teile = [];
    // Alles buendig an EINER Kante (die Bettkante in Drucklage). Haken ist
    // 4.5 breit und sitzt zentriert im Ursprung, Arm p.staerke: beide
    // beginnen an derselben Kante x = -2.25 und wachsen in +x.
    const kante = -HALS_BREITE / 2;

    // Die Modulplatte in ZWEI Zonen: hinter dem Einhaengehaken genau so breit
    // wie der Haken (4.5) — sonst schwebt in der Seitenlage der Ueberstand
    // der Platte ueber dem 4.5 mm breiten Haken (67 mm2, dritter Anlauf).
    // Darunter, wo der Arm ansetzt, so breit wie der Arm. Beide Zonen
    // buendig an der Kante.
    const hakenZoneH = HALS_HOEHE + 8;                     // Haken (12.5 hoch) + Luft
    const oben = new THREE.BoxGeometry(HALS_BREITE, hakenZoneH, plattenT);
    oben.translate(kante + HALS_BREITE / 2, HALS_HOEHE - hakenZoneH / 2 + 2, -plattenT / 2);
    teile.push(oben);
    const untenH = plattenH - hakenZoneH + 2;
    const unten = new THREE.BoxGeometry(plattenB, untenH, plattenT);
    unten.translate(kante + plattenB / 2, HALS_HOEHE - hakenZoneH + 2 - untenH / 2 + 0.01, -plattenT / 2);
    teile.push(unten);

    // ARM (Neugestaltung 18.08.2026, Manolo: "sieht unfoermig aus"): statt
    // Kastenarm + gekipptem Klotz + Wulst ein EIN Profil in der (s, y)-Ebene,
    // als Flaeche entlang x extrudiert — in der Seitenlage steht das Profil
    // senkrecht, also kein Ueberhang, egal wie geschwungen es ist:
    //   * Mittellinie: gerade nach vorne, dann ein Bogen (Radius 1.3 t) um
    //     `winkel` nach oben, dann eine kurze Nase — Gesamtausladung = laenge
    //   * Dicke t an der Wurzel, zur Spitze auf 0.75 t verjuengt, Spitze halbrund
    //   * Fusskehle: 45-Grad-Keil unter der Wurzel (0.5 t) — traegt und wirkt ruhig
    const t = p.staerke, L = p.laenge;
    const w = THREE.MathUtils.degToRad(p.winkel);
    const R = 1.3 * t, nase = 0.5 * t;
    const armY = -7 - t / 2;                              // Armmitte, unter der Hakenzone (Oberkante -6)
    const Lg = Math.max(0.6 * t, L - R * Math.sin(w) - nase * Math.cos(w));   // gerader Teil
    const s0 = -0.4;                                      // 0.4 mm in der Platte
    // Mittellinie abtasten: [s, y, richtung]
    const mitte = [];
    const nG = 6, nB = Math.max(2, Math.round(p.winkel / 5)), nN = 3;
    for (let i = 0; i <= nG; i++) mitte.push([s0 + (Lg - s0) * i / nG, armY, 0]);
    for (let i = 1; i <= nB; i++) { const th = w * i / nB; mitte.push([Lg + R * Math.sin(th), armY + R * (1 - Math.cos(th)), th]); }
    const eb = mitte[mitte.length - 1];
    for (let i = 1; i <= nN; i++) mitte.push([eb[0] + Math.cos(w) * nase * i / nN, eb[1] + Math.sin(w) * nase * i / nN, w]);
    // Bogenlaenge fuer die Verjuengung
    const laengen = [0]; for (let i = 1; i < mitte.length; i++) laengen.push(laengen[i - 1] + Math.hypot(mitte[i][0] - mitte[i - 1][0], mitte[i][1] - mitte[i - 1][1]));
    const gesamt = laengen[laengen.length - 1];
    const dicke = (i) => t * (1 - 0.25 * laengen[i] / gesamt);
    const obenP = [], untenP = [];
    mitte.forEach((m, i) => { const h = dicke(i) / 2, nx = -Math.sin(m[2]), ny = Math.cos(m[2]); obenP.push([m[0] + nx * h, m[1] + ny * h]); untenP.push([m[0] - nx * h, m[1] - ny * h]); });
    const arm = new THREE.Shape();
    arm.moveTo(s0, armY - t / 2 - 0.5 * t);                // Fusskehle unten (in der Platte)
    arm.lineTo(0.5 * t, armY - t / 2);                     // 45 Grad hoch zur Armunterseite
    for (let i = 1; i < untenP.length; i++) if (untenP[i][0] > 0.5 * t) arm.lineTo(untenP[i][0], untenP[i][1]);
    // Spitze: Halbkreis um den Endpunkt der Mittellinie
    const e = mitte[mitte.length - 1], he = dicke(mitte.length - 1) / 2;
    for (let k = 1; k < 8; k++) { const a = -Math.PI / 2 + Math.PI * k / 8 + e[2]; arm.lineTo(e[0] + he * Math.cos(a), e[1] + he * Math.sin(a)); }
    for (let i = obenP.length - 1; i >= 0; i--) arm.lineTo(obenP[i][0], obenP[i][1]);
    arm.closePath();
    teile.push(extrudiertQuer(arm, t, kante));             // Breite t, buendig an der Kante

    for (const h of this.haken(p)) {
      const hg = hakenGeometrie();                          // zentriert um x=0, Breite 4.5
      hg.translate(-h.dx * RASTER, h.dy * REIHEN_TEILUNG, 0);
      teile.push(hg);
    }
    return teile;
  },
};


// ---------------------------------------------------------------- Familie: Wanne
//
// Deckt ab (Brief §4.1): offene Ablage, geschlossene Box, Stiftebecher —
// alles Kaesten vor der Platte. Parameter: Breite (in Loechern), Tiefe,
// Hoehe, Fachtrenner, Neigung, Boden offen/geschlossen. Die "Schublade" aus
// dem Brief kommt spaeter als eigene Variante — sie braucht zwei Teile.
//
// DRUCKLAGE. Alle sechs Lagen durchgerechnet (17.08.): die Seitenlage des
// Einzelhakens taugt hier NICHT — die obere Seitenwand schwebte als
// 3000-mm2-Platte ueber dem offenen Kasten. Die Wanne druckt STEHEND, wie
// sie auf einem Tisch stuende: Boden am Bett, Rueckwand und Seiten senk-
// recht, Oeffnung nach oben. Und der Haken? Ueberraschung beim Nachrechnen:
// der S70 stehend gedruckt hat 0 mm2 Ueberhang. Seine Zunge zeigt nach
// UNTEN (sie haengt hinter der Platte herab) — stehend steht er also auf
// der Zungenspitze und waechst zum Hals hoch, ein umgedrehtes L mit
// 45-Grad-Fasen. Nichts haengt. Die Wanne ist damit komplett stuetzenfrei,
// die Haken bleiben unveraendert S70. Eine "Hakenleiste" (erster Anlauf)
// war ein Denkfehler aus der Seitenlage und ist wieder raus.
// Boden und Waende: 2.4 mm (6 Bahnen), stabil und schnell.
const WAND = 2.4;

/**
 * Prisma ueber einer ebenen Kontur (Shape in (x, s), s = Abstand von der
 * Platte nach vorne): Boden flach bei yBoden, Deckel schraeg — die Hoehe
 * ueber dem Boden ist hoeheBei(s), linear in s, also eine Ebene. Seiten
 * senkrecht. Ergibt den Keil der Wanne; die Kontur darf gerundet sein.
 * Windung: numerisch geprueft (werkzeug/lochwand-koerper-check.mjs) —
 * signiertes Volumen positiv, alle Kanten zweimal.
 */
/**
 * Grundriss-Kontur eines Kastens/einer Konsole in (x, s): s = Abstand von
 * der Platte nach vorne (0..sT). Vordere Ecken mit Radius rr gerundet,
 * hintere eckig (liegen an der Platte). `einzug` rueckt die ganze Kontur
 * nach innen (Wandstaerke) — der Radius schrumpft mit.
 * `kerben`: [{x, s, breite}] — nach vorne offene Schlitze in der Front-
 * kante (Halter: Kabel von vorne einlegen). Sie laufen von der Frontkante
 * bis s und enden halbrund. Muessen im geraden Teil der Front liegen.
 */
function kontur(ax0, ax1, sT, rr, einzug, kerben = [], sStart = null) {
  const X0 = ax0 + einzug, X1 = ax1 - einzug, S0 = sStart ?? einzug, S1 = sT - einzug;
  const R = Math.max(0, rr - einzug);
  const sh = new THREE.Shape();
  sh.moveTo(X0, S0); sh.lineTo(X1, S0);
  if (R > 0.05) { sh.lineTo(X1, S1 - R); sh.absarc(X1 - R, S1 - R, R, 0, Math.PI / 2, false); }
  else sh.lineTo(X1, S1);
  // Frontkante von rechts (X1) nach links (X0): Kerben in fallender x-Folge
  for (const k of [...kerben].sort((a, b) => b.x - a.x)) {
    const w = k.breite / 2;
    sh.lineTo(k.x + w, S1); sh.lineTo(k.x + w, k.s);
    sh.absarc(k.x, k.s, w, 0, Math.PI, true);            // halbrund nach hinten (Uhrzeigersinn)
    sh.lineTo(k.x - w, S1);
  }
  if (R > 0.05) { sh.lineTo(X0 + R, S1); sh.absarc(X0 + R, S1 - R, R, Math.PI / 2, Math.PI, false); }
  else sh.lineTo(X0, S1);
  sh.closePath();
  return sh;
}

/**
 * Extrusion einer (x, s)-Kontur entlang der Hoehe: Shape-x = Modul-x,
 * Shape-s = -Modul-z (nach vorne), Extrusion (0..tiefeE) = Modul-y ab yStart.
 * rotateX(-90 Grad): (x, s, e) -> (x, e, -s) — eine echte Drehung, keine
 * Spiegelung; die Windung bleibt, wie ExtrudeGeometry sie liefert.
 */
function extrudiert(shape, tiefeE, yStart) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: tiefeE, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, yStart, 0);
  return g;
}

/**
 * Extrusion einer (s, y)-Kontur entlang der Breite: Shape-x = s (nach
 * vorne), Shape-y = Modul-y, Extrusion (0..breiteE) = Modul-x ab xStart.
 * rotateY(+90 Grad): (s, y, e) -> (e, y, -s) — echte Drehung.
 */
function extrudiertQuer(shape, breiteE, xStart) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: breiteE, bevelEnabled: false, curveSegments: 6 });
  g.rotateY(Math.PI / 2);
  g.translate(xStart, 0, 0);
  return g;
}

function keilPrisma(shape, yBoden, hoeheBei) {
  const pts = shape.getPoints(10);
  if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();       // gegen den Uhrzeigersinn in (x, s)
  const tri = THREE.ShapeUtils.triangulateShape(pts, []);
  // Modulraum: (x, s) -> (x, y, -s). Kontur gegen den Uhrzeigersinn in
  // (x, s) heisst von +y aus gesehen (Blick auf x/-z) IM Uhrzeigersinn —
  // deshalb unten (a, b, c) (Normale -y) und oben (a, c, b) (Normale +y),
  // Seiten entsprechend. Erste Fassung genau umgekehrt: Volumen -65565.
  const P = (i, oben) => [pts[i].x, oben ? yBoden + hoeheBei(pts[i].y) : yBoden, -pts[i].y];
  const dreiecke = [];
  for (const [a, b, c] of tri) { dreiecke.push([P(a, false), P(c, false), P(b, false)]); dreiecke.push([P(a, true), P(b, true), P(c, true)]); }
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    dreiecke.push([P(i, false), P(j, true), P(i, true)]);
    dreiecke.push([P(i, false), P(j, false), P(j, true)]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dreiecke.flat(2)), 3));
  g.computeVertexNormals();
  return g;
}

const WANNE = {
  id: 'wanne',
  name: 'Wanne',
  kurz: 'Ablage, Box, Stiftebecher',
  drucklage: 'stehend',   // Boden am Bett, Oeffnung oben: Modul-y wird Bauhoehe
  parameter: {
    breite:  { name: 'Breite',        min: 1,   max: 5,   schritt: 1,  einheit: 'Löcher', start: 2 },
    tiefe:   { name: 'Tiefe',         min: 30,  max: 120, schritt: 5,  einheit: 'mm', start: 60 },
    hoehe:   { name: 'Höhe',          min: 20,  max: 120, schritt: 5,  einheit: 'mm', start: 50 },
    trenner: { name: 'Fachtrenner',   min: 0,   max: 4,   schritt: 1,  einheit: '',   start: 0 },
    neigung: { name: 'Neigung',       min: -30, max: 30,  schritt: 5,  einheit: '°',  start: 0 },
    rundung: { name: 'Rundung',       min: 0,   max: 15,  schritt: 1,  einheit: 'mm', start: 4 },
    boden:   { name: 'Boden offen',   min: 0,   max: 1,   schritt: 1,  einheit: '',   start: 0, schalter: true },
    tafel:   { name: 'Tafelhalter',   min: 0,   max: 1,   schritt: 1,  einheit: '',   start: 0, schalter: true, versteckt: true },   // setzt die App bei Text als Tafel
  },
  masse(p) {
    // Aussenbreite: (n-1) Raster zwischen den Haken + je 20 mm Rand = n x 40.
    const breiteMm = p.breite * RASTER;
    return { breiteMm, tiefe: p.tiefe, hoehe: p.hoehe, yUnten: HALS_HOEHE - p.hoehe };
  },
  stuetzen(p) { return abbrechstuetzen(this.haken(p), this.masse(p).yUnten); },
  haken(p) {
    // Ein Haken je Loch, alle in der obersten Reihe.
    return Array.from({ length: p.breite }, (_, i) => ({ dx: i, dy: 0 }));
  },
  /** SCHILD (aufgesetzte Platte): Front aussen, zentriert, im geraden Teil
   *  zwischen den Rundungen. Betrachter liest links->rechts = Modul -x. */
  schildflaeche(p) {
    const { breiteMm, tiefe, hoehe, yUnten } = this.masse(p);
    const T = tiefe + WAND;
    const r = Math.max(0, Math.min(p.rundung, breiteMm / 2 - 1, tiefe / 2 - 1));
    const breite = breiteMm - 2 * r - 6, hoeheFrei = hoehe - 6;
    if (breite < 12 || hoeheFrei < 6) return null;
    // Modulmitte in x liegt bei RASTER/2 - breiteMm/2 (Ursprung = erster Haken)
    const cx = RASTER / 2 - breiteMm / 2;
    return { o: [cx, yUnten + hoehe / 2, -T], u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, -1], breite, hoehe: hoeheFrei };
  },
  /** EBENE (im Material, waagrecht = wenige Farbwechsel-Schichten): der
   *  Boden INNEN. Nur bei geschlossenem, nicht geneigtem Boden; bei Trennern
   *  im ersten (Betrachter linken) Fach. Text liest von vorne, "oben" zeigt
   *  zur Platte (v = +z). */
  beschriftung(p) {
    if (p.boden || p.neigung !== 0) return null;
    const { breiteMm, tiefe, yUnten } = this.masse(p);
    const innen = breiteMm - 2 * WAND;
    const fach = (innen - p.trenner * WAND) / (p.trenner + 1);
    const breite = fach - 4, hoeheFrei = tiefe - 2 * WAND - 4;
    if (breite < 12 || hoeheFrei < 4) return null;
    // erstes Fach = Betrachter links = groesstes Modul-x
    const xL = RASTER / 2 - WAND;                       // Innenkante links (Modul +x)
    const cx = xL - fach / 2;
    return { o: [cx, yUnten + WAND, -WAND - tiefe / 2], u: [-1, 0, 0], v: [0, 0, 1], n: [0, 1, 0], breite, hoehe: hoeheFrei };
  },
  geometrie(p) {
    const { breiteMm, tiefe, hoehe } = this.masse(p);
    const teile = [];
    // Der Kasten wird symmetrisch um x=0 gebaut (x0..x1) und am Ende so
    // verschoben, dass der erste Haken (Betrachter links) im Ursprung sitzt.
    // Die Wanne reicht 20 mm ueber die aeussersten Loecher hinaus.
    const x0 = -breiteMm / 2, x1 = breiteMm / 2;
    // y: Halsunterkante des Hakens bei 0, Haken-Oberkante bei HALS_HOEHE.
    // Die Rueckwand reicht von der Haken-Oberkante bis zur Wannenunterkante:
    // der Haken sitzt in ihrer oberen Zone, ganz oben buendig.
    const yOben = HALS_HOEHE;
    const yUnten = yOben - hoehe;                 // Unterkante Wanne
    // z: Rueckwand liegt an der Platte an (z -WAND..0), Wanne nach vorne in -z.
    const neig = THREE.MathUtils.degToRad(p.neigung);

    // RUNDUNG (Manolo, 17.08.: "je nach Setup wirkt es sehr kantig"). Die
    // vier senkrechten Aussenkanten der Wanne — von oben gesehen die Ecken —
    // bekommen einen Radius; die hinteren beiden bleiben eckig, sie liegen an
    // der Platte an. Senkrechte Kanten sind in der stehenden Drucklage frei
    // rundbar: die Wand kruemmt sich nur in der Ebene des Betts, kein
    // Ueberhang. Wandstaerke bleibt ueberall 2.4 (innen Radius R - 2.4).
    // Ober- und Unterkanten runden wir NICHT: unten waere es ein Ueberhang
    // bis 90 Grad am Bett, oben nimmt es der Auflage Material weg.
    // Rueckwand, Seiten, Front und Boden entstehen aus EINER Kontur
    // (Shape mit Loch), extrudiert entlang der Hoehe. So folgen Innen- und
    // Aussenwand demselben Radius und nichts steht ueber.
    const T = tiefe + WAND;                                  // Aussentiefe ab Platte
    const r = Math.max(0, Math.min(p.rundung, breiteMm / 2 - 1, tiefe / 2 - 1));
    const aussen = kontur(x0, x1, T, r, 0);
    aussen.holes.push(kontur(x0, x1, T, r, WAND));
    teile.push(extrudiert(aussen, hoehe, yUnten));            // Rueckwand + Seiten + Front

    // Boden und Keil. NEIGUNG: nicht der Kasten
    // wird gekippt (dann hebt sich der Boden vom Bett — 10'000 mm2 Ueberhang
    // im ersten Anlauf), sondern der Boden bekommt INNEN einen Keil: aussen
    // bleibt die Wanne ein gerader Kasten mit flachem Boden, innen faellt
    // der Boden zur Platte hin ab, sodass der Inhalt nach hinten rutscht
    // statt nach vorne herauszufallen. Der Keil ist vorne hoch, hinten null.
    const kasten = [];
    if (!p.boden) {
      // Boden: fuellt das Loch der Wandkontur und greift 0.4 mm in die Wand
      // hinein (Ueberlappung, kein Spalt). Bewusst NICHT die Aussenkontur:
      // dann laegen seine Ecken exakt auf denen der Wand — zwei Koerper mit
      // gemeinsamen Ecken lesen Pruefer und Slicer als nicht-mannigfaltig
      // (trimesh zerlegte die Wanne in 47 Fetzen). So bleibt jeder Koerper
      // fuer sich geschlossen, und die Vereinigung ist dieselbe.
      kasten.push(extrudiert(kontur(x0, x1, T, r, WAND - 0.4), WAND, yUnten));
      if (p.neigung !== 0) {
        // Keil INNEN auf dem Boden: liegt flach auf dem Boden (unten eben),
        // oben schraeg. NEIGUNG > 0: vorne hoch, an der Platte null — der
        // Inhalt rutscht zur Platte hin (nichts faellt heraus). NEIGUNG < 0:
        // an der Platte hoch, vorne null — der Inhalt lehnt an die Front
        // (Auslage, man sieht hinein; Manolo 17.08.: "auch anders herum").
        // Der Keil folgt der INNENKONTUR (mit Rundung), nicht mehr einem
        // Rechteck: das Rechteck stiess bei runden Ecken durch die Wand
        // (Manolos Screenshot, Rundung 11 / Neigung 30). Er greift wie der
        // Boden 0.4 mm in die Wand — unsichtbar, aber ohne gemeinsame Ecken.
        const innenTiefe = tiefe - 2 * WAND;
        const h = Math.min(hoehe * 0.6, Math.tan(Math.abs(neig)) * innenTiefe);
        // Der Keil sinkt 0.4 mm in den Boden ein und ist um 0.3 (nicht 0.4)
        // eingerueckt: seine Ecken fallen so weder mit dem Boden noch mit
        // der Wand zusammen (sonst wieder "nicht geschlossen", siehe Boden).
        // Am flachen Ende steht er 0.4 ueber der Bodenoberkante = 0: kein
        // Nullhoehen-Rand, keine entarteten Dreiecke.
        const sHinten = WAND - 0.3, sVorn = T - WAND + 0.3;      // Kontur-s der Innenkante
        const hoeheBei = (s) => { const f = Math.min(1, Math.max(0, (s - sHinten) / (sVorn - sHinten))); return 0.4 + h * (p.neigung > 0 ? f : 1 - f); };
        kasten.push(keilPrisma(kontur(x0, x1, T, r, WAND - 0.3), yUnten + WAND - 0.4, hoeheBei));
      }
    }
    // Trenner: gleichmaessig ueber die Breite
    // Sie reichen von der Rueckwand bis zur Front und greifen je 0.4 mm in
    // Rueckwand, Front und Boden — vorher lief der Trenner bis an die
    // Aussenflaeche der Front (deckungsgleiche Flaeche, Flimmern/Naht).
    const trTiefe = tiefe - WAND + 0.8, trZ = -(WAND + tiefe) / 2;
    const trUnten = p.boden ? yUnten : yUnten + WAND - 0.4;
    for (let i = 1; i <= p.trenner; i++) {
      const tx = x0 + (breiteMm * i) / (p.trenner + 1);
      const tr = new THREE.BoxGeometry(WAND, yOben - trUnten, trTiefe);
      tr.translate(tx, (yOben + trUnten) / 2, trZ);
      kasten.push(tr);
    }
    teile.push(...kasten);

    // Verschieben: der linke Haken (Betrachter) sitzt im Ursprung. Modul +x
    // ist Betrachter-links (siehe Kopf), also wandert die Kante x1 auf +20.
    const schub = RASTER / 2 - x1;
    for (const g of teile) g.translate(schub, 0, 0);
    if (p.tafel) teile.push(...tafelhalter(this, p));      // Tafelhalter (schildflaeche liegt schon im Ursprungs-Rahmen)

    // Haken: einer je Loch, oben, Halsunterkante bei y=0; dx nach rechts
    // = Modul -x.
    for (const h of this.haken(p)) {
      const hg = hakenGeometrie();
      hg.translate(-h.dx * RASTER, h.dy * REIHEN_TEILUNG, 0);
      teile.push(hg);
    }
    return teile;
  },
};

/**
 * Rotation Modulraum -> Drucklage. Modulraum: x Breite, y Hoehe (oben +y),
 * z Tiefe (+z = Haken hinter der Platte, -z = zum Betrachter).
 *   seite   : x -> Bauhoehe (Rotation -90 Grad um y)
 *   stehend : y -> Bauhoehe (Rotation -90 Grad um x); die Wanne steht wie
 *             auf einem Tisch, Haken oben, Zungen zeigen nach unten
 */
export function drucklageMatrix(f) {
  const M = new THREE.Matrix4();
  // stehend: +y (Modul-oben) soll +z (Bauhoehe) werden -> +90 Grad um x.
  // Beim ersten Anlauf -90: die Wanne stand auf dem Kopf, Boden oben, Haken
  // am Bett -- 4800 mm2 "Ueberhang" waren der schwebende Boden.
  return f.drucklage === 'stehend' ? M.makeRotationX(Math.PI / 2) : M.makeRotationY(-Math.PI / 2);
}

// ---------------------------------------------------------------- Familie: Halter
//
// Deckt ab (Brief §4.2): Werkzeug, Schraubendreher, Kabel. Eine Konsole
// (Brett) mit Loechern, in die man Werkzeug von oben steckt — oder mit
// Schlitzen, die nach vorne offen sind (Kabel von vorne einlegen).
// Parameter: Breite (Loecher), Tiefe, Lochdurchmesser, Loecher je Reihe,
// Reihen (der Reihenabstand aus dem Brief ergibt sich: gleichmaessig ueber
// die Tiefe), Schlitze statt Loecher, Rundung.
//
// AUFBAU. Rueckwand 30 mm hoch (Haken oben buendig wie bei der Wanne), die
// Konsole 5 mm dick an ihrer UNTERKANTE, nach vorne ragend; auf der Konsole
// links und rechts je eine Wange (2.4 dick, 12 mm hoch an der Wand, 3 mm
// vorne): versteift die Konsole gegen die Rueckwand und haelt Werkzeug
// seitlich. Die Rueckwand druckt unten gegen die Platte, die Haken oben
// ziehen — die Konsole haengt am Hebel, nicht an den Haken allein.
//
// DRUCKLAGE stehend, Konsole unten AUF DEM BETT: die Loecher stehen
// senkrecht (sauber rund, kein Ueberhang), Wangen und Rueckwand steigen vom
// Brett auf, die Haken oben bekommen Abbrechstuetzen wie die Wanne. Eine
// Konsole hoeher an der Rueckwand ginge nicht: ihre Unterseite waere ein
// waagrechter Ueberhang in der Luft. Deshalb sitzt sie ganz unten.
const HALTER = {
  id: 'halter',
  name: 'Halter',
  kurz: 'Werkzeug, Schraubendreher, Kabel',
  drucklage: 'stehend',
  parameter: {
    breite:      { name: 'Breite',          min: 1,  max: 5,  schritt: 1, einheit: 'Löcher', start: 2 },
    tiefe:       { name: 'Tiefe',           min: 20, max: 80, schritt: 5, einheit: 'mm',     start: 40 },
    durchmesser: { name: 'Lochdurchmesser', min: 3,  max: 30, schritt: 1, einheit: 'mm',     start: 8 },
    anzahl:      { name: 'Löcher je Reihe', min: 1,  max: 20, schritt: 1, einheit: '',       start: 4 },
    abstand:     { name: 'Lochabstand',     min: 0,  max: 50, schritt: 1, einheit: 'mm',     start: 0 },   // Mitte-Mitte; 0 = so eng wie moeglich
    reihen:      { name: 'Reihen',          min: 1,  max: 3,  schritt: 1, einheit: '',       start: 1 },
    schlitze:    { name: 'Schlitze (vorne offen)', min: 0, max: 1, schritt: 1, einheit: '', start: 0, schalter: true },
    rundung:     { name: 'Rundung',         min: 0,  max: 15, schritt: 1, einheit: 'mm',     start: 4 },
    // Erweiterungen fuer die Vorlagen (Manolo 18.08.: Bits als Treppe, Bohrer-Satz)
    dicke:       { name: 'Konsolen-Dicke',  min: 5,  max: 20, schritt: 1, einheit: 'mm',     start: 5 },
    stufe:       { name: 'Stufe je Reihe',  min: 0,  max: 15, schritt: 1, einheit: 'mm',     start: 0 },   // hinten je Reihe hoeher (Treppe)
    sackloch:    { name: 'Sackloch (Boden 2 mm)', min: 0, max: 1, schritt: 1, einheit: '', start: 0, schalter: true },
    d2:          { name: 'Ø bis (gestaffelt)', min: 0, max: 30, schritt: 1, einheit: 'mm',    start: 0 },   // 0 = alle gleich
    tafel:   { name: 'Tafelhalter',   min: 0,   max: 1,   schritt: 1,  einheit: '',   start: 0, schalter: true, versteckt: true },   // setzt die App bei Text als Tafel
  },
  RUECKWAND_HOEHE: 36,   // 36 statt 30 (18.08.): Platz fuer die Einschub-Tafel (14 mm) ueber den Wangen
  BRETT: 5,
  masse(p) {
    const breiteMm = p.breite * RASTER;
    const hoehe = this.RUECKWAND_HOEHE;
    const dicke = p.dicke || this.BRETT;
    const reihen = p.schlitze ? 1 : p.reihen;
    // Stufe: hinten je Reihe hoeher; die hoechste Stufe laesst mindestens 14 mm
    // Rueckwand fuer die Tafel frei
    const stufe = reihen > 1 ? Math.max(0, Math.min(p.stufe || 0, (hoehe - 14 - dicke) / (reihen - 1))) : 0;
    const oben = dicke + (reihen - 1) * stufe;               // hoechste Konsolen-Oberkante ueber der Unterkante
    return { breiteMm, tiefe: p.tiefe, hoehe, yUnten: HALS_HOEHE - hoehe, dicke, stufe, oben, reihen };
  },
  haken(p) { return Array.from({ length: p.breite }, (_, i) => ({ dx: i, dy: 0 })); },
  stuetzen(p) { return abbrechstuetzen(this.haken(p), this.masse(p).yUnten); },
  /** SCHILD: Rueckwand vorne, ueber Wangen bzw. hoechster Stufe bis unter die
   *  Hakenzone, ganze Breite minus Rand. */
  schildflaeche(p) {
    const { breiteMm, yUnten, dicke, stufe, oben } = this.masse(p);
    const yA = yUnten + (stufe > 0 ? oben : dicke + 12) + 1, yB = HALS_HOEHE - 1.5;
    const breite = breiteMm - 6, hoehe = yB - yA;
    if (breite < 12 || hoehe < 6) return null;
    const cx = RASTER / 2 - breiteMm / 2;
    return { o: [cx, (yA + yB) / 2, -WAND], u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, -1], breite, hoehe };
  },
  /** EBENE: Konsolen-Oberseite, der freie Streifen VOR den Loechern (bei
   *  Schlitzen: hinter ihnen, an der Rueckwand). Zwischen den Wangen. */
  beschriftung(p) {
    const lb = this.lochbild(p);
    const { breiteMm, yUnten } = this.masse(p);
    const d = lb.d, T = lb.T;
    const sMaxLoch = Math.max(...lb.punkte.map((q) => q.s)) + d / 2;
    const sMinLoch = Math.min(...lb.punkte.map((q) => q.s)) - d / 2;
    // Streifen vorne: von der vordersten Lochkante bis zur Vorderkante (Rundung ausgenommen)
    let sA = sMaxLoch + 1.5, sB = T - 1.5 - (lb.schlitze ? 0 : 0);
    if (lb.schlitze) { sA = WAND + 1.5; sB = sMinLoch - 1.5; }      // Schlitze reichen bis vorne -> hinten
    const tief = sB - sA;
    const breite = breiteMm - 2 * WAND - 4 - (lb.schlitze ? 0 : 2 * lb.r);
    if (tief < 4 || breite < 12) return null;
    const cx = RASTER / 2 - breiteMm / 2;
    return { o: [cx, yUnten + this.masse(p).dicke, -(sA + sB) / 2], u: [-1, 0, 0], v: [0, 0, 1], n: [0, 1, 0], breite, hoehe: tief };
  },
  /** Lochbild: Mittelpunkte in (x, s) und was davon Schlitze sind. So viele
   *  Loecher, wie mit 2 mm Steg Platz haben — die Zahl wird still gekuerzt. */
  lochbild(p) {
    const { breiteMm, tiefe } = this.masse(p);
    const T = tiefe + WAND, steg = 2;
    // Gestaffelt (Bohrer-Satz): Ø laeuft von durchmesser bis d2 ueber die Reihe;
    // Teilung und Reihenabstand richten sich nach dem groessten Loch.
    const dA = p.durchmesser, dB = p.d2 > 0 ? p.d2 : p.durchmesser;
    const d = Math.max(dA, dB);
    const r = Math.max(0, Math.min(p.rundung, breiteMm / 2 - 1, tiefe / 2 - 1));
    const x0 = -breiteMm / 2, x1 = breiteMm / 2;
    // Nutzbare Breite: innerhalb der Wangen; Schlitze zusaetzlich innerhalb der Rundung
    const rand = WAND + steg + (p.schlitze ? r : 0);
    const nutz = breiteMm - 2 * rand;
    // Teilung Mitte-Mitte: gewuenschter Lochabstand, mindestens Loch + Steg.
    // So viele Loecher, wie damit Platz haben (still gekuerzt), mittig verteilt.
    const teilung = Math.max(d + steg, p.abstand || 0);
    const n = Math.max(1, Math.min(p.anzahl, Math.floor((nutz - d) / teilung) + 1));
    const reihen = p.schlitze ? 1 : p.reihen;
    const spann = (n - 1) * teilung + d;
    const xs = Array.from({ length: n }, (_, i) => x0 + rand + (nutz - spann) / 2 + d / 2 + i * teilung);
    // Ø je Loch: linear von dA (Betrachter links) bis dB (rechts). Modul +x ist
    // Betrachter-links, xs steigt in +x -> Index n-1 ist links.
    const dVon = (i) => n > 1 ? dB + (dA - dB) * i / (n - 1) : dA;
    // Reihen: gleichmaessig zwischen Rueckwand (+Steg) und Vorderkante (+Steg)
    const sMin = WAND + steg + d / 2, sMax = T - steg - d / 2;
    const ss = reihen === 1 ? [(sMin + sMax) / 2] : Array.from({ length: reihen }, (_, i) => sMin + (sMax - sMin) * i / (reihen - 1));
    const punkte = [];
    ss.forEach((s, j) => xs.forEach((x, i) => punkte.push({ x, s, d: dVon(i), reihe: j })));
    return { punkte, d, schlitze: !!p.schlitze, r, T, x0, x1, n, reihen, ss };
  },
  geometrie(p) {
    const { breiteMm, tiefe, hoehe, yUnten } = this.masse(p);
    const yOben = HALS_HOEHE;
    const lb = this.lochbild(p);
    const { r, T, x0, x1, d } = lb;
    const teile = [];

    // Rueckwand (z -WAND..0), volle Breite, von der Hakenoberkante bis zur Brettunterkante
    const rueck = new THREE.BoxGeometry(breiteMm, hoehe, WAND);
    rueck.translate(0, yOben - hoehe / 2, -WAND / 2);
    teile.push(rueck);

    // Konsole: Kontur ab 0.4 mm IN der Rueckwand bis T, gerundete Vorderecken,
    // Loecher als Ausschnitte (je Loch eigener Ø) bzw. Schlitze als Kerben.
    // TREPPE (stufe > 0): je Reihe ein eigener Block, hinten hoeher; die
    // Bloecke stossen an den Reihengrenzen aneinander und greifen 0.2 mm
    // ineinander (keine gemeinsamen Ecken). Vorne Rundung, hinten eckig.
    const { dicke, stufe } = this.masse(p);
    const kerben = lb.schlitze ? lb.punkte.map((q) => ({ x: q.x, s: q.s, breite: q.d })) : [];
    const lochPfade = (punkte, sh) => { for (const q of punkte) { const h = new THREE.Path(); h.absarc(q.x, q.s, q.d / 2, 0, Math.PI * 2, false); sh.holes.push(h); } };
    const treppe = stufe > 0 && lb.reihen > 1;
    if (treppe) {
      // Reihengrenzen: Mitte zwischen den Reihen (ss laeuft von hinten nach vorne)
      const grenzen = [];
      for (let j = 0; j < lb.ss.length - 1; j++) grenzen.push((lb.ss[j] + lb.ss[j + 1]) / 2);
      for (let j = 0; j < lb.reihen; j++) {
        const hinten = j === 0 ? WAND - 0.4 : grenzen[j - 1] - 0.1;
        const vorn = j === lb.reihen - 1 ? T : grenzen[j] + 0.1;
        const hoehe = dicke + (lb.reihen - 1 - j) * stufe;   // hinten (j=0) am hoechsten
        const sh = kontur(x0, x1, vorn, j === lb.reihen - 1 ? r : 0, 0, [], hinten);
        lochPfade(lb.punkte.filter((q) => q.reihe === j), sh);
        teile.push(extrudiert(sh, hoehe, yUnten));
      }
    } else {
      const brett = kontur(x0, x1, T, r, 0, kerben, WAND - 0.4);
      if (!lb.schlitze) lochPfade(lb.punkte, brett);
      teile.push(extrudiert(brett, dicke, yUnten));
    }
    // Sackloch: 2-mm-Boden unter allen Loechern — eigene Platte, 0.3 eingerueckt
    // und 0.01 ueber dem Bett, damit sie keine Ecken mit den Bloecken teilt
    if (p.sackloch && !lb.schlitze) teile.push(extrudiert(kontur(x0, x1, T, r, 0.3, [], WAND - 0.1), 2 - 0.01, yUnten + 0.01));

    // Wangen (nur ohne Treppe): Dreiecksprofil (s, y) auf dem Brett, links und
    // rechts, bis vor die Rundung. Greifen 0.4 in Rueckwand und Brett.
    if (!treppe) {
      const yS = yUnten + dicke - 0.4;
      const s0 = WAND - 0.4, s1 = Math.max(s0 + 4, T - r - 0.4);
      const wange = new THREE.Shape();
      wange.moveTo(s0, yS); wange.lineTo(s1, yS); wange.lineTo(s1, yS + 3); wange.lineTo(s0, yS + 12); wange.closePath();
      teile.push(extrudiertQuer(wange, WAND, x0 + 0.01));            // 0.01: keine Ecke faellt mit dem Brett zusammen
      teile.push(extrudiertQuer(wange, WAND, x1 - WAND - 0.01));
    }

    // Verschieben: erster Haken (Betrachter links) im Ursprung
    const schub = RASTER / 2 - x1;
    for (const g of teile) g.translate(schub, 0, 0);
    if (p.tafel) teile.push(...tafelhalter(this, p));      // Tafelhalter (schildflaeche liegt schon im Ursprungs-Rahmen)
    for (const h of this.haken(p)) {
      const hg = hakenGeometrie();
      hg.translate(-h.dx * RASTER, h.dy * REIHEN_TEILUNG, 0);
      teile.push(hg);
    }
    return teile;
  },
};

// ---------------------------------------------------------------- Familie: Klemme
//
// Deckt ab (Brief §4.4): Rundes — Flaschen, Spruehdosen, Bohrfutter. Ein
// C-foermiger Ring an der Rueckwand, vorne offen: das Teil wird von vorne
// hineingedrueckt, die Arme federn, die Oeffnung (Klemmweite) ist enger als
// der Innendurchmesser — so haelt es. Parameter: Innendurchmesser,
// Klemmweite, Hoehe. Die Armstaerke ist fest 3.0 mm (2.0 war Manolo zu
// duenn, 17.08.); die Armspitzen sind halbrund, damit nichts hakt.
//
// AUFBAU. Der Ring sitzt unten an der Rueckwand, Mittelpunkt bei
// s = WAND + D/2: die Innenseite beruehrt die Rueckwand-Vorderseite gerade,
// die hintere Ringwand taucht in die Rueckwand ein. Dazu ein SOCKEL: der
// Zwickel zwischen Rueckwand und Ring wird ueber 65 % der Ringbreite
// aufgefuellt, bis in die Mitte der Ringwand hinein (nie bis zur
// Innenseite — sonst gemeinsame Flaechen). Der Ring haengt so an einer
// breiten Flaeche (Flasche Ø66: ca. 47 mm x Hoehe), nicht an einer Sehne
// (Manolo, 17.08.: "sollte besser an Halterung befestigt sein"). Die
// Rueckwand ist so breit, wie der Ring in Loecher passt (1-3 Loecher, aus
// dem Durchmesser abgeleitet), und ragt 12 mm ueber den Ring fuer die Haken.
//
// DRUCKLAGE stehend, Ring unten auf dem Bett: alles senkrechte Waende,
// null Ueberhang; Haken oben mit Abbrechstuetzen wie Wanne und Halter.
const KLEMME = {
  id: 'klemme',
  name: 'Klemme',
  kurz: 'Flaschen, Sprühdosen, Bohrfutter',
  drucklage: 'stehend',
  parameter: {
    durchmesser: { name: 'Innendurchmesser', min: 15, max: 90, schritt: 1, einheit: 'mm', start: 66 },
    klemmweite:  { name: 'Klemmweite (Öffnung)', min: 10, max: 80, schritt: 1, einheit: 'mm', start: 50 },
    hoehe:       { name: 'Höhe',             min: 10, max: 60, schritt: 5, einheit: 'mm', start: 25 },
    tafel:   { name: 'Tafelhalter',   min: 0,   max: 1,   schritt: 1,  einheit: '',   start: 0, schalter: true, versteckt: true },   // setzt die App bei Text als Tafel
  },
  ARM: 3.0,          // Armstaerke (Manolo 17.08.: 2.0 war zu duenn)
  HAKENZONE: 18,     // Rueckwand ueber dem Ring (18 statt 12, 18.08.: Platz fuer die Einschub-Tafel)
  masse(p) {
    const w = this.ARM, D = p.durchmesser;
    const Ro = D / 2 + w;
    // Klemmweite: mindestens 4 mm enger als der Innendurchmesser, sonst haelt nichts
    const K = Math.min(p.klemmweite, D - 4);
    const breite = Math.max(1, Math.min(3, Math.round((2 * Ro) / RASTER)));
    const breiteMm = breite * RASTER;
    const hoeheRueck = p.hoehe + this.HAKENZONE;
    return { w, D, Ro, Ri: D / 2, K, breite, breiteMm, hoehe: p.hoehe, hoeheRueck, yUnten: HALS_HOEHE - hoeheRueck };
  },
  haken(p) { const { breite } = this.masse(p); return Array.from({ length: breite }, (_, i) => ({ dx: i, dy: 0 })); },
  stuetzen(p) { return abbrechstuetzen(this.haken(p), this.masse(p).yUnten); },
  /** SCHILD: Rueckwand vorne in der Hakenzone ueber dem Ring (12 mm). Keine
   *  Ebene — die Klemme hat keine waagrechte Flaeche. */
  schildflaeche(p) {
    const { breiteMm, hoehe, yUnten } = this.masse(p);
    const yA = yUnten + hoehe + 1, yB = HALS_HOEHE - 1.5;
    const breite = breiteMm - 6, h = yB - yA;
    if (breite < 12 || h < 4) return null;
    const cx = RASTER / 2 - breiteMm / 2;
    return { o: [cx, (yA + yB) / 2, -WAND], u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, -1], breite, hoehe: h };
  },
  geometrie(p) {
    const { w, D, Ro, Ri, K, breiteMm, hoehe, hoeheRueck, yUnten } = this.masse(p);
    const yOben = HALS_HOEHE;
    const teile = [];
    const x1 = breiteMm / 2;

    const rueck = new THREE.BoxGeometry(breiteMm, hoeheRueck, WAND);
    rueck.translate(0, yOben - hoeheRueck / 2, -WAND / 2);
    teile.push(rueck);

    // C-Ring in (x, s), Mittelpunkt (0, sc). Winkel wie in three: Punkt =
    // (cx + r cos a, cy + r sin a); die Oeffnung liegt vorne bei a = 90 Grad,
    // halbe Oeffnungsweite phi (an der Innenseite gemessen).
    const sc = WAND + D / 2;
    const phi = Math.asin(Math.min(0.999, (K / 2) / Ri));
    const aL = Math.PI / 2 + phi, aR = Math.PI / 2 - phi + 2 * Math.PI;   // linke / rechte Armspitze
    const Rm = (Ri + Ro) / 2;
    const ring = new THREE.Shape();
    ring.moveTo(Ro * Math.cos(aL), sc + Ro * Math.sin(aL));
    ring.absarc(0, sc, Ro, aL, aR, false);                        // aussen, hinten herum
    const pR = [Rm * Math.cos(aR), sc + Rm * Math.sin(aR)];
    ring.absarc(pR[0], pR[1], w / 2, aR, aR + Math.PI, false);      // rechte Spitze, halbrund zur Oeffnung
    ring.absarc(0, sc, Ri, aR, aL, true);                          // innen zurueck
    const pL = [Rm * Math.cos(aL), sc + Rm * Math.sin(aL)];
    ring.absarc(pL[0], pL[1], w / 2, aL + Math.PI, aL + 2 * Math.PI, false);   // linke Spitze
    ring.closePath();
    teile.push(extrudiert(ring, hoehe, yUnten));

    // Sockel: Zwickel zwischen Rueckwand (Grundlinie in der Rueckwand) und Ring, begrenzt
    // durch einen Bogen in der MITTE der Ringwand (Radius Ri + w/2), Breite
    // 2*hw. Am Rand ist er am tiefsten, in der Mitte laeuft er auf null aus.
    const hw = Math.min(0.65 * Ro, x1 - 3);
    const Rs = Ri + w / 2;
    if (hw > 2 && hw < Rs) {
      const yA = Math.atan2(-Math.sqrt(Rs * Rs - hw * hw), hw);        // rechts, unterer Bogen
      const yB = Math.atan2(-Math.sqrt(Rs * Rs - hw * hw), -hw);       // links
      // Grundlinie unterhalb des tiefsten Bogenpunkts (sc - Rs = WAND - w/2),
      // sonst schneidet der Bogen die Grundlinie (erste Fassung: offene Kanten).
      const S0 = Math.max(0.2, sc - Rs - 0.4);
      const sockel = new THREE.Shape();
      sockel.moveTo(-hw, S0); sockel.lineTo(hw, S0);
      sockel.lineTo(hw, sc + Rs * Math.sin(yA));
      sockel.absarc(0, sc, Rs, yA, yB, true);                          // im Uhrzeigersinn durch den tiefsten Punkt
      sockel.closePath();
      teile.push(extrudiert(sockel, hoehe, yUnten + 0.01));            // 0.01: keine gemeinsamen Ecken mit dem Ring
    }

    // Verschieben: erster Haken (Betrachter links) im Ursprung
    const schub = RASTER / 2 - x1;
    for (const g of teile) g.translate(schub, 0, 0);
    if (p.tafel) teile.push(...tafelhalter(this, p));      // Tafelhalter (schildflaeche liegt schon im Ursprungs-Rahmen)
    for (const h of this.haken(p)) {
      const hg = hakenGeometrie();
      hg.translate(-h.dx * RASTER, h.dy * REIHEN_TEILUNG, 0);
      teile.push(hg);
    }
    return teile;
  },
};

// ---------------------------------------------------------------- Beschriftung (Etikett)
//
// Brief §6: Beschriftung MEHRFARBIG BUENDIG im Material — nicht erhaben,
// nicht vertieft. Manolo (18.08.2026) hat das auf EBENE, waagrechte Flaechen
// begrenzt: stehend gedruckter Text zieht sich ueber Dutzende Schichten mit
// Farbwechsel (Spuelturm, Zeit); auf einer waagrechten Flaeche liegt die
// Farbe in wenigen Schichten, wie beim QR-Schild. Ebene Flaechen gibt es
// beim Halter (Konsole) und bei der Wanne (Boden innen). Fuer alles andere
// gibt es die EINSCHUB-TAFEL (siehe unten).
//
// SCHRIFT ALS VEKTOR (Manolo 18.08.: "keine kantige pixelige Variante"):
// die Buchstaben kommen als Konturen aus einer typeface.json-Schrift (Droid
// Sans Bold, 591 Glyphen inkl. Umlaute; three-Format), werden zu Shapes mit
// Loechern und direkt trianguliert — die Deckflaeche der Platte besteht aus
// Buchstaben (Textfarbe), Buchstaben-Loechern (Grundfarbe) und dem Ring
// drumherum (Grundfarbe), alle mit gemeinsamen Randpunkten (wasserdicht).
// Jede Dreiecksfarbe landet im 3MF (wie beim QR-Schild: Farbe plan eingelegt).
// Die Schrift wird einmal geladen (App: fetch; Node: readFileSync) und mit
// setzeSchrift() uebergeben; vorher gibt es kein Etikett/keine Tafel.
//
// Das Etikett bleibt ein eigener, geschlossener Koerper: 0.8 mm dick, IN
// der Wand (0.75 mm eingelassen), Vorderseite 0.05 mm vor der Wandflaeche —
// unterhalb jeder Druckaufloesung, aber eindeutig die aeusserste Flaeche.
//
// Jede Familie liefert `beschriftung(p)`: Mitte o, Leserichtung u, Hoch v,
// Normale n (nach aussen), verfuegbare breite/hoehe in mm. Fehlt Platz,
// null -> kein Etikett, die App sagt es.
const ETIKETT_DICKE = 0.8, ETIKETT_VOR = 0.05;
export const SCHRIFT_MIN = 5, SCHRIFT_MAX = 12;      // mm Versalhoehe (Manolo 18.08.: mind. 5)
const LAUFWEITE = 1.04;                               // 4 % mehr Vorschub: Glyphen duerfen sich nie beruehren
let SCHRIFT = null, CAP = 1;                          // CAP = Versalhoehe in Schrift-Einheiten / resolution
export function setzeSchrift(json) {
  SCHRIFT = json;
  // Versalhoehe aus dem 'E' messen: in typeface.json ist "resolution" nicht
  // die Gevierthoehe (Droid Sans Bold: E = 992 bei resolution 1000, also
  // fast 1.0; Helvetiker haette ~0.7). So stimmt "Schrifthoehe 8 mm" = 8 mm
  // hohe Grossbuchstaben, unabhaengig von der Schriftdatei.
  const e = json.glyphs.E || json.glyphs.H;
  let maxY = 0;
  if (e && e.o) { const o = e.o.split(' '); for (let i = 0; i < o.length;) { const c = o[i++]; const n = c === 'm' || c === 'l' ? 2 : c === 'q' ? 4 : c === 'b' ? 6 : 0; for (let k = 0; k < n; k += 2) { const y = +o[i + k + 1]; if (y > maxY) maxY = y; } i += n; } }
  CAP = maxY > 0 ? maxY / json.resolution : 0.7;
  ergebnisCache.clear();
}
export function schriftBereit() { return !!SCHRIFT; }

/** Buchstaben eines Textes als Shapes (mit Loechern), Versalhoehe capH mm,
 *  Kasten zentriert um (0,0). null ohne Schrift oder ohne darstellbare Zeichen. */
function textShapes(txt, capH) {
  if (!SCHRIFT) return null;
  const size = capH / CAP, scale = size / SCHRIFT.resolution;
  let x = 0; const shapes = [], zeichenVon = [];
  let zi = 0;
  for (const ch of txt) {
    const g = SCHRIFT.glyphs[ch] || SCHRIFT.glyphs['?'];
    if (!g) continue;
    if (g.o) {
      const path = new THREE.ShapePath();
      const o = g.o.split(' ');
      for (let i = 0; i < o.length;) {
        const cmd = o[i++];
        if (cmd === 'm') path.moveTo(+o[i++] * scale + x, +o[i++] * scale);
        else if (cmd === 'l') path.lineTo(+o[i++] * scale + x, +o[i++] * scale);
        else if (cmd === 'q') { const px = +o[i++] * scale + x, py = +o[i++] * scale, cx = +o[i++] * scale + x, cy = +o[i++] * scale; path.quadraticCurveTo(cx, cy, px, py); }
        else if (cmd === 'b') { const px = +o[i++] * scale + x, py = +o[i++] * scale, c1x = +o[i++] * scale + x, c1y = +o[i++] * scale, c2x = +o[i++] * scale + x, c2y = +o[i++] * scale; path.bezierCurveTo(c1x, c1y, c2x, c2y, px, py); }
      }
      const neu = path.toShapes();
      shapes.push(...neu); for (const _ of neu) zeichenVon.push(zi);
    }
    x += g.ha * scale * LAUFWEITE;
    zi++;
  }
  if (!shapes.length) return null;
  // Kasten aus den echten Konturpunkten, dann um die Mitte zentrieren
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const punkte = shapes.map((s) => s.extractPoints(6));
  for (const pk of punkte) for (const q of pk.shape) { if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x; if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y; }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const glyphen = punkte.map((pk, i) => ({
    zeichen: zeichenVon[i],
    aussen: pk.shape.map((q) => [q.x - cx, q.y - cy]),
    loecher: pk.holes.map((h) => h.map((q) => [q.x - cx, q.y - cy])),
  }));
  return { glyphen, w: maxX - minX, h: maxY - minY };
}

/** Deckflaeche mit Text: Dreiecke (a,b) fuer Grund (Kontur minus Buchstaben),
 *  Buchstaben (Text), Buchstabenloecher (Grund). `kontur` = Aussenrand gegen
 *  den Uhrzeigersinn, `ts` = textShapes(), verschoben um (ta, tb).
 *  Rueckgabe [{tri:[[a,b]x3], farbe}] — alle gegen den Uhrzeigersinn.
 *
 *  Die Flaeche wird in SENKRECHTE STREIFEN je Zeichen zerlegt (Grenzen in
 *  der Luecke zwischen zwei Zeichen), jeder Streifen = Kontur-Ausschnitt mit
 *  den Konturen SEINES Zeichens als Loechern. Grund: three's earcut lieferte
 *  bei mehreren Buchstaben-Loechern in einer Flaeche (HR, RA, BE, EN …)
 *  offene Kanten; mit einem Zeichen je Flaeche war jeder Buchstabe sauber.
 *  Nachbarstreifen teilen ihre senkrechte Kante exakt (gleiche Punkte). */
function textDeckflaeche(kontur, ts, ta, tb, farbeText, farbeGrund) {
  const V2 = (q) => new THREE.Vector2(q[0], q[1]);
  const flaeche = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
  const ccw = (pts) => flaeche(pts) >= 0 ? pts : [...pts].reverse();
  const cw = (pts) => flaeche(pts) < 0 ? pts : [...pts].reverse();
  const EPS = 0.02;
  // Fast-Doppelpunkte und fast-kollineare Punkte (Abstand zur Sehne < EPS)
  // entfernen — earcut lieferte an solchen Stellen Splitter-Dreiecke mit
  // falscher Windung. Konturen bleiben optisch identisch (0.02 mm).
  const entdoppelt = (pts) => {
    let o = [];
    for (const q of pts) { const l = o[o.length - 1]; if (!l || Math.abs(l[0] - q[0]) > EPS || Math.abs(l[1] - q[1]) > EPS) o.push(q); }
    while (o.length > 1) { const f = o[0], l = o[o.length - 1]; if (Math.abs(f[0] - l[0]) < EPS && Math.abs(f[1] - l[1]) < EPS) o.pop(); else break; }
    let geaendert = true;
    while (geaendert && o.length > 3) {
      geaendert = false;
      for (let i = 0; i < o.length && o.length > 3; i++) {
        const a = o[(i - 1 + o.length) % o.length], b = o[i], c = o[(i + 1) % o.length];
        const dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy) || 1e-9;
        const abstand = Math.abs(dx * (b[1] - a[1]) - dy * (b[0] - a[0])) / len;
        if (abstand < EPS) { o.splice(i, 1); geaendert = true; i--; }
      }
    }
    return o;
  };
  const aus = [];
  const tris = (aussen, loecher, farbe) => {
    const A = ccw(entdoppelt(aussen)), L = loecher.map((l) => cw(entdoppelt(l))).filter((l) => l.length >= 3);
    if (A.length < 3) return;
    const idx = THREE.ShapeUtils.triangulateShape(A.map(V2), L.map((l) => l.map(V2)));
    const alle = A.concat(...L);
    for (const [i, j, k] of idx) { let tri = [alle[i], alle[j], alle[k]]; const f = flaeche(tri); if (Math.abs(f) < 1e-9) continue; if (f < 0) tri = [tri[0], tri[2], tri[1]]; aus.push({ tri, farbe }); }
  };
  // Polygon auf das Band xa <= x <= xb beschneiden (Sutherland-Hodgman, zwei
  // Halbebenen). Schnittpunkte identisch berechnet -> Nachbarstreifen teilen
  // exakt dieselben Punkte auf der Grenze.
  const schnitt = (p, q, x) => { const tt = (x - p[0]) / (q[0] - p[0]); return [x, p[1] + tt * (q[1] - p[1])]; };
  const aufGrenze = (pt, x) => Math.abs(pt[0] - x) < 1e-9;
  const clipHalb = (poly, x, links) => {   // links=true: behalte x >= xGrenze
    const drin = (pt) => links ? pt[0] >= x - 1e-9 : pt[0] <= x + 1e-9;
    const o = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const dp = drin(p), dq = drin(q);
      if (dp) o.push(p);
      // Grenzpunkte sind vorab in die Kontur eingefuegt (siehe unten): liegt
      // p oder q genau auf der Grenze, KEINEN neuen Schnittpunkt erzeugen —
      // sonst entstuende ein numerisch minimal anderer Doppelpunkt.
      if (dp !== dq && !aufGrenze(p, x) && !aufGrenze(q, x)) o.push(schnitt(p, q, x));
    }
    return o;
  };
  // Grenzpunkte EINMAL aus der Originalkontur berechnen und einfuegen, damit
  // Deckflaeche, Nachbarstreifen und Mantel dieselben Punkte teilen.
  const mitGrenzpunkten = (poly, xs) => {
    let o = poly;
    for (const x of xs) {
      const n = [];
      for (let i = 0; i < o.length; i++) {
        const p = o[i], q = o[(i + 1) % o.length];
        n.push(p);
        if ((p[0] < x && q[0] > x) || (p[0] > x && q[0] < x)) n.push(schnitt(p, q, x));
      }
      o = n;
    }
    return o;
  };
  const clip = (poly, xa, xb) => { let o = poly; if (xa != null) o = clipHalb(o, xa, true); if (xb != null) o = clipHalb(o, xb, false); return o; };
  // Zeichen -> Loops (verschoben), Kasten je Zeichen
  const verschoben = (pts) => pts.map((q) => [q[0] + ta, q[1] + tb]);
  const zeichen = new Map();
  for (const g of ts.glyphen) {
    if (!zeichen.has(g.zeichen)) zeichen.set(g.zeichen, { loops: [], minX: Infinity, maxX: -Infinity });
    const z = zeichen.get(g.zeichen);
    const aussen = verschoben(g.aussen), loecher = g.loecher.map(verschoben);
    z.loops.push({ aussen, loecher });
    for (const q of aussen) { if (q[0] < z.minX) z.minX = q[0]; if (q[0] > z.maxX) z.maxX = q[0]; }
  }
  const gruppen = [...zeichen.values()].sort((a, b) => a.minX - b.minX);
  // ueberlappende Kaesten (Unterschneidung) in einen Streifen zusammenlegen
  const streifen = [];
  for (const z of gruppen) {
    const l = streifen[streifen.length - 1];
    if (l && z.minX < l.maxX + 0.05) { l.loops.push(...z.loops); l.maxX = Math.max(l.maxX, z.maxX); }
    else streifen.push({ loops: [...z.loops], minX: z.minX, maxX: z.maxX });
  }
  // Streifengrenzen: Mitte der Luecke; erster/letzter Streifen bis zum Rand
  const grenzen = [];
  for (let i = 0; i < streifen.length - 1; i++) grenzen.push((streifen[i].maxX + streifen[i + 1].minX) / 2);
  const kontur0 = mitGrenzpunkten(entdoppelt(ccw(kontur)), grenzen);
  // Randstreifen links (ohne Zeichen), Zeichenstreifen, Randstreifen rechts —
  // die Randstreifen sind Teil des ersten/letzten Zeichenstreifens, damit die
  // Rundungen der Kontur nicht durch eine Grenze geschnitten werden muessen.
  for (let i = 0; i < streifen.length; i++) {
    const xa = i === 0 ? null : grenzen[i - 1];
    const xb = i === streifen.length - 1 ? null : grenzen[i];
    const poly = clip(kontur0, xa, xb);
    const st = streifen[i];
    tris(poly, st.loops.map((l) => l.aussen), farbeGrund);                  // Grund um die Buchstaben
    for (const l of st.loops) {
      tris(l.aussen, l.loecher, farbeText);                                   // Buchstabe
      for (const h of l.loecher) tris(h, [], farbeGrund);                     // Loch im Buchstaben
    }
  }
  if (!streifen.length) tris(kontur0, [], farbeGrund);
  aus.kontur = kontur0;                                   // fuer Mantel und Rueckseite (gleiche Punkte!)
  return aus;
}

/** Groesste Versalhoehe (>= SCHRIFT_MIN, <= maxH), bei der der Text in
 *  breite x hoehe passt — oder null. */
function textPassend(txt, maxH, breite, hoehe) {
  for (let h = Math.min(SCHRIFT_MAX, maxH); h >= SCHRIFT_MIN - 1e-9; h -= 0.5) {
    const ts = textShapes(txt, h);
    if (!ts) return null;
    if (ts.w <= breite && ts.h <= hoehe) return { ts, h };
  }
  return null;
}

/** Geschlossener Koerper aus Deckflaeche (mit Text), Rueckseite und Mantel
 *  ueber eine Kontur (a,b), Dicke von c0 bis c1 in Normalenrichtung; P bildet
 *  (a,b,c) in den Modulraum ab. Rueckgabe { geo, farben }. */
function textKoerper(kontur, ts, ta, tb, c0, c1, P, farbeText, farbeGrund) {
  const pos = [], farben = [];
  const tri = (A, B, C, farbe) => { pos.push(...A, ...B, ...C); farben.push(farbe); };
  const deck = textDeckflaeche(kontur, ts, ta, tb, farbeText, farbeGrund);
  for (const d of deck) tri(P(d.tri[0][0], d.tri[0][1], c1), P(d.tri[1][0], d.tri[1][1], c1), P(d.tri[2][0], d.tri[2][1], c1), d.farbe);
  kontur = deck.kontur;                                    // mit Streifen-Grenzpunkten
  // Rueckseite: Faecher um den Konturmittelpunkt (Normale -n)
  let ma = 0, mb = 0; for (const q of kontur) { ma += q[0]; mb += q[1]; } ma /= kontur.length; mb /= kontur.length;
  const M0 = P(ma, mb, c0);
  for (let i = 0; i < kontur.length; i++) { const a = kontur[i], b = kontur[(i + 1) % kontur.length]; tri(M0, P(b[0], b[1], c0), P(a[0], a[1], c0), farbeGrund); }
  // Mantel
  for (let i = 0; i < kontur.length; i++) {
    const a = kontur[i], b = kontur[(i + 1) % kontur.length];
    tri(P(a[0], a[1], c0), P(b[0], b[1], c0), P(b[0], b[1], c1), farbeGrund);
    tri(P(a[0], a[1], c0), P(b[0], b[1], c1), P(a[0], a[1], c1), farbeGrund);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const col = new Float32Array(pos.length);
  const cc = new THREE.Color();
  farben.forEach((fb, i) => { cc.set(fb); for (let k = 0; k < 3; k++) { col[i * 9 + k * 3] = cc.r; col[i * 9 + k * 3 + 1] = cc.g; col[i * 9 + k * 3 + 2] = cc.b; } });
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return { geo, farben };
}

/** Rahmen (o,u,v,n als Vector3, rechtshaendig) + Abbildung P aus einer Flaechenangabe. */
function rahmen(pl) {
  const u = new THREE.Vector3(...pl.u).normalize(), v = new THREE.Vector3(...pl.v).normalize(), n = new THREE.Vector3(...pl.n).normalize();
  if (new THREE.Vector3().crossVectors(u, v).dot(n) < 0) v.negate();
  const o = new THREE.Vector3(...pl.o);
  const P = (a, b, c) => [o.x + a * u.x + b * v.x + c * n.x, o.y + a * u.y + b * v.y + c * n.y, o.z + a * u.z + b * v.z + c * n.z];
  return { o, u, v, n, P };
}

// Ergebnis-Cache fuer etikett()/schild(): dieselbe Eingabe -> dasselbe Objekt
// (Geometrie wird geteilt; wer sie in eine Szene haengt, darf sie nicht
// dispose()n — die App haelt sich daran).
const ergebnisCache = new Map();
function gemerkt(key, bau) {
  if (ergebnisCache.has(key)) return ergebnisCache.get(key);
  if (ergebnisCache.size > 200) ergebnisCache.clear();
  const r = bau(); ergebnisCache.set(key, r); return r;
}

/**
 * Etikett (Ebene) fuer ein Modul: { geo, farben, groesse } oder null.
 * `groesse` 0 = automatisch: so gross wie moeglich (max 12), mindestens 5;
 * passt der Text auch mit 5 mm nicht, gibt es null.
 */
export function etikett(f, p, text, groesse, farbeText, farbeModul) {
  const txt = (text || '').trim().slice(0, 20);
  if (!txt || !f.beschriftung || !SCHRIFT) return null;
  return gemerkt('E' + f.id + JSON.stringify(p) + '|' + txt + '|' + groesse + '|' + farbeText + '|' + farbeModul, () => etikettBauen(f, p, txt, groesse, farbeText, farbeModul));
}
function etikettBauen(f, p, txt, groesse, farbeText, farbeModul) {
  const pl = f.beschriftung(p);
  if (!pl) return null;
  const rand = 0.8;
  const maxH = Math.min(SCHRIFT_MAX, groesse > 0 ? groesse : SCHRIFT_MAX, pl.hoehe - 2 * rand);
  const tp = textPassend(txt, maxH, pl.breite - 2 * rand, pl.hoehe - 2 * rand);
  if (!tp) return null;
  const bw = tp.ts.w + 2 * rand, bh = tp.ts.h + 2 * rand;
  const { P } = rahmen(pl);
  const kontur = [[-bw / 2, -bh / 2], [bw / 2, -bh / 2], [bw / 2, bh / 2], [-bw / 2, bh / 2]];
  const k = textKoerper(kontur, tp.ts, 0, 0, -(ETIKETT_DICKE - ETIKETT_VOR), ETIKETT_VOR, P, farbeText, farbeModul);
  return { geo: k.geo, farben: k.farben, groesse: tp.h };
}

// ---------------------------------------------------------------- Tafelhalter + Einschub-Tafel
//
// Manolo (18.08.2026): die Beschriftungs-Tafel soll NICHT geklebt, sondern
// ins Modul EINGESCHOBEN werden. Loesung wie beim IKEA-eigenen Skadis-
// Etikettenhalter, nur direkt am Modul angeformt:
//
//   * TAFELHALTER am Modul: zwei senkrechte C-Schienen (links/rechts) mit
//     Lippe nach innen, unten ein Auflagesteg mit 45-Grad-Fase — OBEN OFFEN.
//     Alles senkrecht extrudiert bzw. gefast: stehend gedruckt kein Ueberhang.
//     Fester Halter je Modul (volle nutzbare Breite, bis 14 mm hoch) —
//     unabhaengig vom Text; eine neue Tafel passt spaeter immer.
//   * TAFEL: flache Platte 1.0 mm (0.2 Spiel in der 1.2-mm-Tasche), Text
//     buendig auf der Vorderseite (Zellfarben), FLACH gedruckt; steht auf dem
//     Steg, ragt 1.5 mm ueber die Schienen (Griff zum Herausziehen). Eigene
//     Druckdatei schild_n.3mf.
//
// Der Halter gehoert zur Modulgeometrie (Parameter `tafel` = 1, wird von der
// App gesetzt, sobald Text mit Art "Tafel" da ist) — so sehen Export,
// Waechter, Gewicht und Kollision dasselbe. Koordinaten: Rahmen der
// schildflaeche() der Familie: a = Leserichtung u, b = hoch v, c = Normale
// n (nach aussen); c = 0 ist die Wandflaeche.
const TAFEL = {
  dicke: 1.0, spiel: 0.2,        // Tafel und Spiel in der Tasche (Tasche = 1.2)
  wand: 1.0, lippe: 1.0,         // C-Schiene: Seitenwand, Lippe nach innen
  lippeDicke: 0.6, vor: 1.8,     // Lippe (vorne) 0.6 dick, Halter ragt 1.8 vor
  steg: 1.5, griff: 1.5,         // Auflagesteg unten, Ueberstand der Tafel oben
  maxHoehe: 14, rand: 1,         // Halterhoehe (Schienen), Rand zur schildflaeche
  in: 0.3,                       // Halter greift 0.3 mm in die Wand (kein gemeinsames Eck)
};

/** Rahmen + Masse des Tafelhalters eines Moduls, oder null (kein Platz). */
export function tafelMasse(f, p) {
  if (!f.schildflaeche) return null;
  const pl = f.schildflaeche(p);
  if (!pl) return null;
  const Wh = pl.breite - 2 * TAFEL.rand;
  const Hh = Math.min(TAFEL.maxHoehe, pl.hoehe - TAFEL.griff - 1);
  if (Wh < 16 || Hh < 7) return null;
  const u = new THREE.Vector3(...pl.u).normalize(), v = new THREE.Vector3(...pl.v).normalize(), n = new THREE.Vector3(...pl.n).normalize();
  if (new THREE.Vector3().crossVectors(u, v).dot(n) < 0) v.negate();
  const o = new THREE.Vector3(...pl.o);
  const M = new THREE.Matrix4().makeBasis(u, v, n); M.setPosition(o);   // lokal (a,b,c) -> Modul
  const b0 = -Hh / 2;                                                    // Halter-Unterkante
  return {
    pl, Wh, Hh, M, o: [o.x, o.y, o.z], u: [u.x, u.y, u.z], v: [v.x, v.y, v.z], n: [n.x, n.y, n.z],
    tafelBreite: Wh - 2 * TAFEL.wand - 2 * TAFEL.spiel,
    tafelHoehe: Hh - TAFEL.steg + TAFEL.griff,
    tafelUnten: b0 + TAFEL.steg,                                          // Tafel steht auf dem Steg
    sichtBreite: Wh - 2 * (TAFEL.wand + TAFEL.lippe) - 2,                 // was von der Tafel sichtbar ist (minus Rand)
    sichtHoehe: Hh - TAFEL.steg + TAFEL.griff - 2,
    b0,
  };
}

/** Geometrien des Tafelhalters im Modulraum (Schienen, Lippen, Steg). */
export function tafelhalter(f, p) {
  const tm = tafelMasse(f, p);
  if (!tm) return [];
  const { Wh, Hh, M, b0 } = tm;
  const teile = [];
  const box = (a0, a1, bb0, bb1, c0, c1) => {
    const g = new THREE.BoxGeometry(a1 - a0, bb1 - bb0, c1 - c0);
    g.translate((a0 + a1) / 2, (bb0 + bb1) / 2, (c0 + c1) / 2);
    return g;
  };
  const cIn = -TAFEL.in, cVor = TAFEL.vor;
  for (const s of [-1, 1]) {
    // Seitenwand (volle Tiefe) — Rand des Halters, Aussenkante bei s*Wh/2
    const aA = s * Wh / 2, aI = s * (Wh / 2 - TAFEL.wand);
    teile.push(box(Math.min(aA, aI), Math.max(aA, aI), b0, Hh / 2, cIn, cVor));
    // Lippe vorne, nach innen ueber die Tafel (0.01 in die Seitenwand, keine gemeinsame Ecke)
    const aL = s * (Wh / 2 - TAFEL.wand - TAFEL.lippe), aS = s * (Wh / 2 - TAFEL.wand + 0.01);
    teile.push(box(Math.min(aL, aS), Math.max(aL, aS), b0 + 0.01, Hh / 2 - 0.01, cVor - TAFEL.lippeDicke, cVor));
  }
  // Steg unten mit 45-Grad-Fase: Querschnitt in (b, c), extrudiert ueber a.
  // Shape (x=b, y=c) -> Extrusion z=a; danach zyklisch permutiert (Rotation).
  const bs0 = b0, bs1 = b0 + TAFEL.steg;
  const sh = new THREE.Shape();
  sh.moveTo(bs1, cIn); sh.lineTo(bs1, cVor); sh.lineTo(bs0, cVor); sh.lineTo(bs0 - (cVor - cIn), cIn); sh.closePath();
  const steg = new THREE.ExtrudeGeometry(sh, { depth: Wh - 2 * TAFEL.wand + 0.02, bevelEnabled: false });
  // (x_s, y_s, z_e) -> (a, b, c) = (z_e, x_s, y_s): zyklische Permutation, det +1
  steg.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  steg.translate(-(Wh / 2 - TAFEL.wand) - 0.01, 0, 0);
  teile.push(steg);
  for (const g of teile) g.applyMatrix4(M);
  return teile;
}

/**
 * Einschub-Tafel: { geo, farben, groesse, breite, hoehe, o, u, v, n } oder
 * null. geo im MODULRAUM (in der Tasche sitzend); der Export legt sie ueber
 * schildFlach() flach hin (u -> x, v -> y, n -> z), Text oben.
 */
export function schild(f, p, text, groesse, farbeText, farbeSchild) {
  const txt = (text || '').trim().slice(0, 20);
  if (!txt || !f.schildflaeche || !SCHRIFT) return null;
  return gemerkt('S' + f.id + JSON.stringify(p) + '|' + txt + '|' + groesse + '|' + farbeText + '|' + farbeSchild, () => schildBauen(f, p, txt, groesse, farbeText, farbeSchild));
}
function schildBauen(f, p, txt, groesse, farbeText, farbeSchild) {
  const tm = tafelMasse(f, p);
  if (!tm) return null;
  // 0.4 mm Luft zum Rand (Eckenrundung); sichtbar ist die Tafel oberhalb des Stegs, zwischen den Lippen
  const maxH = Math.min(SCHRIFT_MAX, groesse > 0 ? groesse : SCHRIFT_MAX, tm.sichtHoehe - 0.4);
  const tp = textPassend(txt, maxH, tm.sichtBreite, tm.sichtHoehe - 0.4);
  if (!tp) return null;
  const bw = tm.tafelBreite, bh = tm.tafelHoehe;
  const bM = tm.tafelUnten + bh / 2;                       // Tafelmitte (b); Text darum zentriert
  const c0 = 0.1, c1 = 0.1 + TAFEL.dicke;                  // 0.1 vor der Wand, in der Tasche (0..1.2)
  const { P } = rahmen(tm);
  // Aussenkontur: unten gerundet (Einfuehren), oben eckig; gegen den Uhrzeigersinn
  const kontur = [];
  const R = 1.0, seg = 5;
  const bU = tm.tafelUnten, bO = tm.tafelUnten + bh;
  const ecke = (cx, cy, a0) => { for (let k = 0; k <= seg; k++) { const a = a0 + (k / seg) * Math.PI / 2; kontur.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); } };
  ecke(bw / 2 - R, bU + R, -Math.PI / 2);                  // unten rechts
  kontur.push([bw / 2, bO], [-bw / 2, bO]);                // oben rechts, oben links
  ecke(-bw / 2 + R, bU + R, Math.PI);                      // unten links
  const k = textKoerper(kontur, tp.ts, 0, bM, c0, c1, P, farbeText, farbeSchild);
  return { geo: k.geo, farben: k.farben, groesse: tp.h, breite: bw, hoehe: bh, o: tm.o, u: tm.u, v: tm.v, n: tm.n };
}

/** Matrix, die eine Tafel aus dem Modulraum FLACH aufs Bett legt: u -> +x,
 *  v -> +y, n -> +z (Text oben). */
export function schildFlach(s) {
  const o = new THREE.Vector3(...s.o), u = new THREE.Vector3(...s.u), v = new THREE.Vector3(...s.v), n = new THREE.Vector3(...s.n);
  const B = new THREE.Matrix4().makeBasis(u, v, n);          // Spalten u, v, n
  const Binv = B.clone().transpose();
  const T = new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z);
  return new THREE.Matrix4().multiplyMatrices(Binv, T);
}

// ---------------------------------------------------------------- Abbrechstuetzen
//
// STEHEND gedruckte Module (Wanne, Halter) haben ein Problem, das keine
// Drucklage loest: die Zunge des S70 haengt HINTER der Platte. Unter ihr
// darf also nichts vom Modul sein — im Sitz ist dort die Skadis-Platte.
// Steht das Modul auf dem Bett, beginnt die Zungenspitze 30-80 mm ueber
// dem Bett im Nichts: eine Insel, die kein Drucker druckt (Wanne 2L: zwei
// Inseln bei z=37.8; der Flaechenwinkel-Test sah es nicht, weil die Spitze
// 45-Grad-Fasen hat — der Insel-Test in lochwand-pruefen.py schon).
//
// Deshalb gibt der EXPORT je Haken eine Abbrechstuetze mit:
//   * Saeule 4.5 x 3 mm (so breit wie die Zunge, so tief wie die Zunge:
//     z 5.15..8.15) vom Bett bis 0.3 mm IN die Zungenspitze — dort
//     verschmolzen (Sollbruch ca. 0.6 x 4.5 mm auf der Schneide der Spitze;
//     die Spitze ist keine tragende Flaeche, ein Rest stoert nicht).
//   * Fuss 0.6 mm hoch (3 Schichten) vom Ruecken der Rueckwand bis unter
//     die Saeule, 0.2 mm in die Rueckwand hinein: haelt den Turm beim
//     Drucken, bricht danach an der Rueckwand ab. Der Fuss liegt in der
//     Zone, wo im Sitz die Platte ist — er MUSS ab. Man sieht es sofort:
//     mit Fuss sitzt das Modul nicht an.
// Die Stuetzen sind nicht Teil des Produkts: die Buehne zeigt sie nicht,
// das Gewicht zaehlt sie nicht (0.6 g je Stuetze zulasten von Manolo — im
// Preis nicht abgebildet, bewusst), nur der 3MF-Export enthaelt sie.
export function abbrechstuetzen(hakenListe, yUnten) {
  // Fassung 2 (Manolo 18.08.: erster Druck — Saeule 4.5 x 3 auf 37 mm war zu
  // duenn und zu hoch, wackelte, oben Spaghetti). Jetzt:
  //   * Saeule 6 x 6 mm durchgehend, mittig unter der Zunge (z 3.65..9.65),
  //     steht direkt auf dem Bett; ein schmaler Fuss (6 x 0.6) bindet sie
  //     unten an die Rueckwand (Manolo 18.08.: der breite 12x12-Fuss war
  //     uebertrieben — wieder weg)
  //   * hoechstens ZWEI 45-Grad-Streben 0.8 x 2 mm (bei 1/3 und 2/3 der Hoehe)
  //     zwischen Rueckwand-Ruecken und Saeule: seitlich gehalten, mit den
  //     Fingern zu brechen, Reste hinten gegen die Platte (Manolo: max. 2)
  //   * oben wie bisher 0.3 mm in die Zungenspitze verschmolzen (Sollbruch)
  // Kostet ~2 g je Haken statt 0.6 — zaehlt im Gewicht mit (Preis ~5 Rp).
  const teile = [];
  const zN = HAKEN_TIEFE - 3.0, zH = HAKEN_TIEFE;          // Zunge: z 5.15..8.15
  const zM = (zN + zH) / 2;                                 // 6.65, Zungenmitte
  const S = 6.0;                                            // Saeule
  const ySpitze = -7.0;                                     // ZUNGE_LAENGE
  for (const h of hakenListe) {
    const x = -h.dx * RASTER, y0 = yUnten;
    const yTop = ySpitze + 0.3 + h.dy * REIHEN_TEILUNG;
    const saeule = new THREE.BoxGeometry(S, yTop - y0, S);
    saeule.translate(x, (yTop + y0) / 2, zM);               // steht auf dem Bett
    teile.push(saeule);
    // Fuss: schmaler Steg von der Rueckwand (0.2 drin) bis 0.2 in die Saeule, 0.6 hoch, 0.01 ueber dem Bett
    const zS = zM - S / 2;                                  // Saeulen-Vorderseite 3.65
    const fuss = new THREE.BoxGeometry(S - 0.02, 0.6, zS + 0.4);
    fuss.translate(x, y0 + 0.31, (zS + 0.2 - 0.2) / 2);
    teile.push(fuss);
    // Streben zur Rueckwand: 45 Grad steigend von der Rueckwand (z -0.2) zur
    // Saeule (z 3.85) — waagrechte Bruecken hatten je 3 mm2 Ueberhang, die
    // Strebe hat keinen. Hoechstens zwei, bei 1/3 und 2/3 der Turmhoehe;
    // unter 18 mm Turm eine, unter 10 mm keine.
    const spann = zS + 0.4, L = spann * Math.SQRT2 + 1.0;   // Diagonale plus Ueberlappung
    const hTurm = yTop - y0;
    const lagen = hTurm >= 18 ? [y0 + hTurm / 3, y0 + 2 * hTurm / 3] : hTurm >= 10 ? [y0 + hTurm / 2] : [];
    for (const y of lagen) {
      const st = new THREE.BoxGeometry(0.8, 2.0, L);
      st.rotateX(-Math.PI / 4);                             // lokale z-Achse -> (+y, +z), 45 Grad
      st.translate(x, y + spann / 2, -0.2 + spann / 2);
      teile.push(st);
    }
  }
  return teile;
}

// ---------------------------------------------------------------- Umriss
//
// Platzbedarf eines Moduls auf der Platte in BETRACHTERKOORDINATEN, relativ
// zum Ankerpunkt (Unterkante des Ankerlochs, Mitte): x nach rechts, y nach
// UNTEN (wie raster.js), tiefe nach vorne. Aus dem Huellquader der Geometrie
// abgeleitet — deshalb stimmt er immer mit dem ueberein, was gezeichnet und
// gedruckt wird. Ergebnis wird je Familie+Parameter gemerkt.
//   { links, rechts, oben, unten, tiefe }   (links/oben meist negativ)
const umrissCache = new Map();
export function umriss(f, p) {
  const key = f.id + JSON.stringify(p);
  let u = umrissCache.get(key);
  if (u) return u;
  const box = new THREE.Box3();
  const geos = f.geometrie(p);
  for (const g of geos) { g.computeBoundingBox(); box.union(g.boundingBox); g.dispose(); }
  // Modul +x = Betrachter links; Modul +y = oben; Modul -z = nach vorne.
  u = { links: -box.max.x, rechts: -box.min.x, oben: -box.max.y, unten: -box.min.y, tiefe: -box.min.z };
  if (umrissCache.size > 500) umrissCache.clear();
  umrissCache.set(key, u);
  return u;
}

// ---------------------------------------------------------------- Vorlagen
//
// Fertige Einstellungen fuer haeufige Faelle (Manolo 18.08.: "ich haette
// gerne Vorlagen, als erstes Schraubenzieher"). Eine Vorlage ist EIN Modul
// mit gesetzten Parametern — die Kundschaft kann danach alles anpassen.
//
// Schraubenzieher (recherchiert 18.08.2026): Klingen bis ~8 mm (PZ3, grosse
// Schlitz), Griffe 24-36 mm (Wera Kraftform Plus/VDE bis 36, Chiseldriver 40);
// Halter-Racks setzen ~30 mm Teilung (Wera-Rack 190 mm fuer 6 Stueck) und
// Loecher von 10 mm, durch die die Klinge faellt und der Griff aufsitzt.
// Also: Loch 10 mm, Abstand 30 mm; Griffe bis 30 mm beruehren sich nicht.
// Kategorien fuer die Bibliothek (Manolo 18.08.: "Kategorie Werkstatt,
// uebersichtlicher"): Grundformen stehen fuer sich, Vorlagen sind nach
// Einsatz gruppiert.
export const KATEGORIEN = [
  { id: 'werkstatt', name: 'Werkstatt' },
  { id: 'buero', name: 'Büro & Bastel' },
  { id: 'kueche', name: 'Küche & Bad' },
];
export const VORLAGEN = [
  { id: 'schraubenzieher-6', kategorie: 'werkstatt', familie: 'halter', name: 'Schraubenzieher · 6', kurz: 'Ø 10 mm, Abstand 30 mm, 200 mm breit',
    params: { breite: 5, tiefe: 40, durchmesser: 10, anzahl: 6, abstand: 30, reihen: 1, schlitze: 0, rundung: 6 } },
  { id: 'schraubenzieher-3', kategorie: 'werkstatt', familie: 'halter', name: 'Schraubenzieher · 3', kurz: 'Ø 10 mm, Abstand 30 mm, 120 mm breit',
    params: { breite: 3, tiefe: 40, durchmesser: 10, anzahl: 3, abstand: 30, reihen: 1, schlitze: 0, rundung: 6 } },
  // Bits 1/4" (Sechskant 6.35 -> Loch 7): Treppe, hinten je Reihe 8 mm hoeher,
  // Sackloecher (Bits fallen sonst durch), Konsole 12 mm dick (Loch 10 tief)
  { id: 'bits-2', kategorie: 'werkstatt', familie: 'halter', name: 'Bits · 2 Reihen', kurz: '14 Bits, Ø 7 mm, Treppe, 80 mm breit',
    params: { breite: 2, tiefe: 30, durchmesser: 7, anzahl: 7, abstand: 10, reihen: 2, stufe: 8, dicke: 12, sackloch: 1, schlitze: 0, rundung: 4 } },
  { id: 'bits-3', kategorie: 'werkstatt', familie: 'halter', name: 'Bits · 3 Reihen', kurz: '21 Bits, Ø 7 mm, Treppe, 80 mm breit',
    params: { breite: 2, tiefe: 45, durchmesser: 7, anzahl: 7, abstand: 10, reihen: 3, stufe: 7, dicke: 12, sackloch: 1, schlitze: 0, rundung: 4 } },
  // Bohrer-Satz 1-10 mm: Loecher Ø 2..11 (Bohrer + 1 mm Luft), links klein,
  // rechts gross, Sackloecher, 12 mm dick
  { id: 'bohrer-10', kategorie: 'werkstatt', familie: 'halter', name: 'Bohrer 1–10 mm', kurz: '10 Löcher Ø 2–11 gestaffelt, 120 mm breit',
    params: { breite: 3, tiefe: 30, durchmesser: 2, d2: 11, anzahl: 10, abstand: 11, reihen: 1, dicke: 12, sackloch: 1, schlitze: 0, rundung: 4 } },
  // Zangen: Schlitze 15 mm, Teilung 36 (Griffe durch den Schlitz, Kopf sitzt auf)
  { id: 'zangen-4', kategorie: 'werkstatt', familie: 'halter', name: 'Zangen · 4', kurz: 'Schlitze 15 mm, Abstand 36, 160 mm breit',
    params: { breite: 4, tiefe: 40, durchmesser: 15, anzahl: 4, abstand: 36, reihen: 1, schlitze: 1, rundung: 6, dicke: 6 } },
  // Stiftebecher: schmale, hohe Wanne mit Boden
  { id: 'stifte', kategorie: 'buero', familie: 'wanne', name: 'Stiftebecher', kurz: '40 × 40 mm, 90 hoch, geschlossen',
    params: { breite: 1, tiefe: 40, hoehe: 90, trenner: 0, neigung: 0, rundung: 12, boden: 0 } },
  { id: 'kleinteile', kategorie: 'werkstatt', familie: 'wanne', name: 'Kleinteile-Box', kurz: '80 mm, 3 Fächer, geneigt',
    params: { breite: 2, tiefe: 50, hoehe: 40, trenner: 2, neigung: 15, rundung: 6, boden: 0 } },
  { id: 'spraydose', kategorie: 'werkstatt', familie: 'klemme', name: 'Sprühdose', kurz: 'Klemme Ø 66, Öffnung 50',
    params: { durchmesser: 66, klemmweite: 50, hoehe: 25 } },
  { id: 'kabel', kategorie: 'buero', familie: 'halter', name: 'Kabel · 4', kurz: 'Schlitze 8 mm, Abstand 20',
    params: { breite: 2, tiefe: 30, durchmesser: 8, anzahl: 4, abstand: 20, reihen: 1, schlitze: 1, rundung: 6, dicke: 5 } },
  { id: 'papierrolle', kategorie: 'kueche', familie: 'haken', name: 'Rollenhalter', kurz: 'Haken 60 mm, 10 mm stark',
    params: { laenge: 60, winkel: 20, staerke: 10 } },
  { id: 'gewuerze', kategorie: 'kueche', familie: 'wanne', name: 'Gewürz-Ablage', kurz: '120 mm, flach, geneigt',
    params: { breite: 3, tiefe: 45, hoehe: 30, trenner: 0, neigung: 10, rundung: 6, boden: 0 } },
];

// ---------------------------------------------------------------- Registry
export const FAMILIEN = [HAKEN, WANNE, HALTER, KLEMME];
export function familie(id) { return FAMILIEN.find((f) => f.id === id); }

/** Startparameter einer Familie. */
export function startParameter(f) {
  const p = {};
  for (const [k, def] of Object.entries(f.parameter)) p[k] = def.start;
  return p;
}
export function parameterRastern(f, p) {
  const q = {};
  for (const [k, def] of Object.entries(f.parameter)) q[k] = rastere(p[k] ?? def.start, def);
  return q;
}

/** Volumen einer Liste von Geometrien in mm3 (Signed-Volume je Dreieck). */
export function volumenMm3(geos) {
  let v = 0;
  for (const g of geos) {
    const ng = g.index ? g.toNonIndexed() : g;
    const a = ng.attributes.position.array;
    for (let i = 0; i < a.length; i += 9) {
      const x1 = a[i], y1 = a[i+1], z1 = a[i+2], x2 = a[i+3], y2 = a[i+4], z2 = a[i+5], x3 = a[i+6], y3 = a[i+7], z3 = a[i+8];
      v += (x1 * (y2 * z3 - y3 * z2) - x2 * (y1 * z3 - y3 * z1) + x3 * (y1 * z2 - y2 * z1)) / 6;
    }
    if (ng !== g) ng.dispose();
  }
  // Ueberlappende Teile werden hier doppelt gezaehlt (Union kommt beim
  // Export). Fuer den Preis ist das ein kleiner Aufschlag zugunsten von
  // Manolo — nie zu seinen Lasten.
  return Math.abs(v);
}
