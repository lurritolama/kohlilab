// Preis fuer Lochwand-Module — aus DENSELBEN Bausteinen wie der Organizer
// (src/lib/preis.ts): Filament 3 Rp/g, Maschine 0.50/h bei 25 g/h, 8 %
// Ausfall auf die Druckkosten, Grundpreis je Auftrag, Rundung auf 0.50.
//
// Was hier NEU entschieden werden musste (Brief §7 verlangt "bestehenden
// Preisrechner uebernehmen", laesst aber offen, wie eine ganze WAND
// bepreist wird — das war Frage 4 meiner Analyse):
//
//   * Grundpreis EINMAL je Wand, nicht je Modul. Eine Wand mit 15 Modulen
//     ist EIN Auftrag: eine Kontrolle, ein Paket. Je Modul kaeme der
//     Grundpreis auf 15 x 9.50 = 142.50 — das verkauft keine Wand.
//   * Je Zusatzmodul ein kleiner Zuschlag (wie beim Organizer, aber tiefer):
//     jedes Modul ist ein eigenes Druckteil mit Anlauf und Kontrolle.
//   * Farbe pro Modul (§6) kostet nichts extra: ein Modul ist einfarbig,
//     der Farbwechsel passiert zwischen Drucken, nicht im Druck.
//
// Der Server rechnet spaeter mit dem GEMESSENEN Gewicht aus dem 3MF nach
// (wie beim Organizer, faelschungssicher) — diese Datei ist die Vorlage.

export const PREIS = {
  grund: 9.5,        // CHF je Wand/Auftrag (Handling, Kontrolle, Verpackung)
  filamentKg: 30,    // CHF je kg
  stundensatz: 0.5,  // CHF je Druckstunde
  durchsatz: 25,     // g je Stunde
  jeModul: 5.0,      // CHF je Zusatzmodul (ab dem zweiten) — Manolo 18.08.2026: 5.— wie Organizer
  ausfall: 0.08,     // 8 % auf die Druckkosten
  min: 12,           // Mindestpreis je Auftrag
  // Beschriftung im Material (nur auf ebenen Flaechen, Manolo 18.08.):
  // Saetze wie beim Organizer — Farbwechsel in wenigen Schichten.
  textJeModul: 2.0,  // CHF je beschriftetem Modul (Ebene)
  textJeMm: 0.4,     // CHF je mm Schrifthoehe ueber 4 mm
  // Schild: eigenes flaches Druckteil mit Text, zum Aufsetzen. Vorschlag,
  // Manolo bestaetigt nach dem Drucktest.
  schild: 2.5,       // CHF je Schild
};

/**
 * Preis einer Wand in CHF aus den Gramm je Modul.
 * `grammListe` = ein Eintrag je Modul; `texte` = [{groesse}] je beschriftetem
 * Modul (nur die, deren Etikett wirklich Platz hat).
 */
export function wandPreis(grammListe, texte = [], schilder = 0) {
  if (!grammListe.length) return { total: 0, druck: 0, module: 0, grund: 0, text: 0 };
  const g = grammListe.reduce((s, x) => s + x, 0);
  const material = g / 1000 * PREIS.filamentKg;
  const maschine = g / PREIS.durchsatz * PREIS.stundensatz;
  const druck = (material + maschine) * (1 + PREIS.ausfall);
  const module = Math.max(0, grammListe.length - 1) * PREIS.jeModul;
  const text = texte.length * PREIS.textJeModul + texte.reduce((s, x) => s + Math.max(0, (x.groesse || 0) - 4), 0) * PREIS.textJeMm
             + (schilder || 0) * PREIS.schild;
  const roh = PREIS.grund + druck + module + text;
  const total = Math.max(PREIS.min, Math.ceil(roh / 0.5) * 0.5);
  return { total, druck, module, text, grund: PREIS.grund, gramm: g };
}

/** Anteil eines Moduls am Wandpreis — fuer die Anzeige "dieses Modul ~CHF x". */
export function modulAnteil(gramm) {
  const material = gramm / 1000 * PREIS.filamentKg;
  const maschine = gramm / PREIS.durchsatz * PREIS.stundensatz;
  return (material + maschine) * (1 + PREIS.ausfall) + PREIS.jeModul;
}

export const chf = (x) => 'CHF ' + x.toFixed(2).replace(/\.00$/, '.—');
