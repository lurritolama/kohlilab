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
// Spezial-Einsätze sind anspruchsvoll und langwierig (Manolo 10.08.2026):
// langsam, fehleranfällig, blockieren die Maschine überproportional.
const FEIN_RP_H = 450;          // 4.50 CHF je Feindruck-Stunde
// Steckstifte (09.08.2026): Zapfen werden separat LIEGEND gedruckt statt als
// stehende Türme — der Feindruck-Aufwand entfällt fast ganz. Bleibt: etwas
// Bett-Belegung, Aufnahme-Kuppeln, Beutel + 10 % Ersatzstifte.
const GARN_MIN_JE_ZAPFEN = 1.5; // min je Steck-Zapfen (liegend, inkl. Ersatz)
const MIN_JE_SPEZIALFACH = 45;  // pauschal je Fach mit anderem Spezial-Einsatz
// Beschriftung: groessere Schrift = mehr Flaeche, mehr Farbwechsel, laengere
// Druckzeit. Grundbetrag je beschriftetem Fach + Zuschlag je mm ueber 4 mm.
const TEXT_RP_JE_FACH = 200;    // 2.— je beschriftetem Fach
const TEXT_RP_JE_MM = 40;       // 0.40 je mm Schrifthoehe ueber 4 mm
// Ausfallquote: misslungene Drucke kosten Material, Maschinenzeit und
// Nacharbeit. Aufschlag NUR auf die Druckkosten — Grundpreis und
// Modulzuschlag fallen bei einem Fehldruck nicht doppelt an.
const AUSFALL = 0.08;           // 8 %

/**
 * Lochwand-Planer (Skådis-Module): EINE Wand = ein Auftrag. Spiegelt exakt
 * public/lochwand-app/preis.js (dort steht die Begründung): Grundpreis
 * einmal je Wand, 2.— je Zusatzmodul, Filament + Maschine + 8 % Ausfall,
 * min 12.—, Rundung 0.50. Farbe je Modul kostet nichts. `module` = Anzahl
 * Druckdateien; `gramm` = serverseitig gemessen (inkl. Abbrechstützen —
 * die druckt Manolo mit, sie kosten Material).
 */
const LOCHWAND_JE_MODUL_RP = 500;     // 5.— je Zusatzmodul (Manolo 18.08.2026)
const LOCHWAND_SCHILD_RP = 250;       // 2.50 je aufgesetztem Schild (Vorschlag, nach Drucktest bestaetigen)
export function lochwandPreisRappen(o: { gramm: number; module: number; textModule?: number; textMmUeber4?: number; schilder?: number }): number {
  const module = Math.min(200, Math.max(1, Math.round(o.module)));
  // Beschriftung: Kennzahlen kommen vom Client (Schrifthoehe laesst sich aus
  // dem 3MF nicht messen) — nach unten auf 0, nach oben auf die Modulzahl bzw.
  // grosszuegig gekappt. Saetze wie beim Organizer.
  const textModule = Math.min(module, Math.max(0, Math.round(o.textModule ?? 0)));
  const textMm = Math.min(2000, Math.max(0, o.textMmUeber4 ?? 0));
  const schilder = Math.min(module, Math.max(0, Math.round(o.schilder ?? 0)));
  const text = textModule * TEXT_RP_JE_FACH + textMm * TEXT_RP_JE_MM + schilder * LOCHWAND_SCHILD_RP;
  const material = o.gramm * FILAMENT_RP_G;
  const maschine = (o.gramm / 25) * MASCHINE_RP_H;
  const druck = (material + maschine) * (1 + AUSFALL);
  const roh = 950 + druck + (module - 1) * LOCHWAND_JE_MODUL_RP + text;
  return Math.max(1200, Math.ceil(roh / 50) * 50);
}

/**
 * Golf-Tee (aus TeeLab uebernommen, Manolo 19.08.2026: Preise 1:1):
 * Stueckpreis = min(1.10 + 0.30 x Farben, 2.00); das Auge hat drei feste
 * Farben. Menge ab 10 in 10er-Schritten.
 */
export const TEE_MIN_MENGE = 10, TEE_MENGE_SCHRITT = 10;
export function teeFarben(konfig: { headType?: string; numColors?: number }): number {
  if (konfig.headType === 'eye') return 3;
  const n = Number(konfig.numColors);
  return Number.isFinite(n) ? Math.min(3, Math.max(1, Math.round(n))) : 1;
}
export function teeStueckRappen(konfig: { headType?: string; numColors?: number }): number {
  return Math.min(110 + 30 * teeFarben(konfig), 200);
}
export function teeMengeGueltig(menge: unknown): menge is number {
  const m = Number(menge);
  return Number.isInteger(m) && m >= TEE_MIN_MENGE && m % TEE_MENGE_SCHRITT === 0;
}

/** Organizer: eine individuelle Wanne, Menge immer 1. */
export function organizerPreisRappen(o: {
  gramm: number; module: number; hatText: boolean;
  zapfen?: number; spezialFaecher?: number;
  textFaecher?: number; textMmUeber4?: number;
}): number {
  // Zählwerte kommen vom Client: nach unten auf 0 klemmen (negativ würde den
  // Preis drücken), nach oben grosszügig kappen. Manolo sieht jede Bestellung
  // samt 3MF vor dem Druck — grobe Untertreibung fiele dort auf.
  const zapfen = Math.min(2000, Math.max(0, Math.round(o.zapfen ?? 0)));
  const spezialFaecher = Math.min(200, Math.max(0, Math.round(o.spezialFaecher ?? 0)));
  // Beschriftung: Schriftgroesse kann der Server nicht aus dem 3MF messen —
  // Kennzahlen kommen vom Client und werden gekappt. Ohne Angaben faellt es
  // auf den alten Pauschalbetrag zurueck (aeltere Warenkoerbe).
  const textFaecher = Math.min(200, Math.max(0, Math.round(o.textFaecher ?? 0)));
  const textMm = Math.min(2000, Math.max(0, o.textMmUeber4 ?? 0));
  const text = textFaecher > 0
    ? textFaecher * TEXT_RP_JE_FACH + textMm * TEXT_RP_JE_MM
    : (o.hatText ? 300 : 0);
  const material = o.gramm * FILAMENT_RP_G;
  const maschine = (o.gramm / 25) * MASCHINE_RP_H;              // ~25 g/h
  const fein = ((zapfen * GARN_MIN_JE_ZAPFEN + spezialFaecher * MIN_JE_SPEZIALFACH) / 60) * FEIN_RP_H;
  const risiko = (material + maschine + fein) * AUSFALL;
  const roh = 950 + material + maschine + fein + risiko
            + Math.max(0, o.module - 1) * 500 + text;
  return Math.max(1600, Math.ceil(roh / 50) * 50);             // min 16.–, Rundung 0.50
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
