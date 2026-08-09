/**
 * Preiswahrheit für die KohliLab-Konfiguratoren (Rappen). Spiegelt exakt die
 * Formeln in den Konfigurator-Apps (public/*-app), wird aber SERVERSEITIG mit
 * dem aus dem 3MF gemessenen Gewicht gerechnet -> fälschungssicher.
 *
 * Manolos Sätze: Filament 30.–/kg (= 3 Rp/g), Maschine 0.50/h.
 */
const FILAMENT_RP_G = 3;        // 30 CHF/kg
const MASCHINE_RP_H = 50;       // 0.50 CHF/h
// Feindruck (Spezial-Einsätze): das Gewicht-Zeit-Modell versagt bei dünnen
// Türmen — der Lydie-Garneinsatz lief real mit 13.9 g/h statt 25. Die
// Zusatzzeit wird separat gerechnet und höher bepreist (langsam, Fehldruck-
// Risiko, Maschine überproportional blockiert).
const FEIN_RP_H = 250;          // 2.50 CHF je Feindruck-Stunde
// Steckstifte (09.08.2026): Zapfen werden separat LIEGEND gedruckt statt als
// stehende Türme — der Feindruck-Aufwand entfällt fast ganz. Bleibt: etwas
// Bett-Belegung, Aufnahme-Kuppeln, Beutel + 10 % Ersatzstifte.
const GARN_MIN_JE_ZAPFEN = 1;   // min je Steck-Zapfen (liegend, inkl. Ersatz)
const MIN_JE_SPEZIALFACH = 25;  // pauschal je Fach mit anderem Spezial-Einsatz

/** Organizer: eine individuelle Wanne, Menge immer 1. */
export function organizerPreisRappen(o: {
  gramm: number; module: number; hatText: boolean;
  zapfen?: number; spezialFaecher?: number;
}): number {
  // Zählwerte kommen vom Client: nach unten auf 0 klemmen (negativ würde den
  // Preis drücken), nach oben grosszügig kappen. Manolo sieht jede Bestellung
  // samt 3MF vor dem Druck — grobe Untertreibung fiele dort auf.
  const zapfen = Math.min(2000, Math.max(0, Math.round(o.zapfen ?? 0)));
  const spezialFaecher = Math.min(200, Math.max(0, Math.round(o.spezialFaecher ?? 0)));
  const material = o.gramm * FILAMENT_RP_G;
  const maschine = (o.gramm / 25) * MASCHINE_RP_H;              // ~25 g/h
  const fein = ((zapfen * GARN_MIN_JE_ZAPFEN + spezialFaecher * MIN_JE_SPEZIALFACH) / 60) * FEIN_RP_H;
  const roh = 900 + material + maschine + fein + Math.max(0, o.module - 1) * 500 + (o.hatText ? 300 : 0);
  return Math.max(1500, Math.ceil(roh / 50) * 50);             // min 15.–, Rundung 0.50
}

/** Schild-Rohpreis PRO STÜCK (ohne Grundpreis, ohne Staffel). */
export function schildStueckRohRappen(s: { gramm: number; zusatzFarben: number }): number {
  return s.gramm * FILAMENT_RP_G + (s.gramm / 15) * MASCHINE_RP_H + s.zusatzFarben * 200;
}

/** Schild-Gesamtpreis inkl. Grundpreis, Mengenstaffel und Stück-Minimum. */
export function schildGesamtRappen(s: { gramm: number; zusatzFarben: number; menge: number }): number {
  const n = Math.max(1, Math.round(s.menge));
  const stueckRoh = schildStueckRohRappen(s);
  const rab = n >= 10 ? 0.75 : n >= 5 ? 0.85 : 1;
  const erst = stueckRoh * rab;
  const weitere = Math.max(600, stueckRoh * rab);              // jedes weitere Schild min. 6.–
  const roh = 900 + erst + (n - 1) * weitere;
  return Math.max(1200, Math.ceil(roh / 50) * 50);            // min 12.–, Rundung 0.50
}
