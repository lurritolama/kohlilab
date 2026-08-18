// Skadis-Raster — die eine Quelle der Wahrheit fuer Buehne, Einrasten und
// Kollision. Alle Masse aus Projekt-Daten/kohlilab-skadis/haken.py, dort an
// Manolos echter Platte vermessen (17.08.2026). Wer hier etwas aendert,
// aendert es auch dort — die beiden muessen deckungsgleich bleiben, denn
// haken.py erzeugt die Druckgeometrie, dieses Modul die Anzeige.
//
// GRUNDSATZ (Brief §3): Intern wird in RASTEREINHEITEN gerechnet, nicht in
// Millimetern. Ein Modul sitzt an einer Lochspalte/-reihe und ist n Loecher
// breit; Millimeter entstehen erst hier, beim Zeichnen und beim Generieren.
//
// Das Muster: Reihen alle 20 mm; jede zweite Reihe ist um 20 mm seitlich
// versetzt. Innerhalb einer Reihe stehen die Loecher 40 mm auseinander. Zwei
// ineinandergeschobene 40x40-Gitter — nicht "zwei Reihenabstaende", wie der
// Brief es nannte; das war die Vermutung vor dem Nachmessen.

export const SCHLITZ_BREITE = 5.0;
export const SCHLITZ_HOEHE = 15.0;
export const PLATTE_DICKE = 5.0;
export const RASTER = 40.0;          // Loecher einer Reihe
export const REIHEN_TEILUNG = 20.0;  // Reihenabstand; jede 2. Reihe um 20 versetzt
export const RAND_SEITE = 18.0;      // Plattenrand -> Lochkante (Manolo, 36x56)
export const RAND_OBEN = 13.0;
export const RAND_UNTEN = 13.0;

// Der eingefrorene Haken (S70), soweit die Anzeige ihn braucht:
export const HAKEN_TIEFE = 8.15;     // hinter der Modulrueckseite
export const HAKEN_BREITE = 4.5;

// IKEA-Sortiment Schweiz, verifiziert 15.08.2026. Der Tischaufsteller 56x37
// ist bewusst NICHT dabei (Manolo hat nicht entschieden); die Doppelplatten
// sind zwei Bretter buendig nebeneinander.
export const PLATTEN = [
  { id: '36x56',   name: '36 × 56 cm',            breite: 360, hoehe: 560, teile: 1 },
  { id: '56x56',   name: '56 × 56 cm',            breite: 560, hoehe: 560, teile: 1 },
  { id: '76x56',   name: '76 × 56 cm',            breite: 760, hoehe: 560, teile: 1 },
  { id: '2x36x56', name: '2 × (36 × 56) nebeneinander', breite: 720, hoehe: 560, teile: 2 },
  { id: '2x56x56', name: '2 × (56 × 56) nebeneinander', breite: 1120, hoehe: 560, teile: 2 },
  { id: '2x76x56', name: '2 × (76 × 56) nebeneinander', breite: 1520, hoehe: 560, teile: 2 },
];

export const PLATTENFARBEN = [
  { id: 'weiss',   name: 'Weiss',   hex: 0xf1f0ec, loch: 0x9c9b96 },
  { id: 'schwarz', name: 'Schwarz', hex: 0x2a2b2e, loch: 0x0e0f11 },
  { id: 'holz',    name: 'Holz',    hex: 0xd6b58a, loch: 0x8a6d47 },
];

/**
 * Alle Loecher einer Platte als Rasterkoordinaten UND Millimeter.
 *
 * Rasterkoordinaten: `spalte` zaehlt Loecher einer Reihe (0..), `reihe`
 * zaehlt Reihen (0..). Wegen des Versatzes hat jede Reihe ihre eigene
 * Spaltenlage — deshalb tragen die Loecher zusaetzlich `x`/`y` in mm,
 * gemessen von der Plattenecke links oben (x nach rechts, y nach unten).
 *
 * Bei Doppelplatten wird das Muster je Brett wiederholt: die zweite Platte
 * hat wieder 18 mm Rand — zwischen den Brettern liegt also ein 36-mm-
 * Streifen ohne Loecher, exakt wie in echt.
 */
export function loecher(platte) {
  // RUNDUM SYMMETRISCH, wie das Original: der Rand ist links wie rechts,
  // oben wie unten derselbe (Manolo, 17.08.2026). Deshalb wird nicht von
  // einer Ecke aus gezaehlt, sondern das Muster um die Brettmitte gelegt.
  // Volle Reihen (gerade Index) haben ein Loch mehr als versetzte; die
  // versetzte beginnt 20 mm weiter innen. Deckungsgleich mit haken.py.
  const aus = [];
  const einzelBreite = platte.breite / platte.teile;
  const xRand = RAND_SEITE + SCHLITZ_BREITE / 2;      // 20.5: aeusserste Lochmitte
  const yRand = RAND_OBEN + SCHLITZ_HOEHE / 2;        // 20.5

  const nReihen = Math.round((platte.hoehe - 2 * yRand) / REIHEN_TEILUNG) + 1;
  const y0 = (platte.hoehe - (nReihen - 1) * REIHEN_TEILUNG) / 2;
  const nVoll = Math.round((einzelBreite - 2 * xRand) / RASTER) + 1;
  const x0Voll = (einzelBreite - (nVoll - 1) * RASTER) / 2;
  const x0Versetzt = x0Voll + REIHEN_TEILUNG;
  const nVersetzt = nVoll - 1;

  for (let reihe = 0; reihe < nReihen; reihe++) {
    const y = y0 + reihe * REIHEN_TEILUNG;
    const voll = reihe % 2 === 0;
    const n = voll ? nVoll : nVersetzt;
    const x0 = voll ? x0Voll : x0Versetzt;
    for (let brett = 0; brett < platte.teile; brett++) {
      const links = brett * einzelBreite;
      for (let spalte = 0; spalte < n; spalte++) {
        aus.push({ reihe, spalte, brett, x: links + x0 + spalte * RASTER, y });
      }
    }
  }
  return aus;
}

/** Anzahl Reihen und Loecher je Reihe — fuer die Anzeige. */
export function rasterInfo(platte) {
  const alle = loecher(platte);
  const reihen = new Set(alle.map((l) => l.reihe)).size;
  const jeReihe = alle.filter((l) => l.reihe === 0).length;
  return { reihen, jeReihe, gesamt: alle.length };
}

/**
 * Naechstes Loch zu einem Millimeter-Punkt — das "magnetische Einrasten".
 * Gibt null zurueck, wenn der Punkt weiter als `maxAbstand` vom naechsten
 * Loch entfernt ist (Modul liegt neben der Platte).
 */
export function naechstesLoch(platte, x, y, maxAbstand = RASTER) {
  let best = null, bestD = Infinity;
  for (const l of loecher(platte)) {
    const d = Math.hypot(l.x - x, l.y - y);
    if (d < bestD) { bestD = d; best = l; }
  }
  return bestD <= maxAbstand ? best : null;
}
