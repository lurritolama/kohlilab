/**
 * Offerte fuer Spezialanfertigungen — gemeinsame Form von Admin und
 * Kundenseite.
 *
 * Gerechnet wird ausschliesslich im Admin (munsby): dort entstehen die
 * Betraege, und sie werden fertig in die Datenbank geschrieben. Diese Seite
 * hier STELLT NUR DAR. So kann die Kundenseite nie eine andere Zahl zeigen
 * als die, die Manolo beim Erstellen gesehen und verschickt hat — auch nicht,
 * wenn sich ein Ansatz spaeter aendert.
 *
 * Betraege sind wie ueberall im Projekt in Rappen und ganzzahlig. Einzige
 * Ausnahme: `ansatzRappen` darf gebrochen sein — ein Grammpreis von
 * CHF 0.045 ist 4.5 Rappen, und den auf 5 zu runden waere bei 800 g ein
 * Unterschied von CHF 4.—.
 */

export type PositionsArt = 'material' | 'maschine' | 'vorbereitung' | 'nachbearbeitung' | 'frei';

export interface OffertePosition {
  art: PositionsArt;
  /** Sichtbarer Text, z. B. „PLA schwarz" oder „Modellierung & Slicing". */
  bezeichnung: string;
  /** Gramm bzw. Stunden. Bei `frei` ohne Bedeutung. */
  menge: number;
  einheit: 'g' | 'h' | '';
  /** Preis je Gramm bzw. je Stunde, in Rappen (darf gebrochen sein). */
  ansatzRappen: number;
  betragRappen: number;
}

// Genau die vier Werte aus der Datenbank. «Abgelaufen» ist bewusst KEIN
// Status: das ergibt sich aus gueltigBis und dem heutigen Datum
// (istAbgelaufen) — gespeichert wird es nie.
export type OffertenStatus = 'entwurf' | 'versendet' | 'angenommen' | 'abgelehnt';

export interface Offerte {
  offerNumber: string;
  status: OffertenStatus;
  /** ISO-Datum der Erstellung bzw. des Versands. */
  datum: string;
  /** ISO-Datum, bis und mit dem die Offerte gilt. */
  gueltigBis: string;
  kundeName: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  email: string;
  titel: string;
  beschreibung: string;
  bemerkung: string;
  stueckzahl: number;
  /** Bild der Anfertigung — Rendering oder Foto. Optional, oft noch nicht da. */
  bildUrl: string | null;
  positionen: OffertePosition[];
  versandLabel: string;
  versandRappen: number;
  subtotalRappen: number;
  totalRappen: number;
  /** Gesetzt, sobald zugesagt wurde — dann gibt es dazu eine Bestellung. */
  orderNumber: string | null;
}

const CHF = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Rappen -> „CHF 12.00". */
export function franken(rappen: number): string {
  return 'CHF ' + CHF.format(rappen / 100);
}

/**
 * Ansaetze brauchen mehr Nachkommastellen als Betraege: ein Grammpreis
 * steht als „CHF 0.045" da, ein Stundensatz als „CHF 60.00".
 */
export function ansatz(rappen: number): string {
  const stellen = Number.isInteger(rappen) ? 2 : 3;
  return (
    'CHF ' +
    new Intl.NumberFormat('de-CH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: stellen,
    }).format(rappen / 100)
  );
}

/** „120 g × CHF 0.05/g" — bei freien Positionen bleibt die Zeile leer. */
export function rechenweg(p: OffertePosition): string {
  if (p.art === 'frei' || !p.einheit) return '';
  const menge = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(p.menge);
  return `${menge} ${p.einheit} × ${ansatz(p.ansatzRappen)}/${p.einheit}`;
}

/** ISO-Datum -> „14. August 2026". */
export function datumLang(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : ''));
  return new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/**
 * Abgelaufen ist eine Offerte am Tag NACH `gueltigBis` — der letzte Tag
 * gehoert noch der Kundschaft. Verglichen wird auf Tagesebene, damit die
 * Uhrzeit (und die Zeitzone des Servers) keine Rolle spielt.
 */
export function istAbgelaufen(o: Pick<Offerte, 'gueltigBis'>, heuteIso: string): boolean {
  return heuteIso > o.gueltigBis;
}

/**
 * Was die Kundschaft noch tun kann. `versendet` und nicht abgelaufen ist der
 * einzige Zustand, in dem die beiden Knoepfe etwas bewirken.
 */
export function istEntscheidbar(o: Pick<Offerte, 'status' | 'gueltigBis'>, heuteIso: string): boolean {
  return o.status === 'versendet' && !istAbgelaufen(o, heuteIso);
}

/** Heute als ISO-Datum (YYYY-MM-DD) in Schweizer Zeit. */
export function heuteSchweiz(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date());
}
