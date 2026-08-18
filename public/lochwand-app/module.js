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
    laenge:  { name: 'Länge',        min: 20,  max: 120, schritt: 5,  einheit: 'mm', start: 50 },
    winkel:  { name: 'Aufbiegung',   min: 0,   max: 45,  schritt: 5,  einheit: '°',  start: 15 },
    staerke: { name: 'Armstärke',    min: 5,   max: 12,  schritt: 1,  einheit: 'mm', start: 7 },
    kappe:   { name: 'Endkappe',     min: 0,   max: 1,   schritt: 1,  einheit: '',   start: 1, schalter: true },
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
    const plattenH = 30;
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

    const armY = HALS_HOEHE - plattenH + p.staerke / 2 + 4;
    const winkel = THREE.MathUtils.degToRad(p.winkel);
    const geradeL = Math.max(8, p.laenge - (p.winkel > 0 ? p.staerke * 1.2 : 0));
    const arm = new THREE.BoxGeometry(p.staerke, p.staerke, geradeL);
    arm.translate(kante + p.staerke / 2, armY, -plattenT - geradeL / 2);
    teile.push(arm);

    if (p.winkel > 0) {
      const spitzeL = p.staerke * 1.6;
      const sp = new THREE.BoxGeometry(p.staerke, p.staerke, spitzeL);
      sp.translate(0, 0, -spitzeL / 2 + p.staerke * 0.35);
      sp.applyMatrix4(new THREE.Matrix4().makeRotationX(-winkel));
      sp.translate(kante + p.staerke / 2, armY, -plattenT - geradeL + p.staerke * 0.35);
      teile.push(sp);
    }

    // Endkappe: statt Kugel (rund = Ueberhang in jeder Lage) ein flacher
    // Wulst mit gefaster Vorderkante — liegt in der Seitenlage mit auf.
    if (p.kappe) {
      const kappeH = p.staerke * 1.5, kappeT = p.staerke * 0.6;
      const k = new THREE.BoxGeometry(p.staerke, kappeH, kappeT);
      const tipZ = -plattenT - p.laenge;
      const tipY = armY + (p.winkel > 0 ? Math.sin(winkel) * p.staerke * 1.6 : 0);
      k.translate(kante + p.staerke / 2, tipY + kappeH / 2 - p.staerke / 2, tipZ + kappeT / 2);
      teile.push(k);
    }

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
    anzahl:      { name: 'Löcher je Reihe', min: 1,  max: 12, schritt: 1, einheit: '',       start: 4 },
    reihen:      { name: 'Reihen',          min: 1,  max: 3,  schritt: 1, einheit: '',       start: 1 },
    schlitze:    { name: 'Schlitze (vorne offen)', min: 0, max: 1, schritt: 1, einheit: '', start: 0, schalter: true },
    rundung:     { name: 'Rundung',         min: 0,  max: 15, schritt: 1, einheit: 'mm',     start: 4 },
  },
  RUECKWAND_HOEHE: 30,
  BRETT: 5,
  masse(p) {
    const breiteMm = p.breite * RASTER;
    return { breiteMm, tiefe: p.tiefe, hoehe: this.RUECKWAND_HOEHE, yUnten: HALS_HOEHE - this.RUECKWAND_HOEHE };
  },
  haken(p) { return Array.from({ length: p.breite }, (_, i) => ({ dx: i, dy: 0 })); },
  stuetzen(p) { return abbrechstuetzen(this.haken(p), this.masse(p).yUnten); },
  /** SCHILD: Rueckwand vorne, ueber den Wangen (12 mm) bis unter die
   *  Hakenzone — rund 11 mm hoch, ganze Breite minus Rand. */
  schildflaeche(p) {
    const { breiteMm, yUnten } = this.masse(p);
    const yA = yUnten + this.BRETT + 12 + 1, yB = HALS_HOEHE - 1.5;
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
    return { o: [cx, yUnten + this.BRETT, -(sA + sB) / 2], u: [-1, 0, 0], v: [0, 0, 1], n: [0, 1, 0], breite, hoehe: tief };
  },
  /** Lochbild: Mittelpunkte in (x, s) und was davon Schlitze sind. So viele
   *  Loecher, wie mit 2 mm Steg Platz haben — die Zahl wird still gekuerzt. */
  lochbild(p) {
    const { breiteMm, tiefe } = this.masse(p);
    const T = tiefe + WAND, d = p.durchmesser, steg = 2;
    const r = Math.max(0, Math.min(p.rundung, breiteMm / 2 - 1, tiefe / 2 - 1));
    const x0 = -breiteMm / 2, x1 = breiteMm / 2;
    // Nutzbare Breite: innerhalb der Wangen; Schlitze zusaetzlich innerhalb der Rundung
    const rand = WAND + steg + (p.schlitze ? r : 0);
    const nutz = breiteMm - 2 * rand;
    const n = Math.max(1, Math.min(p.anzahl, Math.floor((nutz + steg) / (d + steg))));
    const reihen = p.schlitze ? 1 : p.reihen;
    const xs = Array.from({ length: n }, (_, i) => x0 + rand + (nutz - n * d - (n - 1) * steg) / 2 + d / 2 + i * (d + steg));
    // Reihen: gleichmaessig zwischen Rueckwand (+Steg) und Vorderkante (+Steg)
    const sMin = WAND + steg + d / 2, sMax = T - steg - d / 2;
    const ss = reihen === 1 ? [(sMin + sMax) / 2] : Array.from({ length: reihen }, (_, i) => sMin + (sMax - sMin) * i / (reihen - 1));
    const punkte = [];
    for (const s of ss) for (const x of xs) punkte.push({ x, s });
    return { punkte, d, schlitze: !!p.schlitze, r, T, x0, x1, n, reihen };
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
    // Loecher als Ausschnitte bzw. Schlitze als Kerben der Frontkante.
    const kerben = lb.schlitze ? lb.punkte.map((q) => ({ x: q.x, s: q.s, breite: d })) : [];
    const brett = kontur(x0, x1, T, r, 0, kerben, WAND - 0.4);
    if (!lb.schlitze) for (const q of lb.punkte) { const h = new THREE.Path(); h.absarc(q.x, q.s, d / 2, 0, Math.PI * 2, false); brett.holes.push(h); }
    teile.push(extrudiert(brett, this.BRETT, yUnten));

    // Wangen: Dreiecksprofil (s, y) auf dem Brett, links und rechts, bis vor
    // die Rundung. Greifen 0.4 in Rueckwand und Brett.
    const yS = yUnten + this.BRETT - 0.4;
    const s0 = WAND - 0.4, s1 = Math.max(s0 + 4, T - r - 0.4);
    const wange = new THREE.Shape();
    wange.moveTo(s0, yS); wange.lineTo(s1, yS); wange.lineTo(s1, yS + 3); wange.lineTo(s0, yS + 12); wange.closePath();
    teile.push(extrudiertQuer(wange, WAND, x0 + 0.01));            // 0.01: keine Ecke faellt mit dem Brett zusammen
    teile.push(extrudiertQuer(wange, WAND, x1 - WAND - 0.01));

    // Verschieben: erster Haken (Betrachter links) im Ursprung
    const schub = RASTER / 2 - x1;
    for (const g of teile) g.translate(schub, 0, 0);
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
  },
  ARM: 3.0,          // Armstaerke (Manolo 17.08.: 2.0 war zu duenn)
  HAKENZONE: 12,     // Rueckwand ueber dem Ring
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
// gibt es das SCHILD (siehe unten): eine flache Platte mit dem Text, flach
// gedruckt, zum Aufsetzen. Uebernommen vom Organizer (public/organizer-app):
// der Text wird in eine Pixelmaske gerastert (Canvas, "Arial Black"), und
// die Flaeche wird in Zellen zerlegt, jede Zelle bekommt ihre Farbe als
// DREIECKSFARBE im 3MF (wie beim QR-Schild: der Drucker legt die Farbe plan
// ein). Damit die Familien-Geometrie unangetastet bleibt, ist das Etikett
// ein eigener, geschlossener Koerper: 0.8 mm dick, IN der Wand (0.75 mm
// eingelassen), Vorderseite 0.05 mm vor der Wandflaeche — unterhalb jeder
// Druckaufloesung, aber eindeutig die aeusserste Flaeche: so gewinnen beim
// Vereinigen ihre Zellfarben, nicht die Wandflaeche dahinter.
//
// Jede Familie liefert `beschriftung(p)`: Mitte o, Leserichtung u, Hoch v,
// Normale n (nach aussen), verfuegbare breite/hoehe in mm. Fehlt Platz,
// null -> kein Etikett, die App sagt es.
const ETIKETT_DICKE = 0.8, ETIKETT_VOR = 0.05;
// Masken-Cache als Map (der Organizer merkt sich nur die letzte Maske; hier
// rastern sechs Module mit Text bei jeder Preisrechnung neu — das hing den
// Browser sekundenlang). Ebenso werden fertige Etiketten/Schilder je
// Eingabe gemerkt (etikett()/schild()).
const maskCache = new Map();
function textMaske(txt, hMm, res) {
  if (typeof document === 'undefined') return globalThis.__testMaske ? globalThis.__testMaske(txt, hMm, res) : null;   // Node: kein Canvas -> Testmaske (koerper-check) oder nichts
  const key = txt + '|' + hMm + '|' + res;
  if (maskCache.has(key)) { const c = maskCache.get(key); return c.leer ? null : c; }
  if (maskCache.size > 300) maskCache.clear();
  const hPx = hMm / res / 0.72;
  const mess = document.createElement('canvas').getContext('2d');
  mess.font = `${hPx}px "Arial Black", Arial, sans-serif`;
  const wPx = Math.min(1600, Math.ceil(mess.measureText(txt).width) + 6);
  const c = document.createElement('canvas'); c.width = wPx; c.height = Math.ceil(hPx * 1.5);
  const x = c.getContext('2d');
  x.font = `${hPx}px "Arial Black", Arial, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  x.fillText(txt, c.width / 2, c.height / 2);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const pix = (px, py) => px >= 0 && py >= 0 && px < c.width && py < c.height && d[(py * c.width + px) * 4 + 3] > 127;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, leer = true;
  for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) if (pix(px, py)) { leer = false; if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py; }
  if (leer) { maskCache.set(key, { leer: true }); return null; }
  const cols = maxX - minX + 1, rows = maxY - minY + 1;
  const mk = { cols, rows, res, w: cols * res, h: rows * res, drin: (i, j) => pix(minX + i, maxY - j) };
  maskCache.set(key, mk);
  return mk;
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
 * Etikett fuer ein Modul: { geo, farben } oder null.
 *   geo    — BufferGeometry (nicht indiziert), Zellen der Vorderseite +
 *            Rueckseite + 4 Seiten
 *   farben — Hex-Farbe je Dreieck (Text- oder Modulfarbe), fuer 3MF und Anzeige
 *   groesse — tatsaechlich verwendete Schrifthoehe (mm)
 * `groesse` 0 = automatisch: so gross wie moeglich (max 12), mindestens 4;
 * passt der Text auch mit 4 mm nicht, gibt es null.
 */
export function etikett(f, p, text, groesse, farbeText, farbeModul) {
  const txt = (text || '').trim().slice(0, 20);
  if (!txt || !f.beschriftung) return null;
  return gemerkt('E' + f.id + JSON.stringify(p) + '|' + txt + '|' + groesse + '|' + farbeText + '|' + farbeModul, () => etikettBauen(f, p, txt, groesse, farbeText, farbeModul));
}
function etikettBauen(f, p, txt, groesse, farbeText, farbeModul) {
  const pl = f.beschriftung(p);
  if (!pl) return null;
  const maxH = Math.min(12, pl.hoehe);
  let h = groesse > 0 ? Math.min(groesse, maxH) : maxH;
  let mk = null;
  for (; h >= 4; h -= 0.5) { mk = textMaske(txt, h, Math.max(0.3, h / 22)); if (mk && mk.w <= pl.breite && mk.h <= pl.hoehe) break; mk = null; }
  if (!mk) return null;
  const rand = 0.6;
  const bw = mk.w + 2 * rand, bh = mk.h + 2 * rand;
  const u = new THREE.Vector3(...pl.u).normalize(), v = new THREE.Vector3(...pl.v).normalize(), n = new THREE.Vector3(...pl.n).normalize();
  // Rechtssystem sicherstellen (u x v = n), sonst v spiegeln
  if (new THREE.Vector3().crossVectors(u, v).dot(n) < 0) v.negate();
  const o = new THREE.Vector3(...pl.o);
  const P = (a, b, c) => [o.x + a * u.x + b * v.x + c * n.x, o.y + a * u.y + b * v.y + c * n.y, o.z + a * u.z + b * v.z + c * n.z];
  const pos = [], farben = [];
  const tri = (A, B, C, farbe) => { pos.push(...A, ...B, ...C); farben.push(farbe); };
  const c0 = -(ETIKETT_DICKE - ETIKETT_VOR), c1 = ETIKETT_VOR;
  // Vorderseite: Zellenraster (Randstreifen als grosse Zellen)
  const xs = [-bw / 2, -mk.w / 2]; for (let i = 1; i <= mk.cols; i++) xs.push(-mk.w / 2 + i * mk.res); xs.push(bw / 2);
  const ys = [-bh / 2, -mk.h / 2]; for (let j = 1; j <= mk.rows; j++) ys.push(-mk.h / 2 + j * mk.res); ys.push(bh / 2);
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const imMaske = i >= 1 && i <= mk.cols && j >= 1 && j <= mk.rows;
    const farbe = imMaske && mk.drin(i - 1, j - 1) ? farbeText : farbeModul;
    const a0 = xs[i], a1 = xs[i + 1], b0 = ys[j], b1 = ys[j + 1];
    tri(P(a0, b0, c1), P(a1, b0, c1), P(a1, b1, c1), farbe);
    tri(P(a0, b0, c1), P(a1, b1, c1), P(a0, b1, c1), farbe);
  }
  // Seiten als Streifen entlang des Rasters (dieselben Ecken wie die
  // Vorderseite — sonst T-Stoesse, 162 offene Kanten in der ersten Fassung),
  // Rueckseite als Faecher um den Mittelpunkt ueber dieselben Randpunkte.
  const A = -bw / 2, B = bw / 2, C = -bh / 2, D = bh / 2;
  for (let i = 0; i < xs.length - 1; i++) {
    const a0 = xs[i], a1 = xs[i + 1];
    tri(P(a0, C, c0), P(a1, C, c0), P(a1, C, c1), farbeModul); tri(P(a0, C, c0), P(a1, C, c1), P(a0, C, c1), farbeModul);   // unten (-v)
    tri(P(a0, D, c0), P(a1, D, c1), P(a1, D, c0), farbeModul); tri(P(a0, D, c0), P(a0, D, c1), P(a1, D, c1), farbeModul);   // oben (+v)
  }
  for (let j = 0; j < ys.length - 1; j++) {
    const b0 = ys[j], b1 = ys[j + 1];
    tri(P(A, b0, c0), P(A, b0, c1), P(A, b1, c1), farbeModul); tri(P(A, b0, c0), P(A, b1, c1), P(A, b1, c0), farbeModul);   // links (-u)
    tri(P(B, b0, c0), P(B, b1, c1), P(B, b0, c1), farbeModul); tri(P(B, b0, c0), P(B, b1, c0), P(B, b1, c1), farbeModul);   // rechts (+u)
  }
  const M0 = P(0, 0, c0);                                        // Rueckseite: Faecher (Normale -n)
  for (let i = 0; i < xs.length - 1; i++) { tri(M0, P(xs[i + 1], C, c0), P(xs[i], C, c0), farbeModul); tri(M0, P(xs[i], D, c0), P(xs[i + 1], D, c0), farbeModul); }
  for (let j = 0; j < ys.length - 1; j++) { tri(M0, P(A, ys[j], c0), P(A, ys[j + 1], c0), farbeModul); tri(M0, P(B, ys[j + 1], c0), P(B, ys[j], c0), farbeModul); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const col = new Float32Array(pos.length);
  const cc = new THREE.Color();
  farben.forEach((fb, i) => { cc.set(fb); for (let k = 0; k < 3; k++) { col[i * 9 + k * 3] = cc.r; col[i * 9 + k * 3 + 1] = cc.g; col[i * 9 + k * 3 + 2] = cc.b; } });
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return { geo, farben, groesse: h };
}

// ---------------------------------------------------------------- Schild
//
// Manolo (18.08.2026): "Schilder, die man drucken und auf den Modulen
// platzieren kann." Eine flache Platte, SCHILD_DICKE mm, gerundete Ecken,
// Text buendig auf der Oberseite (Zellfarben wie das Etikett) — FLACH
// gedruckt: die Farbe liegt in den obersten Schichten, wenige Wechsel.
// Auf der Buehne liegt es auf der Flaeche, auf der es angebracht wird
// (Wanne: Front, Halter/Klemme: Rueckwand) und ragt SCHILD_DICKE vor. Es
// wird eine EIGENE Druckdatei (schild_n.3mf) — die Kundschaft klebt es auf
// (doppelseitiges Klebeband / Sekundenkleber; Halterungen am Modul kommen
// spaeter, wenn sich zeigt, dass Kleben nicht reicht).
//
// Rueckgabe { geo, farben, groesse, breite, hoehe, o, u, v, n }:
//   geo im MODULRAUM (aufgesetzt) fuer die Buehne; der Export legt es ueber
//   schildFlach() flach hin (u -> x, v -> y, n -> z).
const SCHILD_DICKE = 1.2, SCHILD_RAND = 1.5, SCHILD_ECKE = 1.5;
export function schild(f, p, text, groesse, farbeText, farbeSchild) {
  const txt = (text || '').trim().slice(0, 20);
  if (!txt || !f.schildflaeche) return null;
  return gemerkt('S' + f.id + JSON.stringify(p) + '|' + txt + '|' + groesse + '|' + farbeText + '|' + farbeSchild, () => schildBauen(f, p, txt, groesse, farbeText, farbeSchild));
}
function schildBauen(f, p, txt, groesse, farbeText, farbeSchild) {
  const pl = f.schildflaeche(p);
  if (!pl) return null;
  const maxH = Math.min(12, pl.hoehe - 2 * SCHILD_RAND);
  let h = groesse > 0 ? Math.min(groesse, maxH) : maxH;
  let mk = null;
  for (; h >= 4; h -= 0.5) { mk = textMaske(txt, h, Math.max(0.3, h / 22)); if (mk && mk.w + 2 * SCHILD_RAND <= pl.breite && mk.h + 2 * SCHILD_RAND <= pl.hoehe) break; mk = null; }
  if (!mk) return null;
  const bw = mk.w + 2 * SCHILD_RAND, bh = mk.h + 2 * SCHILD_RAND;
  const u = new THREE.Vector3(...pl.u).normalize(), v = new THREE.Vector3(...pl.v).normalize(), n = new THREE.Vector3(...pl.n).normalize();
  if (new THREE.Vector3().crossVectors(u, v).dot(n) < 0) v.negate();
  const o = new THREE.Vector3(...pl.o);
  const P = (a, b, c) => [o.x + a * u.x + b * v.x + c * n.x, o.y + a * u.y + b * v.y + c * n.y, o.z + a * u.z + b * v.z + c * n.z];
  const pos = [], farben = [];
  const tri = (A, B, C, farbe) => { pos.push(...A, ...B, ...C); farben.push(farbe); };
  const c0 = 0, c1 = SCHILD_DICKE;
  // Oberseite: Rand als grosse Zellen, Text als Raster; die Randzellen an
  // den vier Ecken lassen wir gerundet aussehen, indem die Kontur der
  // Platte (Rand-Ring + Seiten) als gerundetes Rechteck gebaut wird und die
  // Textflaeche als Raster darin liegt. Einfach und wasserdicht: der
  // Rand-Ring wird ueber die Randpunkte des Rasters und die Konturpunkte
  // trianguliert (ShapeUtils, Loch = Rasterrechteck).
  const xs = [-mk.w / 2]; for (let i = 1; i <= mk.cols; i++) xs.push(-mk.w / 2 + i * mk.res);
  const ys = [-mk.h / 2]; for (let j = 1; j <= mk.rows; j++) ys.push(-mk.h / 2 + j * mk.res);
  for (let j = 0; j < mk.rows; j++) for (let i = 0; i < mk.cols; i++) {
    const farbe = mk.drin(i, j) ? farbeText : farbeSchild;
    tri(P(xs[i], ys[j], c1), P(xs[i + 1], ys[j], c1), P(xs[i + 1], ys[j + 1], c1), farbe);
    tri(P(xs[i], ys[j], c1), P(xs[i + 1], ys[j + 1], c1), P(xs[i], ys[j + 1], c1), farbe);
  }
  // Aussenkontur (gerundetes Rechteck) als Punktliste, gegen den Uhrzeigersinn
  const kontur = [];
  const R = Math.min(SCHILD_ECKE, SCHILD_RAND - 0.1), seg = 5;
  const ecke = (cx, cy, a0) => { for (let k = 0; k <= seg; k++) { const a = a0 + (k / seg) * Math.PI / 2; kontur.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); } };
  ecke(bw / 2 - R, -bh / 2 + R, -Math.PI / 2); ecke(bw / 2 - R, bh / 2 - R, 0); ecke(-bw / 2 + R, bh / 2 - R, Math.PI / 2); ecke(-bw / 2 + R, -bh / 2 + R, Math.PI);
  // Loch = Rasterrand (alle Randpunkte, gegen den Uhrzeigersinn)
  const loch = [];
  for (let i = 0; i < mk.cols; i++) loch.push([xs[i], ys[0]]);
  for (let j = 0; j < mk.rows; j++) loch.push([xs[mk.cols], ys[j]]);
  for (let i = mk.cols; i > 0; i--) loch.push([xs[i], ys[mk.rows]]);
  for (let j = mk.rows; j > 0; j--) loch.push([xs[0], ys[j]]);
  const V2 = (q) => new THREE.Vector2(q[0], q[1]);
  const ringTris = THREE.ShapeUtils.triangulateShape(kontur.map(V2), [loch.map(V2)]);
  const alle = kontur.concat(loch);
  for (const [a, b, c] of ringTris) tri(P(alle[a][0], alle[a][1], c1), P(alle[b][0], alle[b][1], c1), P(alle[c][0], alle[c][1], c1), farbeSchild);
  // Unterseite: gleiche Kontur, ohne Loch, Faecher um die Mitte (Normale -n)
  const M0 = P(0, 0, c0);
  for (let i = 0; i < kontur.length; i++) { const a = kontur[i], b = kontur[(i + 1) % kontur.length]; tri(M0, P(b[0], b[1], c0), P(a[0], a[1], c0), farbeSchild); }
  // Mantel
  for (let i = 0; i < kontur.length; i++) {
    const a = kontur[i], b = kontur[(i + 1) % kontur.length];
    tri(P(a[0], a[1], c0), P(b[0], b[1], c0), P(b[0], b[1], c1), farbeSchild);
    tri(P(a[0], a[1], c0), P(b[0], b[1], c1), P(a[0], a[1], c1), farbeSchild);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const col = new Float32Array(pos.length);
  const cc = new THREE.Color();
  farben.forEach((fb, i) => { cc.set(fb); for (let k = 0; k < 3; k++) { col[i * 9 + k * 3] = cc.r; col[i * 9 + k * 3 + 1] = cc.g; col[i * 9 + k * 3 + 2] = cc.b; } });
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return { geo, farben, groesse: h, breite: bw, hoehe: bh, o: pl.o, u: [u.x, u.y, u.z], v: [v.x, v.y, v.z], n: [n.x, n.y, n.z] };
}

/** Matrix, die ein Schild aus dem Modulraum FLACH aufs Bett legt: u -> +x,
 *  v -> +y, n -> +z, Unterseite auf z=0, Mitte bei (0,0). */
export function schildFlach(s) {
  const o = new THREE.Vector3(...s.o), u = new THREE.Vector3(...s.u), v = new THREE.Vector3(...s.v), n = new THREE.Vector3(...s.n);
  // Basis (u v n) -> Welt: M = [u v n]; wir brauchen die Inverse (= Transponierte, orthonormal)
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
  const teile = [];
  const zN = HAKEN_TIEFE - 3.0, zH = HAKEN_TIEFE;          // Zunge: z 5.15..8.15
  const ySpitze = -7.0;                                     // ZUNGE_LAENGE
  for (const h of hakenListe) {
    const x = -h.dx * RASTER, y0 = yUnten;
    const yTop = ySpitze + 0.3 + h.dy * REIHEN_TEILUNG;
    const saeule = new THREE.BoxGeometry(HALS_BREITE, yTop - y0, zH - zN);
    saeule.translate(x, (yTop + y0) / 2, (zN + zH) / 2);
    teile.push(saeule);
    const fuss = new THREE.BoxGeometry(HALS_BREITE, 0.6, zH + 0.2);
    fuss.translate(x, y0 + 0.3, (zH - 0.2) / 2);
    teile.push(fuss);
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
